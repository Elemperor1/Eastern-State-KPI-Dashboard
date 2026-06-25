/**
 * Seeds the SQLite database with realistic Eastern State Penitentiary KPI data.
 * Run with:  npm run db:seed
 *
 * Idempotent: drops all KPI-related rows and re-creates them. Users are left
 * untouched (use auth.ts to seed the default admin/viewer on first request).
 */
import { getDb } from "../src/lib/db";
import { ensureSeedAdmin } from "../src/lib/auth";
import {
  createCategory,
  createKPI,
  upsertEntry,
  listKPIs,
} from "../src/lib/repository";

interface SeedConfig {
  category: { slug: string; name: string; description: string; sort_order: number };
  kpi: {
    slug: string;
    name: string;
    unit: string;
    format: "number" | "currency" | "percent";
    description: string;
  };
  monthly: Record<number, Record<number, number>>; // year -> { month: value }
  ytdAdd?: Record<number, number>; // year -> add to YTD aggregation
}

const SEEDS: SeedConfig[] = [
  {
    category: {
      slug: "engagement",
      name: "Audience Engagement",
      description: "How people discover, visit, and connect with the site.",
      sort_order: 10,
    },
    kpi: {
      slug: "website-traffic",
      name: "Website Traffic",
      unit: "sessions",
      format: "number",
      description: "Total website sessions per month (Google Analytics 4).",
    },
    monthly: {
      2023: { 1: 41200, 2: 39800, 3: 47500, 4: 52100, 5: 60800, 6: 71400, 7: 68900, 8: 64300, 9: 58200, 10: 63500, 11: 48900, 12: 39700 },
      2024: { 1: 43800, 2: 42200, 3: 51400, 4: 56800, 5: 66200, 6: 78900, 7: 75600, 8: 71200, 9: 64500, 10: 69800, 11: 54100, 12: 44200 },
      2025: { 1: 47200, 2: 45600, 3: 56800, 4: 62400, 5: 73100, 6: 88400, 7: 84200, 8: 79600, 9: 71300, 10: 77200, 11: 60800, 12: 48900 },
      2026: { 1: 52400, 2: 51300, 3: 63100, 4: 69700, 5: 81400, 6: 97200 },
    },
  },
  {
    category: {
      slug: "programs",
      name: "Programs & Education",
      description: "On-site programming and educational reach.",
      sort_order: 20,
    },
    kpi: {
      slug: "program-attendance",
      name: "Program Attendance",
      unit: "attendees",
      format: "number",
      description: "Total attendees across all public programs (talks, tours, after-hours events).",
    },
    monthly: {
      2023: { 1: 380, 2: 460, 3: 720, 4: 980, 5: 1450, 6: 1980, 7: 2240, 8: 2150, 9: 1620, 10: 1380, 11: 720, 12: 480 },
      2024: { 1: 420, 2: 510, 3: 810, 4: 1120, 5: 1640, 6: 2280, 7: 2580, 8: 2480, 9: 1870, 10: 1560, 11: 820, 12: 540 },
      2025: { 1: 470, 2: 580, 3: 920, 4: 1280, 5: 1860, 6: 2580, 7: 2920, 8: 2810, 9: 2110, 10: 1760, 11: 920, 12: 610 },
      2026: { 1: 530, 2: 650, 3: 1040, 4: 1440, 5: 2080, 6: 2860 },
    },
  },
  {
    category: {
      slug: "programs",
      name: "Programs & Education",
      description: "On-site programming and educational reach.",
      sort_order: 21,
    },
    kpi: {
      slug: "justice-101-participants",
      name: "Justice 101 Participation",
      unit: "students",
      format: "number",
      description: "Students served by Justice 101 — Eastern State's civic-education program.",
    },
    monthly: {
      2023: { 1: 0, 2: 180, 3: 340, 4: 420, 5: 280, 6: 0, 7: 0, 8: 0, 9: 380, 10: 460, 11: 220, 12: 0 },
      2024: { 1: 0, 2: 220, 3: 410, 4: 510, 5: 340, 6: 0, 7: 0, 8: 0, 9: 460, 10: 550, 11: 260, 12: 0 },
      2025: { 1: 0, 2: 260, 3: 480, 4: 600, 5: 410, 6: 0, 7: 0, 8: 0, 9: 540, 10: 640, 11: 310, 12: 0 },
      2026: { 1: 0, 2: 310, 3: 560, 4: 690, 5: 480, 6: 0 },
    },
  },
  {
    category: {
      slug: "visits",
      name: "Visitation",
      description: "On-site visitation metrics across all tour formats.",
      sort_order: 30,
    },
    kpi: {
      slug: "tour-attendance",
      name: "Tour Attendance",
      unit: "visitors",
      format: "number",
      description: "Total visitors served via guided and self-guided tours.",
    },
    monthly: {
      2023: { 1: 0, 2: 0, 3: 1820, 4: 3240, 5: 5680, 6: 7820, 7: 9120, 8: 8940, 9: 6120, 10: 4380, 11: 1620, 12: 0 },
      2024: { 1: 0, 2: 0, 3: 2080, 4: 3720, 5: 6480, 6: 8920, 7: 10420, 8: 10180, 9: 6940, 10: 4980, 11: 1840, 12: 0 },
      2025: { 1: 0, 2: 0, 3: 2360, 4: 4220, 5: 7340, 6: 10120, 7: 11820, 8: 11520, 9: 7860, 10: 5640, 11: 2080, 12: 0 },
      2026: { 1: 0, 2: 0, 3: 2640, 4: 4720, 5: 8240, 6: 11320 },
    },
  },
  {
    category: {
      slug: "development",
      name: "Development & Membership",
      description: "Fundraising and membership health.",
      sort_order: 40,
    },
    kpi: {
      slug: "membership-growth",
      name: "Active Memberships",
      unit: "members",
      format: "number",
      description: "Active memberships at end of month (rolling total).",
    },
    monthly: {
      2023: { 1: 1820, 2: 1840, 3: 1870, 4: 1920, 5: 1980, 6: 2050, 7: 2090, 8: 2110, 9: 2120, 10: 2150, 11: 2180, 12: 2220 },
      2024: { 1: 2240, 2: 2270, 3: 2310, 4: 2380, 5: 2460, 6: 2540, 7: 2590, 8: 2620, 9: 2640, 10: 2680, 11: 2720, 12: 2780 },
      2025: { 1: 2810, 2: 2850, 3: 2900, 4: 2980, 5: 3080, 6: 3170, 7: 3230, 8: 3270, 9: 3300, 10: 3340, 11: 3390, 12: 3450 },
      2026: { 1: 3510, 2: 3580, 3: 3660, 4: 3750, 5: 3860, 6: 3960 },
    },
  },
  {
    category: {
      slug: "development",
      name: "Development & Membership",
      description: "Fundraising and membership health.",
      sort_order: 41,
    },
    kpi: {
      slug: "donations",
      name: "Donations Received",
      unit: "USD",
      format: "currency",
      description: "Total charitable contributions received in month (cash + pledges).",
    },
    monthly: {
      2023: { 1: 18400, 2: 22100, 3: 31800, 4: 41200, 5: 38600, 6: 52400, 7: 48700, 8: 39600, 9: 44800, 10: 38200, 11: 86400, 12: 142800 },
      2024: { 1: 21200, 2: 24800, 3: 36400, 4: 47800, 5: 44200, 6: 60800, 7: 56200, 8: 45600, 9: 51400, 10: 44800, 11: 99400, 12: 162400 },
      2025: { 1: 24600, 2: 28200, 3: 41200, 4: 54400, 5: 50600, 6: 69200, 7: 64800, 8: 52400, 9: 58400, 10: 51200, 11: 114200, 12: 188400 },
      2026: { 1: 28200, 2: 32400, 3: 47800, 4: 62800, 5: 58400, 6: 79400 },
    },
  },
  {
    category: {
      slug: "engagement",
      name: "Audience Engagement",
      description: "How people discover, visit, and connect with the site.",
      sort_order: 11,
    },
    kpi: {
      slug: "social-media-engagement",
      name: "Social Media Engagement",
      unit: "interactions",
      format: "number",
      description: "Total reactions, comments, shares, and saves across all social platforms.",
    },
    monthly: {
      2023: { 1: 8400, 2: 9100, 3: 12400, 4: 14600, 5: 18200, 6: 21800, 7: 22400, 8: 21200, 9: 18800, 10: 17400, 11: 12800, 12: 9800 },
      2024: { 1: 10200, 2: 11100, 3: 15200, 4: 17800, 5: 22400, 6: 26800, 7: 27600, 8: 26200, 9: 23200, 10: 21400, 11: 15800, 12: 12100 },
      2025: { 1: 12400, 2: 13400, 3: 18400, 4: 21800, 5: 27400, 6: 32800, 7: 33800, 8: 32200, 9: 28400, 10: 26200, 11: 19400, 12: 14800 },
      2026: { 1: 14600, 2: 15800, 3: 21800, 4: 25800, 5: 32400, 6: 38400 },
    },
  },
];

function main() {
  const db = getDb();
  console.log("Resetting KPI data...");
  db.exec("DELETE FROM monthly_entries;");
  db.exec("DELETE FROM kpis;");
  db.exec("DELETE FROM categories;");

  // Deduplicate categories by slug — multiple KPIs may share a category.
  const categoryBySlug = new Map<string, { id: number }>();
  for (const seed of SEEDS) {
    let cat = categoryBySlug.get(seed.category.slug);
    if (!cat) {
      const created = createCategory(seed.category);
      cat = { id: created.id };
      categoryBySlug.set(seed.category.slug, cat);
    }
    const kpi = createKPI({
      category_id: cat.id,
      slug: seed.kpi.slug,
      name: seed.kpi.name,
      unit: seed.kpi.unit,
      format: seed.kpi.format,
      description: seed.kpi.description,
    });
    let entryCount = 0;
    for (const [yearStr, monthly] of Object.entries(seed.monthly)) {
      const year = Number(yearStr);
      for (const [monthStr, value] of Object.entries(monthly)) {
        const month = Number(monthStr);
        upsertEntry({
          kpi_id: kpi.id,
          year,
          month,
          value,
          notes: null,
        });
        entryCount++;
      }
    }
    console.log(`  - ${seed.kpi.name}: ${entryCount} entries across ${Object.keys(seed.monthly).length} years`);
  }

  ensureSeedAdmin();
  const kpis = listKPIs();
  const allYears = Array.from(new Set(SEEDS.flatMap((s) => Object.keys(s.monthly).map(Number)))).sort();
  console.log(`\nSeed complete. ${kpis.length} KPIs ready across ${allYears[0]}–${allYears[allYears.length - 1]}.`);
}

main();