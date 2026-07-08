/**
 * Seeds the SQLite database with the finalized Eastern State Penitentiary KPI set.
 * Run with:  npm run db:seed
 *
 * Idempotent: drops all KPI/category/entry rows and re-creates them. Users are left
 * untouched (use the auth feature to seed the default admin/viewer on first request). All data
 * is realistic SAMPLE data for 2024–2026, clearly flagged via the meta key 'sample_data'.
 */
import { getDb } from "../src/lib/db";
import { ensureSeedAdmin } from "../src/features/auth/server";
import {
  createCategory,
  createKPI,
  listKPIs,
} from "../src/features/catalog/server";
import { upsertBreakdown, upsertEntry } from "../src/features/metrics/server";
import type { Direction, ReportingFrequency, UnitType } from "../src/lib/types";

const CURRENT_YEAR = 2026;
const THROUGH_MONTH = 6; // data is complete through June 2026

interface KpiSpec {
  slug: string;
  name: string;
  unit: string;
  unit_type: UnitType;
  reporting_frequency: ReportingFrequency;
  direction: Direction;
  description: string;
  sort_order: number;
}

interface MonthlyKpi extends KpiSpec {
  base2024: number[]; // 12 monthly values for 2024
  factor2025: number;
  factor2026: number;
}

interface AnnualKpi extends KpiSpec {
  annual: Record<number, number>; // year -> value
}

interface BreakdownKpi extends KpiSpec {
  labels: string[];
  breakdown: Record<number, Record<string, number>>; // year -> { label: value }
}

interface MonthlyBreakdownKpi extends KpiSpec {
  labels: string[];
  monthlyBreakdown: Record<number, Record<number, Record<string, number>>>; // year -> month -> { label: value }
}

interface CategorySpec {
  slug: string;
  name: string;
  description: string;
  sort_order: number;
  monthly: MonthlyKpi[];
  annual: AnnualKpi[];
  breakdown?: BreakdownKpi[];
  monthlyBreakdown?: MonthlyBreakdownKpi[];
}

function grow(base: number[], factor: number): number[] {
  return base.map((v) => Math.round(v * factor));
}

// 2026 only has data through June (months 1–6).
function monthsFor(year: number): number[] {
  const count = year === CURRENT_YEAR ? THROUGH_MONTH : 12;
  return Array.from({ length: count }, (_, index) => index + 1);
}

const CATEGORIES: CategorySpec[] = [
  {
    slug: "education",
    name: "Education",
    description: "Educational reach, professional development, and program partners.",
    sort_order: 10,
    monthly: [
      {
        slug: "video-views", name: "Video views", unit: "views", unit_type: "count",
        reporting_frequency: "monthly", direction: "higher", sort_order: 10,
        description: "Total views of Eastern State educational videos across platforms.",
        base2024: [42000, 38000, 55000, 68000, 82000, 95000, 102000, 98000, 86000, 74000, 52000, 45000],
        factor2025: 1.12, factor2026: 1.1,
      },
      {
        slug: "webpage-views", name: "Webpage views", unit: "views", unit_type: "count",
        reporting_frequency: "monthly", direction: "higher", sort_order: 20,
        description: "Total page views on the Eastern State website.",
        base2024: [120000, 108000, 145000, 178000, 210000, 232000, 245000, 238000, 198000, 176000, 138000, 118000],
        factor2025: 1.09, factor2026: 1.11,
      },
      {
        slug: "lesson-downloads", name: "Lesson downloads", unit: "downloads", unit_type: "count",
        reporting_frequency: "monthly", direction: "higher", sort_order: 30,
        description: "Downloads of Eastern State curriculum and lesson resources.",
        base2024: [1800, 1600, 2400, 3100, 3800, 4200, 4400, 4100, 3600, 2900, 2100, 1700],
        factor2025: 1.15, factor2026: 1.18,
      },
      {
        slug: "virtual-program-attendees", name: "Virtual program attendees", unit: "attendees", unit_type: "attendance",
        reporting_frequency: "monthly", direction: "higher", sort_order: 40,
        description: "Attendees of live virtual education programs.",
        base2024: [620, 560, 840, 1100, 1380, 1520, 1600, 1480, 1240, 980, 720, 580],
        factor2025: 1.14, factor2026: 1.16,
      },
      {
        slug: "states-countries-represented", name: "States and countries represented", unit: "regions", unit_type: "count",
        reporting_frequency: "monthly", direction: "higher", sort_order: 50,
        description: "Distinct U.S. states and countries represented among program participants.",
        base2024: [18, 16, 22, 28, 34, 38, 40, 37, 32, 27, 21, 17],
        factor2025: 1.08, factor2026: 1.1,
      },
      {
        slug: "teachers-in-person-pd", name: "Teachers attending in-person PDs", unit: "teachers", unit_type: "count",
        reporting_frequency: "monthly", direction: "higher", sort_order: 60,
        description: "Teachers attending in-person professional development sessions.",
        base2024: [35, 30, 48, 62, 75, 82, 78, 70, 58, 44, 32, 28],
        factor2025: 1.1, factor2026: 1.12,
      },
      {
        slug: "teachers-online-pd", name: "Teachers attending online PDs", unit: "teachers", unit_type: "count",
        reporting_frequency: "monthly", direction: "higher", sort_order: 70,
        description: "Teachers attending online professional development sessions.",
        base2024: [120, 110, 150, 190, 230, 250, 240, 220, 180, 150, 130, 115],
        factor2025: 1.13, factor2026: 1.15,
      },
      {
        slug: "conferences-es-presence", name: "State/national conferences with ES presence", unit: "conferences", unit_type: "count",
        reporting_frequency: "monthly", direction: "higher", sort_order: 80,
        description: "State and national conferences where Eastern State presented or exhibited.",
        base2024: [2, 1, 3, 4, 5, 6, 6, 5, 4, 3, 2, 1],
        factor2025: 1.12, factor2026: 1.1,
      },
      {
        slug: "education-overall-attendance", name: "Overall attendance in education programs", unit: "attendees", unit_type: "attendance",
        reporting_frequency: "monthly", direction: "higher", sort_order: 90,
        description: "Total attendance across all on-site and virtual education programs.",
        base2024: [2100, 1900, 2800, 3600, 4400, 4900, 5100, 4700, 3900, 3100, 2400, 2000],
        factor2025: 1.1, factor2026: 1.12,
      },
    ],
    annual: [
      {
        slug: "educational-program-partners", name: "Educational/program partners", unit: "partners", unit_type: "count",
        reporting_frequency: "annual", direction: "higher", sort_order: 85,
        description: "Active educational and program partner organizations.",
        annual: { 2024: 42, 2025: 48, 2026: 53 },
      },
    ],
  },

  {
    slug: "adult-programs",
    name: "Adult Programs",
    description: "Speaker programs and digital content for adult audiences.",
    sort_order: 20,
    monthly: [
      {
        slug: "speaker-onsite", name: "Speaker program attendance onsite", unit: "attendees", unit_type: "attendance",
        reporting_frequency: "monthly", direction: "higher", sort_order: 10,
        description: "Attendance at on-site speaker programs.",
        base2024: [180, 160, 240, 320, 400, 460, 480, 440, 360, 280, 210, 170],
        factor2025: 1.08, factor2026: 1.1,
      },
      {
        slug: "speaker-online", name: "Speaker program attendance online", unit: "attendees", unit_type: "attendance",
        reporting_frequency: "monthly", direction: "higher", sort_order: 20,
        description: "Attendance at online/virtual speaker programs.",
        base2024: [320, 300, 420, 540, 640, 720, 760, 700, 580, 460, 360, 310],
        factor2025: 1.15, factor2026: 1.2,
      },
      {
        slug: "youtube-views", name: "YouTube views of videos", unit: "views", unit_type: "count",
        reporting_frequency: "monthly", direction: "higher", sort_order: 30,
        description: "Views of Eastern State videos on YouTube.",
        base2024: [28000, 25000, 36000, 44000, 54000, 62000, 66000, 60000, 50000, 42000, 32000, 27000],
        factor2025: 1.18, factor2026: 1.22,
      },
    ],
    annual: [],
  },

  {
    slug: "workforce-development",
    name: "Workforce Development",
    description: "Workforce training cohorts, outcomes, and community partnerships.",
    sort_order: 30,
    monthly: [
      {
        slug: "open-call-participants", name: "Participants in open call event", unit: "participants", unit_type: "count",
        reporting_frequency: "monthly", direction: "higher", sort_order: 10,
        description: "Participants in workforce open call events.",
        base2024: [45, 40, 60, 78, 92, 100, 96, 84, 68, 52, 40, 38],
        factor2025: 1.12, factor2026: 1.15,
      },
    ],
    annual: [
      {
        slug: "percent-completing", name: "Percent of participants completing program", unit: "%", unit_type: "percent",
        reporting_frequency: "annual", direction: "higher", sort_order: 20,
        description: "Share of enrolled participants who complete the workforce program.",
        annual: { 2024: 78, 2025: 82, 2026: 84 },
      },
      {
        slug: "programs-offered", name: "Programs offered", unit: "programs", unit_type: "count",
        reporting_frequency: "annual", direction: "higher", sort_order: 25,
        description: "Number of distinct workforce programs offered in the year.",
        annual: { 2024: 6, 2025: 7, 2026: 8 },
      },
      {
        slug: "percent-job-placement-completion", name: "Percent job placement at program completion", unit: "%", unit_type: "percent",
        reporting_frequency: "annual", direction: "higher", sort_order: 30,
        description: "Share of graduates placed in jobs at program completion.",
        annual: { 2024: 62, 2025: 68, 2026: 71 },
      },
      {
        slug: "percent-job-placement-1yr", name: "Percent job placement 1 year post-graduation", unit: "%", unit_type: "percent",
        reporting_frequency: "annual", direction: "higher", sort_order: 40,
        description: "Share of graduates still employed one year after graduation.",
        annual: { 2024: 55, 2025: 60, 2026: 63 },
      },
      {
        slug: "percent-female", name: "Percent female", unit: "%", unit_type: "percent",
        reporting_frequency: "annual", direction: "neutral", sort_order: 50,
        description: "Share of program participants who identify as female.",
        annual: { 2024: 34, 2025: 36, 2026: 37 },
      },
      {
        slug: "percent-justice-impacted", name: "Percent justice impacted", unit: "%", unit_type: "percent",
        reporting_frequency: "annual", direction: "neutral", sort_order: 60,
        description: "Share of participants who are justice-impacted.",
        annual: { 2024: 58, 2025: 60, 2026: 61 },
      },
      {
        slug: "workforce-community-partners", name: "Community partners", unit: "partners", unit_type: "count",
        reporting_frequency: "annual", direction: "higher", sort_order: 70,
        description: "Active community partner organizations in workforce programs.",
        annual: { 2024: 14, 2025: 17, 2026: 19 },
      },
      {
        slug: "workforce-awareness", name: "Awareness of workforce programs", unit: "%", unit_type: "percent",
        reporting_frequency: "annual", direction: "higher", sort_order: 80,
        description: "Surveyed awareness of Eastern State workforce programs in the community.",
        annual: { 2024: 22, 2025: 28, 2026: 31 },
      },
    ],
  },

  {
    slug: "preservation",
    name: "Preservation",
    description: "Site preservation, collection stewardship, and field leadership.",
    sort_order: 40,
    monthly: [
      {
        slug: "preservation-articles", name: "Articles on Eastern State preservation work", unit: "articles", unit_type: "count",
        reporting_frequency: "monthly", direction: "higher", sort_order: 10,
        description: "Articles and features about Eastern State preservation work.",
        base2024: [4, 3, 6, 8, 9, 10, 11, 9, 7, 6, 5, 4],
        factor2025: 1.14, factor2026: 1.18,
      },
    ],
    annual: [
      {
        slug: "percent-site-triage", name: "Percent of site in triage", unit: "%", unit_type: "percent",
        reporting_frequency: "annual", direction: "lower", sort_order: 20,
        description: "Share of the historic site requiring triage-level stabilization. Lower is better.",
        annual: { 2024: 38, 2025: 34, 2026: 31 },
      },
      {
        slug: "preservation-conferences", name: "Conferences presented", unit: "conferences", unit_type: "count",
        reporting_frequency: "annual", direction: "higher", sort_order: 30,
        description: "Preservation conferences where Eastern State staff presented.",
        annual: { 2024: 5, 2025: 7, 2026: 8 },
      },
      {
        slug: "collection-items", name: "Items in collection", unit: "items", unit_type: "count",
        reporting_frequency: "annual", direction: "higher", sort_order: 40,
        description: "Total cataloged items in the Eastern State collection.",
        annual: { 2024: 8400, 2025: 9100, 2026: 9600 },
      },
      {
        slug: "percent-collection-online", name: "Percent of items in collection available online", unit: "%", unit_type: "percent",
        reporting_frequency: "annual", direction: "higher", sort_order: 50,
        description: "Share of collection items accessible through the online catalog.",
        annual: { 2024: 42, 2025: 48, 2026: 53 },
      },
    ],
  },

  {
    slug: "museum",
    name: "Museum",
    description: "On-site visitation, school programming, and festival reach.",
    sort_order: 50,
    monthly: [
      {
        slug: "museum-attendance", name: "Overall museum attendance", unit: "visitors", unit_type: "attendance",
        reporting_frequency: "monthly", direction: "higher", sort_order: 10,
        description: "Total on-site museum visitation.",
        base2024: [3200, 2800, 5200, 8400, 11200, 12800, 13400, 12600, 9800, 7400, 4200, 3000],
        factor2025: 1.06, factor2026: 1.08,
      },
      {
        slug: "school-groups-attendance", name: "School groups attendance", unit: "students", unit_type: "attendance",
        reporting_frequency: "monthly", direction: "higher", sort_order: 20,
        description: "Students visiting with school groups.",
        base2024: [800, 650, 2400, 3800, 4800, 5200, 5400, 4900, 4200, 3100, 1200, 700],
        factor2025: 1.05, factor2026: 1.07,
      },
      {
        slug: "virtual-exhibit-participants", name: "Virtual exhibit participants", unit: "participants", unit_type: "attendance",
        reporting_frequency: "monthly", direction: "higher", sort_order: 30,
        description: "Participants in virtual exhibits and online tours.",
        base2024: [1200, 1100, 1600, 2100, 2600, 2900, 3000, 2700, 2200, 1800, 1400, 1150],
        factor2025: 1.12, factor2026: 1.15,
      },
      {
        slug: "festival-attendees", name: "Festival attendees", unit: "attendees", unit_type: "attendance",
        reporting_frequency: "monthly", direction: "higher", sort_order: 40,
        description: "Attendance at Eastern State festivals (summer and fall).",
        base2024: [0, 0, 0, 0, 0, 5400, 0, 0, 0, 4200, 0, 0],
        factor2025: 1.1, factor2026: 1.12,
      },
      {
        slug: "media-mentions-festival", name: "Media mentions during festival", unit: "mentions", unit_type: "count",
        reporting_frequency: "monthly", direction: "higher", sort_order: 50,
        description: "Media mentions generated during festival periods.",
        base2024: [0, 0, 0, 0, 0, 48, 0, 0, 0, 36, 0, 0],
        factor2025: 1.15, factor2026: 1.18,
      },
    ],
    annual: [
      {
        slug: "festivals-partner-sponsors", name: "Festivals with partner sponsors", unit: "festivals", unit_type: "count",
        reporting_frequency: "annual", direction: "higher", sort_order: 60,
        description: "Festivals that secured at least one partner sponsor.",
        annual: { 2024: 3, 2025: 4, 2026: 5 },
      },
    ],
  },

  {
    slug: "general-awareness",
    name: "General Awareness",
    description: "Public presence, media coverage, and speaking engagements.",
    sort_order: 60,
    monthly: [
      {
        slug: "public-events-speaker", name: "Public events team participated in as speaker", unit: "events", unit_type: "count",
        reporting_frequency: "monthly", direction: "higher", sort_order: 10,
        description: "Public events where Eastern State staff spoke or presented.",
        base2024: [6, 5, 8, 10, 12, 13, 12, 11, 10, 9, 7, 6],
        factor2025: 1.1, factor2026: 1.12,
      },
      {
        slug: "broadcast-interviews", name: "Broadcast/streaming/radio/podcast interviews", unit: "interviews", unit_type: "count",
        reporting_frequency: "monthly", direction: "higher", sort_order: 20,
        description: "Broadcast, streaming, radio, and podcast interviews featuring Eastern State.",
        base2024: [9, 8, 11, 13, 15, 16, 15, 14, 12, 11, 9, 8],
        factor2025: 1.12, factor2026: 1.14,
      },
      {
        slug: "print-online-mentions", name: "Print/online mentions of Eastern State", unit: "mentions", unit_type: "count",
        reporting_frequency: "monthly", direction: "higher", sort_order: 30,
        description: "Print and online media mentions of Eastern State.",
        base2024: [22, 20, 28, 34, 40, 44, 42, 38, 32, 28, 24, 21],
        factor2025: 1.1, factor2026: 1.12,
      },
      {
        slug: "overall-media-hits", name: "Overall media hits", unit: "hits", unit_type: "count",
        reporting_frequency: "monthly", direction: "higher", sort_order: 40,
        description: "Total media hits across all channels.",
        base2024: [38, 34, 46, 56, 66, 72, 68, 62, 52, 46, 40, 36],
        factor2025: 1.11, factor2026: 1.13,
      },
    ],
    annual: [],
  },

  {
    slug: "fundraising",
    name: "Fundraising",
    description: "Donor cultivation, board engagement, and funder breakdowns.",
    sort_order: 70,
    monthly: [],
    annual: [
      {
        slug: "individual-donors", name: "Number of overall individual donors", unit: "donors", unit_type: "count",
        reporting_frequency: "annual", direction: "higher", sort_order: 20,
        description: "Total individual donors in the year.",
        annual: { 2024: 1820, 2025: 2140, 2026: 2380 },
      },
      {
        slug: "percent-revenue-development", name: "Percent of overall revenue from development", unit: "%", unit_type: "percent",
        reporting_frequency: "annual", direction: "higher", sort_order: 30,
        description: "Share of total organizational revenue from development.",
        annual: { 2024: 54, 2025: 58, 2026: 61 },
      },
      {
        slug: "percent-board-engagement", name: "Percent of board engagement", unit: "%", unit_type: "percent",
        reporting_frequency: "annual", direction: "higher", sort_order: 60,
        description: "Share of board members actively engaged.",
        annual: { 2024: 72, 2025: 78, 2026: 81 },
      },
      {
        slug: "percent-board-giving", name: "Percent of board giving", unit: "%", unit_type: "percent",
        reporting_frequency: "annual", direction: "higher", sort_order: 70,
        description: "Share of board members who made a financial contribution.",
        annual: { 2024: 88, 2025: 92, 2026: 94 },
      },
      {
        slug: "corporate-sponsorships", name: "Number of corporate sponsorships", unit: "sponsorships", unit_type: "count",
        reporting_frequency: "annual", direction: "higher", sort_order: 80,
        description: "Corporate sponsorships secured in the year.",
        annual: { 2024: 18, 2025: 22, 2026: 25 },
      },
      {
        slug: "percent-donors-retained", name: "Percent of donors retained from prior year, all categories", unit: "%", unit_type: "percent",
        reporting_frequency: "annual", direction: "higher", sort_order: 90,
        description: "Donor retention rate across all donor categories.",
        annual: { 2024: 68, 2025: 72, 2026: 75 },
      },
      {
        slug: "percent-members-to-donors", name: "Percent of members converted to donors", unit: "%", unit_type: "percent",
        reporting_frequency: "annual", direction: "higher", sort_order: 100,
        description: "Share of members who became donors.",
        annual: { 2024: 14, 2025: 17, 2026: 19 },
      },
      {
        slug: "percent-donors-to-members", name: "Percent of donors converted to members", unit: "%", unit_type: "percent",
        reporting_frequency: "annual", direction: "higher", sort_order: 110,
        description: "Share of donors who became members.",
        annual: { 2024: 11, 2025: 13, 2026: 15 },
      },
    ],
    breakdown: [
      {
        slug: "funders-by-breakdown", name: "Number of funders by breakdown", unit: "funders", unit_type: "breakdown",
        reporting_frequency: "annual", direction: "higher", sort_order: 40,
        description: "Total funders broken down by funder type.",
        labels: ["Foundation funders", "Government funders", "Corporate sponsors", "Individual/other funders"],
        breakdown: {
          2024: { "Foundation funders": 38, "Government funders": 12, "Corporate sponsors": 24, "Individual/other funders": 31 },
          2025: { "Foundation funders": 44, "Government funders": 14, "Corporate sponsors": 28, "Individual/other funders": 36 },
          2026: { "Foundation funders": 49, "Government funders": 15, "Corporate sponsors": 31, "Individual/other funders": 40 },
        },
      },
      {
        slug: "donor-categories", name: "First-time, returning, and lapsed donors", unit: "donors", unit_type: "breakdown",
        reporting_frequency: "annual", direction: "neutral", sort_order: 120,
        description: "Donor counts split into first-time, returning, and lapsed categories.",
        labels: ["First-time donors", "Returning donors", "Lapsed donors"],
        breakdown: {
          2024: { "First-time donors": 620, "Returning donors": 980, "Lapsed donors": 380 },
          2025: { "First-time donors": 740, "Returning donors": 1180, "Lapsed donors": 410 },
          2026: { "First-time donors": 820, "Returning donors": 1340, "Lapsed donors": 440 },
        },
      },
    ],
    monthlyBreakdown: [
      {
        slug: "percent-cultivated-donors", name: "People referred to development who became donors", unit: "people", unit_type: "breakdown",
        reporting_frequency: "monthly", direction: "higher", sort_order: 10,
        description: "Monthly count of people referred to development and how many became donors.",
        labels: ["Referred", "Donors"],
        monthlyBreakdown: {
          2024: {
            1: { "Referred": 22, "Donors": 9 },
            2: { "Referred": 18, "Donors": 7 },
            3: { "Referred": 25, "Donors": 10 },
            4: { "Referred": 30, "Donors": 13 },
            5: { "Referred": 28, "Donors": 11 },
            6: { "Referred": 35, "Donors": 15 },
            7: { "Referred": 32, "Donors": 13 },
            8: { "Referred": 26, "Donors": 10 },
            9: { "Referred": 20, "Donors": 8 },
            10: { "Referred": 24, "Donors": 10 },
            11: { "Referred": 19, "Donors": 8 },
            12: { "Referred": 15, "Donors": 6 },
          },
          2025: {
            1: { "Referred": 28, "Donors": 13 },
            2: { "Referred": 22, "Donors": 10 },
            3: { "Referred": 32, "Donors": 15 },
            4: { "Referred": 38, "Donors": 18 },
            5: { "Referred": 35, "Donors": 16 },
            6: { "Referred": 42, "Donors": 20 },
            7: { "Referred": 40, "Donors": 18 },
            8: { "Referred": 34, "Donors": 15 },
            9: { "Referred": 26, "Donors": 12 },
            10: { "Referred": 30, "Donors": 14 },
            11: { "Referred": 24, "Donors": 11 },
            12: { "Referred": 20, "Donors": 9 },
          },
          2026: {
            1: { "Referred": 34, "Donors": 17 },
            2: { "Referred": 28, "Donors": 14 },
            3: { "Referred": 40, "Donors": 20 },
            4: { "Referred": 45, "Donors": 22 },
            5: { "Referred": 38, "Donors": 19 },
            6: { "Referred": 42, "Donors": 20 },
          },
        },
      },
    ],
  },

  {
    slug: "economic-impact",
    name: "Economic Impact",
    description: "Budget, economic footprint, and employment.",
    sort_order: 80,
    monthly: [],
    annual: [
      {
        slug: "total-annual-budget", name: "Total annual budget", unit: "USD", unit_type: "currency",
        reporting_frequency: "annual", direction: "neutral", sort_order: 10,
        description: "Total organizational annual operating budget.",
        annual: { 2024: 8400000, 2025: 9100000, 2026: 9800000 },
      },
      {
        slug: "economic-impact", name: "Economic impact", unit: "USD", unit_type: "currency",
        reporting_frequency: "annual", direction: "higher", sort_order: 20,
        description: "Estimated total economic impact of Eastern State on the region.",
        annual: { 2024: 14200000, 2025: 15800000, 2026: 17400000 },
      },
      {
        slug: "jobs-held-es", name: "Jobs held at ES", unit: "jobs", unit_type: "count",
        reporting_frequency: "annual", direction: "higher", sort_order: 30,
        description: "Direct jobs held at Eastern State.",
        annual: { 2024: 62, 2025: 66, 2026: 71 },
      },
      {
        slug: "indirect-jobs-vendors", name: "Indirect jobs held at ES via vendors", unit: "jobs", unit_type: "count",
        reporting_frequency: "annual", direction: "higher", sort_order: 40,
        description: "Indirect jobs supported through Eastern State vendors.",
        annual: { 2024: 148, 2025: 162, 2026: 175 },
      },
    ],
  },
];

function main() {
  const db = getDb();
  console.log("Resetting KPI data...");
  db.exec("DELETE FROM breakdown_entries;");
  db.exec("DELETE FROM monthly_entries;");
  db.exec("DELETE FROM kpis;");
  db.exec("DELETE FROM categories;");
  db.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('sample_data', '1');");

  const years = [2024, 2025, 2026];
  let kpiCount = 0;
  let entryCount = 0;

  for (const cat of CATEGORIES) {
    const created = createCategory({
      slug: cat.slug,
      name: cat.name,
      description: cat.description,
      sort_order: cat.sort_order,
    });

    // Monthly KPIs
    for (const k of cat.monthly) {
      const kpi = createKPI({
        category_id: created.id,
        slug: k.slug,
        name: k.name,
        unit: k.unit,
        unit_type: k.unit_type,
        reporting_frequency: k.reporting_frequency,
        direction: k.direction,
        description: k.description,
        sort_order: k.sort_order,
      });
      kpiCount++;
      const v2024 = k.base2024;
      const v2025 = grow(k.base2024, k.factor2025);
      const v2026 = grow(k.base2024, k.factor2025 * k.factor2026);
      for (const year of years) {
        const series = year === 2024 ? v2024 : year === 2025 ? v2025 : v2026;
        for (const month of monthsFor(year)) {
          upsertEntry({ kpi_id: kpi.id, year, month, value: series[month - 1], notes: null });
          entryCount++;
        }
      }
      console.log(`  - ${k.name}: monthly ${years.join(",")}`);
    }

    // Annual KPIs
    for (const k of cat.annual) {
      const kpi = createKPI({
        category_id: created.id,
        slug: k.slug,
        name: k.name,
        unit: k.unit,
        unit_type: k.unit_type,
        reporting_frequency: k.reporting_frequency,
        direction: k.direction,
        description: k.description,
        sort_order: k.sort_order,
      });
      kpiCount++;
      for (const year of years) {
        upsertEntry({ kpi_id: kpi.id, year, month: 0, value: k.annual[year], notes: null });
        entryCount++;
      }
      console.log(`  - ${k.name}: annual ${years.join(",")}`);
    }

    // Breakdown KPIs
    for (const k of cat.breakdown ?? []) {
      const kpi = createKPI({
        category_id: created.id,
        slug: k.slug,
        name: k.name,
        unit: k.unit,
        unit_type: "breakdown",
        reporting_frequency: k.reporting_frequency,
        direction: k.direction,
        description: k.description,
        sort_order: k.sort_order,
      });
      kpiCount++;
      for (const year of years) {
        const yearMap = k.breakdown[year];
        let order = 0;
        for (const label of k.labels) {
          upsertBreakdown({
            kpi_id: kpi.id,
            year,
            label,
            value: yearMap[label] ?? 0,
            sort_order: order++,
            notes: null,
          });
          entryCount++;
        }
      }
      console.log(`  - ${k.name}: breakdown ${years.join(",")}`);
    }

    // Monthly breakdown KPIs
    for (const k of cat.monthlyBreakdown ?? []) {
      const kpi = createKPI({
        category_id: created.id,
        slug: k.slug,
        name: k.name,
        unit: k.unit,
        unit_type: "breakdown",
        reporting_frequency: k.reporting_frequency,
        direction: k.direction,
        description: k.description,
        sort_order: k.sort_order,
      });
      kpiCount++;
      for (const year of years) {
        const yearMap = k.monthlyBreakdown[year];
        if (!yearMap) continue;
        const months = Object.keys(yearMap).map(Number).sort((a, b) => a - b);
        for (const month of months) {
          const monthMap = yearMap[month];
          let order = 0;
          for (const label of k.labels) {
            upsertBreakdown({
              kpi_id: kpi.id,
              year,
              month,
              label,
              value: monthMap[label] ?? 0,
              sort_order: order++,
              notes: null,
            });
            entryCount++;
          }
        }
      }
      console.log(`  - ${k.name}: monthly breakdown ${years.join(",")}`);
    }
  }

  ensureSeedAdmin();
  const kpis = listKPIs();
  console.log(`\nSeed complete. ${kpis.length} KPIs ready across ${years[0]}–${years[years.length - 1]} (${entryCount} values).`);
}

main();
