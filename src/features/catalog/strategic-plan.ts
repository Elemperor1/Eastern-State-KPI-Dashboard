/**
 * Canonical Eastern State strategic-plan data.
 *
 * The product stores two metadata levels (category and KPI), while the plan has
 * three (priority, strategic goal, KPI). KPI names therefore carry their goal
 * prefix with an em dash; reporting builds goal sub-headings from that stable
 * convention. All current strategic-plan KPIs are annual (`month = 0`).
 */
import type { Direction, UnitType } from "@/lib/types";

export const STRATEGIC_PLAN_YEARS = [2024, 2025, 2026] as const;
export const STRATEGIC_PLAN_BASELINE_YEAR = 2026;

/** All KPIs are annual (month = 0, single full-year value). */
interface AnnualKpi {
  slug: string;
  name: string; // already includes goal prefix
  unit: string;
  unit_type: UnitType;
  direction: Direction;
  description: string;
  sort_order: number;
  annual: Record<number, number>;
  /** Optional endpoint or growth target from the fixed 2026 baseline. */
  goal?:
    | {
        target_year: number;
        target: number;
        notes?: string;
      }
    | {
        target_year: number;
        growth_pct: number;
        notes?: string;
      };
}

/** Breakdown KPI — stores label × year values. */
interface BreakdownKpi {
  slug: string;
  name: string;
  unit: string;
  direction: Direction;
  description: string;
  sort_order: number;
  labels: string[];
  breakdown: Record<number, Record<string, number>>;
}

interface CategorySpec {
  slug: string;
  name: string;
  description: string;
  sort_order: number;
  annual: AnnualKpi[];
  breakdown?: BreakdownKpi[];
}

export const STRATEGIC_PLAN_CATEGORIES: CategorySpec[] = [
  // ═══════════════════════════════════════════════════════════════
  // Priority 1: Reimagine Visitor Experience
  // ═══════════════════════════════════════════════════════════════
  {
    slug: "visitor-experience",
    name: "Reimagine Visitor Experience",
    description:
      "Develop a primary interpretive site plan, modernize exhibits and programs, enhance amenities and accessibility, broaden programming for diverse audiences, and reconceptualize Eastern State's work with artists.",
    sort_order: 10,
    annual: [
      // Goal: Develop a Primary Interpretive Site Plan
      {
        slug: "interpretive-plan-milestones-on-schedule",
        name: "Interpretive Site Plan — Milestones completed on schedule",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 10,
        description:
          "Percentage of key milestones (research, stakeholder engagement, draft, finalization) completed on schedule. Planning phase 2025; drafting and final review by 2027.",
        annual: { 2024: 0, 2025: 15, 2026: 35 },
        goal: {
          target_year: 2027,
          target: 100,
          notes: "100% milestones on schedule by 2027",
        },
      },
      {
        slug: "interpretive-plan-community-feedback",
        name: "Interpretive Site Plan — Visitor & community feedback participation",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 20,
        description:
          "Number of visitors/community members engaged via surveys or focus groups during planning. Target: 3 sessions and 400 survey participants by 2027.",
        annual: { 2024: 0, 2025: 25, 2026: 55 },
        goal: {
          target_year: 2027,
          target: 100,
          notes: "100% (3 sessions, 400 survey participants) by 2027",
        },
      },
      {
        slug: "interpretive-plan-adoption",
        name: "Interpretive Site Plan — Plan adoption by Board",
        unit: "Yes/No",
        unit_type: "count",
        direction: "higher",
        sort_order: 30,
        description:
          "Formal approval and adoption of the interpretive site plan by Board of Directors. Target: Q4 2027.",
        annual: { 2024: 0, 2025: 0, 2026: 0 },
        goal: {
          target_year: 2027,
          target: 1,
          notes: "Plan adopted by Q4 2027",
        },
      },

      // Goal: Reimagine the Visitor Experience through Modernized Exhibits and Programs
      {
        slug: "exhibits-redesigned-or-installed",
        name: "Modernized Exhibits — Exhibits redesigned, updated, or newly installed",
        unit: "exhibits",
        unit_type: "count",
        direction: "higher",
        sort_order: 40,
        description:
          "Number of exhibits redesigned, updated, or newly installed annually. Target: 3 exhibits by 2029 (1 each year 2027, 2028, 2029).",
        annual: { 2024: 0, 2025: 0, 2026: 0 },
        goal: {
          target_year: 2029,
          target: 3,
          notes: "3 exhibits by 2029 (1 each year 2027-2029)",
        },
      },
      {
        slug: "exhibits-with-interactive-digital",
        name: "Modernized Exhibits — Exhibits with interactive/digital elements",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 50,
        description:
          "Percentage of exhibits incorporating new interactive or digital elements. Target: 50% of exhibits by 2029.",
        annual: { 2024: 10, 2025: 15, 2026: 20 },
        goal: {
          target_year: 2029,
          target: 50,
          notes: "50% of exhibits by 2029",
        },
      },
      {
        slug: "exhibits-satisfaction-rating",
        name: "Modernized Exhibits — Average satisfaction rating",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 60,
        description:
          "Average satisfaction rating for redesigned exhibits and programs. Target: 75% average rating of positive or above.",
        annual: { 2024: 65, 2025: 68, 2026: 70 },
        goal: {
          target_year: 2029,
          target: 75,
          notes: "75% average positive rating by 2029",
        },
      },
      {
        slug: "program-attendance-vs-baseline",
        name: "Modernized Exhibits — Attendance increase vs baseline",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 70,
        description:
          "Increase in attendance for programs compared to baseline year. Target: 10% increase from baseline by 2029 for each program.",
        annual: { 2024: 0, 2025: 2, 2026: 4 },
        goal: {
          target_year: 2029,
          target: 10,
          notes: "10% increase from baseline by 2029",
        },
      },

      // Goal: Enhance Visitor Amenities, Accessibility and Navigation
      {
        slug: "art-reach-accessibility-study",
        name: "Amenities & Accessibility — Art Reach Accessibility Study completion",
        unit: "Yes/No",
        unit_type: "count",
        direction: "higher",
        sort_order: 80,
        description:
          "Completion of Art Reach Accessibility Study. Target: 100% completion by 2027. Currently in planning phase.",
        annual: { 2024: 0, 2025: 0, 2026: 0 },
        goal: {
          target_year: 2027,
          target: 1,
          notes: "100% completion by 2027",
        },
      },
      {
        slug: "visitor-amenities-upgraded",
        name: "Amenities & Accessibility — Visitor amenities planned/installed/upgraded",
        unit: "upgrades",
        unit_type: "count",
        direction: "higher",
        sort_order: 90,
        description:
          "Number of new visitor amenities planned, installed or upgraded (bathrooms, shaded seating, wayfinding signage, mass notification, new store, education center). Target: 5 upgrades completed by 2029.",
        annual: { 2024: 0, 2025: 1, 2026: 2 },
        goal: {
          target_year: 2029,
          target: 5,
          notes: "5 upgrades completed by 2029",
        },
      },
      {
        slug: "amenities-navigation-satisfaction",
        name: "Amenities & Accessibility — Positive ratings on amenities & navigation",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 100,
        description:
          "Positive ratings on amenities and ease of site navigation. Target: 70% satisfaction rate by 2029.",
        annual: { 2024: 55, 2025: 60, 2026: 63 },
        goal: {
          target_year: 2029,
          target: 70,
          notes: "70% satisfaction rate by 2029",
        },
      },
      {
        slug: "average-dwell-time",
        name: "Amenities & Accessibility — Average visitor dwell time",
        unit: "minutes",
        unit_type: "count",
        direction: "higher",
        sort_order: 110,
        description:
          "Increase in average time visitors spend onsite, reflecting improved comfort, educational experience, and amenities. Target: TBD after timing and tracking study to establish baseline.",
        annual: { 2024: 72, 2025: 75, 2026: 78 },
      },

      // Goal: Broaden Programming to Attract Diverse Audiences
      {
        slug: "programs-cocreated-community-orgs",
        name: "Diverse Audiences — Programs co-created with community organizations",
        unit: "programs",
        unit_type: "count",
        direction: "higher",
        sort_order: 120,
        description:
          "Number of programs co-created or delivered in collaboration with community-based organizations representing diverse voices. Target: 5 programs a year.",
        annual: { 2024: 0, 2025: 1, 2026: 2 },
        goal: { target_year: 2027, target: 5, notes: "5 programs a year" },
      },
      {
        slug: "repeat-attendance-increase",
        name: "Diverse Audiences — Increase in repeat attendance",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 130,
        description: "Increase in repeat attendance compared to last year.",
        annual: { 2024: 0, 2025: 3, 2026: 5 },
      },

      // Goal: Reconceptualize Eastern State's Work with Artists
      {
        slug: "artist-residencies-commissions",
        name: "Artist Work — New/renewed artist residencies, commissions, partnerships",
        unit: "partnerships",
        unit_type: "count",
        direction: "higher",
        sort_order: 140,
        description:
          "Number of new or renewed artist residencies, commissions, or partnerships established annually. Target: 4 by 2029.",
        annual: { 2024: 0, 2025: 1, 2026: 2 },
        goal: { target_year: 2029, target: 4, notes: "4 by 2029" },
      },
      {
        slug: "artist-installations-visitor-feedback",
        name: "Artist Work — Visitor feedback ratings for artist-led installations",
        unit: "NPS",
        unit_type: "count",
        direction: "higher",
        sort_order: 150,
        description:
          "Positive visitor feedback ratings for artist-led installations and programs. Measured as NPS score.",
        annual: { 2024: 35, 2025: 42, 2026: 48 },
      },
      {
        slug: "art-press-features-awards",
        name: "Artist Work — Press features, awards, or academic publications",
        unit: "features",
        unit_type: "count",
        direction: "higher",
        sort_order: 160,
        description:
          "Number of press features, awards, or academic publications highlighting Eastern State's art initiatives. Target: 2-3 placements per year.",
        annual: { 2024: 1, 2025: 2, 2026: 2 },
        goal: { target_year: 2027, target: 3, notes: "3 placements per year" },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // Priority 2: Advance Historic Preservation
  // ═══════════════════════════════════════════════════════════════
  {
    slug: "historic-preservation",
    name: "Advance Historic Preservation",
    description:
      "Advance the Conservation Management Plan, increase public awareness of preservation efforts, maintain ESPHS's reputation as a preservation leader, expand archive and research accessibility, and implement climate-responsive solutions.",
    sort_order: 20,
    annual: [
      // Goal: Advance the Conservation Management Plan
      {
        slug: "conservation-plan-revised",
        name: "Conservation Management Plan — % revised and finalized",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 10,
        description:
          "Percentage of Conservation Management Plan revised and finalized by 2029. Year 1: assessment and outline; Year 2: define values and review with board; Year 3: flesh out and review; Year 5: socialize in the field. Target: cover 80% of needs.",
        annual: { 2024: 0, 2025: 10, 2026: 25 },
        goal: {
          target_year: 2029,
          target: 80,
          notes: "Cover 80% of needs by 2029",
        },
      },
      {
        slug: "historic-structures-assessed",
        name: "Conservation Management Plan — % of historic structures assessed",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 20,
        description:
          "Percentage of site's historic structures assessed and documented under updated conservation guidelines. Target: Master Plan update by 2027.",
        annual: { 2024: 15, 2025: 30, 2026: 45 },
        goal: {
          target_year: 2027,
          target: 100,
          notes: "100% of historic structures assessed by 2027",
        },
      },
      {
        slug: "conservation-funds-utilized",
        name: "Conservation Management Plan — Total funds utilized for conservation",
        unit: "USD",
        unit_type: "currency",
        direction: "higher",
        sort_order: 30,
        description:
          "Total funds actively utilized for conservation and preservation efforts. Capital budget yearly, broken down by funding stream.",
        annual: { 2024: 450000, 2025: 525000, 2026: 610000 },
      },

      // Goal: Increase Public Awareness of and Engagement with ESPHS's Preservation Efforts
      {
        slug: "preservation-tours-talks-events",
        name: "Preservation Awareness — Preservation-focused tours, talks, or events",
        unit: "events",
        unit_type: "count",
        direction: "higher",
        sort_order: 40,
        description:
          "Hosting preservation-focused tours, talks, or events (in-person and virtual). Target: 3 programs annually.",
        annual: { 2024: 1, 2025: 2, 2026: 2 },
        goal: { target_year: 2027, target: 3, notes: "3 programs annually" },
      },
      {
        slug: "preservation-campaign-donors",
        name: "Preservation Awareness — Donors contributing to preservation campaigns",
        unit: "donors",
        unit_type: "count",
        direction: "higher",
        sort_order: 50,
        description:
          "Number of donors contributing to preservation campaigns or % increase in preservation-specific funding.",
        annual: { 2024: 85, 2025: 102, 2026: 120 },
      },
      {
        slug: "visitors-aware-of-preservation",
        name: "Preservation Awareness — Visitors/online respondents aware of preservation efforts",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 60,
        description:
          "Percentage of surveyed visitors or online respondents aware of ESPHS's preservation efforts.",
        annual: { 2024: 18, 2025: 24, 2026: 30 },
      },

      // Goal: Maintain and Grow ESPHS's Reputation as a Leader in Preservation
      {
        slug: "preservation-awards-recognitions",
        name: "Preservation Reputation — Awards, honors, or recognitions received",
        unit: "awards",
        unit_type: "count",
        direction: "higher",
        sort_order: 70,
        description:
          "Number of awards, honors, or official recognitions received for preservation excellence. Target: recognition by 2029.",
        annual: { 2024: 0, 2025: 1, 2026: 1 },
      },
      {
        slug: "preservation-speaking-engagements",
        name: "Preservation Reputation — Speaking engagements, presentations, articles",
        unit: "engagements",
        unit_type: "count",
        direction: "higher",
        sort_order: 80,
        description:
          "Number of speaking engagements, conference presentations, or published articles by ESPHS staff on preservation topics.",
        annual: { 2024: 3, 2025: 5, 2026: 6 },
      },
      {
        slug: "preservation-leadership-positions",
        name: "Preservation Reputation — Staff in preservation association leadership",
        unit: "positions",
        unit_type: "count",
        direction: "higher",
        sort_order: 90,
        description:
          "Representation of ESPHS staff in leadership or advisory positions within national or regional preservation associations.",
        annual: { 2024: 2, 2025: 3, 2026: 3 },
      },

      // Goal: Expand Archive and Research Accessibility
      {
        slug: "archival-materials-digitized-online",
        name: "Archive & Research Access — % of archival materials digitized & online",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 100,
        description:
          "Percentage of archival materials digitized and made publicly available online. Target: 10% digitized.",
        annual: { 2024: 3, 2025: 5, 2026: 7 },
        goal: { target_year: 2027, target: 10, notes: "10% digitized" },
      },
      {
        slug: "archival-materials-available-programs",
        name: "Archive & Research Access — % of archival materials available through programs",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 110,
        description:
          "Percentage of archival materials publicly available through programs.",
        annual: { 2024: 8, 2025: 12, 2026: 16 },
      },
      {
        slug: "high-risk-areas-climate-resilience",
        name: "Archive & Research Access — % of high-risk areas with climate resilience measures",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 120,
        description:
          "Percentage of high-risk areas (identified in conservation or engineering assessments) with implemented flood protection, weatherproofing, or other climate resilience measures. Target: TBD (Ask Liz).",
        annual: { 2024: 5, 2025: 10, 2026: 15 },
      },

      // Goal: Implement Climate-Responsive Solutions
      {
        slug: "climate-friendly-projects",
        name: "Climate-Responsive Solutions — Projects increasing climate-friendly spaces",
        unit: "projects",
        unit_type: "count",
        direction: "higher",
        sort_order: 130,
        description:
          "Number of projects that increase climate-friendly spaces for staff and visitors.",
        annual: { 2024: 0, 2025: 1, 2026: 2 },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // Priority 3: Expand Workforce Development
  // ═══════════════════════════════════════════════════════════════
  {
    slug: "workforce-development",
    name: "Expand Workforce Development",
    description:
      "Expand program offerings, strengthen community and program partnerships, grow career pipelines and employment opportunities, and expand public awareness and recognition of workforce development efforts.",
    sort_order: 30,
    annual: [
      // Goal: Expand Program Offerings
      {
        slug: "workforce-program-completion-rate",
        name: "Program Offerings — Participants enrolled and completing workforce programs",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 10,
        description:
          "Number of participants enrolled and successfully completing workforce programs. Target: 10/year, 50% placement.",
        annual: { 2024: 72, 2025: 76, 2026: 80 },
        goal: {
          target_year: 2027,
          target: 90,
          notes: "90% participant completion rate by 2027",
        },
      },
      {
        slug: "workforce-underrepresented-participants",
        name: "Program Offerings — % of participants from underrepresented/justice-impacted backgrounds",
        unit: "%",
        unit_type: "percent",
        direction: "neutral",
        sort_order: 20,
        description:
          "Percentage of participants from underrepresented or justice-impacted backgrounds.",
        annual: { 2024: 55, 2025: 58, 2026: 60 },
      },
      {
        slug: "workforce-outreach-engagement",
        name: "Program Offerings — Outreach engagement participants",
        unit: "participants",
        unit_type: "count",
        direction: "higher",
        sort_order: 30,
        description:
          "Number of interested participants engaging in outreach about workforce development programs (info sessions, demo days, etc.).",
        annual: { 2024: 120, 2025: 180, 2026: 240 },
      },

      // Goal: Strengthen Community and Program Partnerships
      {
        slug: "workforce-employer-partnerships",
        name: "Community Partnerships — Strategic partnerships with employers/workforce orgs",
        unit: "partnerships",
        unit_type: "count",
        direction: "higher",
        sort_order: 40,
        description:
          "Number of strategic partnerships with employers or workforce organizations to co-create or support programs. Target: 20% growth YoY.",
        annual: { 2024: 12, 2025: 14, 2026: 17 },
        goal: {
          target_year: 2027,
          growth_pct: 20,
          notes: "20% growth from the 2026 partnership baseline",
        },
      },
      {
        slug: "workforce-satisfaction-skill-improvement",
        name: "Community Partnerships — Satisfaction & self-reported skill improvement",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 50,
        description:
          "Average satisfaction score and self-reported skill improvement from post-program surveys.",
        annual: { 2024: 78, 2025: 82, 2026: 85 },
      },

      // Goal: Continue to Grow Career Pipelines and Employment Opportunities
      {
        slug: "workforce-graduates-employment",
        name: "Career Pipelines — % of graduates securing employment or advancing careers",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 60,
        description:
          "Percentage of program graduates securing employment or advancing careers within target time of completion. Target: 25% staff lived experience, 60% full-time roles.",
        annual: { 2024: 45, 2025: 50, 2026: 55 },
        goal: {
          target_year: 2029,
          target: 60,
          notes: "60% employment or career advancement by 2029",
        },
      },

      // Goal: Expand Public Awareness and Recognition
      {
        slug: "workforce-public-events-job-fairs",
        name: "Workforce Awareness — Public events, job fairs, or community forums",
        unit: "events",
        unit_type: "count",
        direction: "higher",
        sort_order: 70,
        description:
          "Number of public events, job fairs, or community forums where ESPHS presents or showcases workforce programs.",
        annual: { 2024: 4, 2025: 6, 2026: 8 },
      },
      {
        slug: "workforce-external-recognitions",
        name: "Workforce Awareness — External recognitions for workforce development",
        unit: "recognitions",
        unit_type: "count",
        direction: "higher",
        sort_order: 80,
        description:
          "Number of external recognitions (awards, certifications, endorsements, presentations) for workforce development efforts.",
        annual: { 2024: 1, 2025: 2, 2026: 3 },
      },
      {
        slug: "workforce-awareness-non-engaged",
        name: "Workforce Awareness — Awareness among non-engaged community members",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 90,
        description:
          "Percentage of surveyed community members, prospective employers, and funders not currently engaged with ESPHS who indicate they are aware that ESPHS offers workforce development programs. Baseline set in Year 1.",
        annual: { 2024: 12, 2025: 18, 2026: 24 },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // Priority 4: Support Learning through Justice Education
  // ═══════════════════════════════════════════════════════════════
  {
    slug: "justice-education",
    name: "Support Learning through Justice Education",
    description:
      "Engage schools and educators in justice education, build partnerships and recognition, expand and promote dialogue around criminal justice, and leverage historic architecture for contemporary education.",
    sort_order: 40,
    annual: [
      // Goal: Engage Schools and Educators in Justice Education
      {
        slug: "justice-ed-total-participants",
        name: "Schools & Educators — Total participants in justice education",
        unit: "participants",
        unit_type: "count",
        direction: "higher",
        sort_order: 10,
        description:
          "Total number of participants in onsite field trips, virtual programs, or classroom curriculum tied to justice education. Baseline.",
        annual: { 2024: 3200, 2025: 3800, 2026: 4400 },
      },
      {
        slug: "justice-ed-teachers-pd",
        name: "Schools & Educators — Teachers attending PD workshops or using resources",
        unit: "teachers",
        unit_type: "count",
        direction: "higher",
        sort_order: 20,
        description:
          "Number of teachers attending ESPHS professional development workshops or using ESPHS resources.",
        annual: { 2024: 145, 2025: 175, 2026: 210 },
      },
      {
        slug: "justice-ed-online-digital-attendance",
        name: "Schools & Educators — Online digital attendance",
        unit: "views",
        unit_type: "count",
        direction: "higher",
        sort_order: 30,
        description:
          "Overall online digital attendance (webpage views, downloads, and video views).",
        annual: { 2024: 180000, 2025: 215000, 2026: 250000 },
      },
      {
        slug: "justice-ed-states-represented",
        name: "Schools & Educators — States represented in participation",
        unit: "states",
        unit_type: "count",
        direction: "higher",
        sort_order: 40,
        description:
          "Number of states represented in educator and student participation (onsite or online).",
        annual: { 2024: 18, 2025: 24, 2026: 30 },
      },

      // Goal: Build Partnerships and Recognition
      {
        slug: "justice-ed-school-partnerships",
        name: "Partnerships & Recognition — Schools actively partnering on justice education",
        unit: "schools",
        unit_type: "count",
        direction: "higher",
        sort_order: 50,
        description:
          "Number of local, regional, or national schools actively partnering with ESPHS on justice education programs. Target: 10 active partnerships by 2027.",
        annual: { 2024: 3, 2025: 5, 2026: 7 },
        goal: {
          target_year: 2027,
          target: 10,
          notes: "10 active school partnerships by 2027",
        },
      },
      {
        slug: "justice-ed-educator-confidence",
        name: "Partnerships & Recognition — % of educators reporting increased confidence",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 60,
        description:
          "Percentage of educators reporting increased confidence and skills in teaching justice topics after engaging with ESPHS programs. Baseline.",
        annual: { 2024: 60, 2025: 67, 2026: 73 },
      },
      {
        slug: "justice-ed-returning-schools-educators",
        name: "Partnerships & Recognition — % of schools/educators returning year-over-year",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 70,
        description:
          "Percentage of schools and educators returning for additional programs or resources year-over-year.",
        annual: { 2024: 45, 2025: 52, 2026: 58 },
      },
      {
        slug: "justice-ed-diverse-demographics",
        name: "Partnerships & Recognition — Diverse demographic representation in audience",
        unit: "%",
        unit_type: "percent",
        direction: "neutral",
        sort_order: 80,
        description:
          "Percentage of audience from diverse demographic groups (race, age, socioeconomic background) compared to baseline.",
        annual: { 2024: 38, 2025: 42, 2026: 45 },
      },

      // Goal: Leverage Historic Architecture for Contemporary Education
      {
        slug: "architecture-focused-programs",
        name: "Architecture for Education — Program offerings with architecture-focused interpretation",
        unit: "programs",
        unit_type: "count",
        direction: "higher",
        sort_order: 90,
        description:
          "Number of program offerings with architecture-focused interpretation. Baseline.",
        annual: { 2024: 2, 2025: 3, 2026: 4 },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // Priority 5: Enhance Organizational Capacity
  // ═══════════════════════════════════════════════════════════════
  {
    slug: "organizational-capacity",
    name: "Enhance Organizational Capacity",
    description:
      "Diversify revenue streams, optimize ESPHS facilities, cultivate a culture of accountability and growth, and strengthen ESPHS's role as a community and civic hub.",
    sort_order: 50,
    annual: [
      // Goal: Diversify Revenue Streams
      {
        slug: "earned-income-yoy-growth",
        name: "Revenue Diversification — YOY % increase in earned income",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 10,
        description:
          "YOY percentage increase in earned income from admissions, programs, and ancillary sales. Ongoing expansion of revenue through continually-increasing donor cultivation program. Baseline revenue growth.",
        annual: { 2024: 5, 2025: 7, 2026: 9 },
        goal: {
          target_year: 2027,
          target: 12,
          notes: "12% year-over-year earned-income growth by 2027",
        },
      },
      {
        slug: "multi-year-grants-pledges-value",
        name: "Revenue Diversification — Value of multi-year grants or pledges",
        unit: "USD",
        unit_type: "currency",
        direction: "higher",
        sort_order: 20,
        description:
          "Total value or percentage of revenue secured through multi-year grants or pledges.",
        annual: { 2024: 1200000, 2025: 1450000, 2026: 1700000 },
      },
      {
        slug: "board-giving-participation",
        name: "Revenue Diversification — Board participation in annual giving",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 30,
        description:
          "Board participation in annual giving. Target: 100% board giving rate.",
        annual: { 2024: 88, 2025: 92, 2026: 94 },
        goal: {
          target_year: 2027,
          target: 100,
          notes: "100% board giving rate",
        },
      },
      {
        slug: "referrals-cultivated",
        name: "Revenue Diversification — % of referrals cultivated by advancement staff",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 50,
        description:
          "Percentage of referrals from Board, Staff, Donors, etc. that are cultivated by ESP advancement staff across all categories (individual, foundation, corporate).",
        annual: { 2024: 35, 2025: 42, 2026: 48 },
      },

      // Goal: Optimize ESPHS Facilities
      {
        slug: "spaces-utilized-revenue-programs",
        name: "Facilities Optimization — % of spaces utilized for revenue and programs",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 60,
        description:
          "Percentage of site spaces utilized for revenue and programs.",
        annual: { 2024: 55, 2025: 60, 2026: 64 },
      },

      // Goal: Continue to Cultivate and Support a Culture of Accountability, Agility, and Growth
      {
        slug: "departments-aligned-best-practices",
        name: "Accountability & Growth — % of departments aligned with strategic goals",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 70,
        description:
          "Percentage of departments aligned and in compliance with best practices. Redefine, redesign, and redocument departmental teams, workflows, and policies for alignment with strategic goals.",
        annual: { 2024: 40, 2025: 55, 2026: 68 },
        goal: {
          target_year: 2027,
          target: 100,
          notes: "100% of departments aligned with best practices",
        },
      },
      {
        slug: "staff-reviews-strategic-alignment",
        name: "Accountability & Growth — % of staff reviews showing strategic plan alignment",
        unit: "%",
        unit_type: "percent",
        direction: "higher",
        sort_order: 80,
        description:
          "Percentage of staff whose annual reviews show alignment with strategic plan. Yearly staff evaluation process with outcome of % alignment institution-wide.",
        annual: { 2024: 50, 2025: 65, 2026: 75 },
        goal: {
          target_year: 2027,
          target: 100,
          notes: "100% alignment institution-wide",
        },
      },

      // Goal: Strengthen Our Role as a Community and Civic Hub
      {
        slug: "new-corporate-sponsorships-grants",
        name: "Community & Civic Hub — New corporate sponsorships or foundation grants",
        unit: "sponsorships",
        unit_type: "count",
        direction: "higher",
        sort_order: 90,
        description:
          "Number of new corporate sponsorships or foundation grants secured annually.",
        annual: { 2024: 3, 2025: 5, 2026: 6 },
      },
      {
        slug: "reduced-price-free-pwyw-events",
        name: "Community & Civic Hub — Reduced-price/free/PWYW events offered",
        unit: "events",
        unit_type: "count",
        direction: "higher",
        sort_order: 100,
        description:
          "Number of reduced-price, free, or pay-what-you-want admission events offered annually.",
        annual: { 2024: 8, 2025: 10, 2026: 12 },
      },
      {
        slug: "government-support-percentage",
        name: "Community & Civic Hub — % of contributed revenue from government (city & state)",
        unit: "%",
        unit_type: "percent",
        direction: "neutral",
        sort_order: 110,
        description:
          "Percentage of contributed revenue from government support (city and state).",
        annual: { 2024: 12, 2025: 14, 2026: 15 },
      },
      {
        slug: "new-individual-institutional-donors",
        name: "Community & Civic Hub — New individual and institutional donors secured",
        unit: "donors",
        unit_type: "count",
        direction: "higher",
        sort_order: 120,
        description:
          "Number of new individual and institutional donors secured each year. The 2024–2026 values establish the baseline for future target setting.",
        annual: { 2024: 180, 2025: 220, 2026: 260 },
      },
    ],
    breakdown: [
      {
        slug: "revenue-by-stream",
        name: "Revenue Diversification — % of revenue from each major stream",
        unit: "%",
        direction: "neutral",
        sort_order: 40,
        description:
          "Percentage of total annual revenue derived from each major stream (admissions, memberships, grants, donations, endowment income, corporate sponsorships, retail, rentals).",
        labels: [
          "Admissions",
          "Memberships",
          "Grants",
          "Donations",
          "Endowment Income",
          "Corporate Sponsorships",
          "Retail",
          "Rentals",
        ],
        breakdown: {
          2024: {
            Admissions: 25,
            Memberships: 8,
            Grants: 22,
            Donations: 18,
            "Endowment Income": 12,
            "Corporate Sponsorships": 5,
            Retail: 7,
            Rentals: 3,
          },
          2025: {
            Admissions: 26,
            Memberships: 9,
            Grants: 21,
            Donations: 18,
            "Endowment Income": 11,
            "Corporate Sponsorships": 6,
            Retail: 7,
            Rentals: 2,
          },
          2026: {
            Admissions: 27,
            Memberships: 10,
            Grants: 20,
            Donations: 18,
            "Endowment Income": 11,
            "Corporate Sponsorships": 7,
            Retail: 5,
            Rentals: 2,
          },
        },
      },
    ],
  },
];
