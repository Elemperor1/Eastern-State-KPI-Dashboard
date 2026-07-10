import { describe, expect, it } from "vitest";
import { buildMetricDetailModel } from "./metric-detail";
import type { ComparePeriod, DashboardData } from "./types";
import type {
  BreakdownEntryWithMeta,
  Category,
  KPIWithCategory,
  KpiGoalWithMeta,
  MonthlyEntryWithMeta,
} from "@/lib/types";

const category: Category = {
  id: 1,
  slug: "museum",
  name: "Museum",
  description: "Museum metrics",
  sort_order: 1,
};

function kpi(overrides: Partial<KPIWithCategory>): KPIWithCategory {
  return {
    id: 1,
    category_id: category.id,
    parent_id: null,
    slug: "visitors",
    name: "Visitors",
    unit: "visitors",
    unit_type: "count",
    reporting_frequency: "monthly",
    direction: "higher",
    description: null,
    sort_order: 1,
    is_active: 1,
    created_at: "2026-01-01",
    category_name: category.name,
    category_slug: category.slug,
    ...overrides,
  };
}

function entry(overrides: Partial<MonthlyEntryWithMeta>): MonthlyEntryWithMeta {
  return {
    id: 1,
    kpi_id: 1,
    year: 2026,
    month: 1,
    value: 10,
    notes: null,
    updated_by: null,
    updated_at: "2026-01-01",
    kpi_name: "Visitors",
    kpi_unit: "visitors",
    kpi_unit_type: "count",
    category_id: category.id,
    category_name: category.name,
    category_slug: category.slug,
    ...overrides,
  };
}

function breakdown(overrides: Partial<BreakdownEntryWithMeta>): BreakdownEntryWithMeta {
  return {
    id: 1,
    kpi_id: 3,
    year: 2026,
    month: 0,
    label: "Foundations",
    value: 10,
    sort_order: 1,
    notes: null,
    updated_by: null,
    updated_at: "2026-01-01",
    kpi_name: "Breakdown",
    kpi_unit: "count",
    category_id: category.id,
    category_name: category.name,
    category_slug: category.slug,
    ...overrides,
  };
}

function goal(overrides: Partial<KpiGoalWithMeta>): KpiGoalWithMeta {
  return {
    id: 1,
    kpi_id: 1,
    target_year: 2026,
    baseline_year: 2025,
    goal_type: "number",
    target_value: 100,
    enabled: true,
    notes: null,
    created_by: null,
    created_at: "2026-01-01",
    updated_by: null,
    updated_at: "2026-01-01",
    kpi_name: "Visitors",
    kpi_slug: "visitors",
    kpi_unit: "visitors",
    kpi_unit_type: "count",
    category_id: category.id,
    category_name: category.name,
    category_slug: category.slug,
    direction: "higher",
    reporting_frequency: "monthly",
    progress_year: 2026,
    ytd_value: 150,
    ytd_target: 100,
    ytd_progress_pct: 100,
    full_year_value: 150,
    full_year_target: 200,
    full_year_progress_pct: 75,
    ...overrides,
  };
}

const visitorsKpi = kpi({ id: 1, slug: "visitors", name: "Visitors" });
const annualKpi = kpi({
  id: 2,
  slug: "budget",
  name: "Budget",
  unit: "USD",
  unit_type: "currency",
  reporting_frequency: "annual",
});
const annualBreakdownKpi = kpi({
  id: 3,
  slug: "funders-by-breakdown",
  name: "Funders by breakdown",
  unit_type: "breakdown",
});
const donorConversionKpi = kpi({
  id: 4,
  slug: "percent-cultivated-donors",
  name: "People referred to development who became donors",
  unit_type: "breakdown",
});

const period: ComparePeriod = {
  currentYear: 2026,
  compareYear: 2025,
  currentMonth: 2,
};

const data: DashboardData = {
  strategicBoardReport: {
    organizationName: "Eastern State",
    selectedYear: 2026,
    organizationGoalCompletion: {
      completedGoalsCount: 0,
      totalEligibleGoalsCount: 0,
      completionPercentage: null,
      excludedGoalsCount: 0,
      excludedGoalReasons: [],
      countLabel: "0 of 0 goals completed",
    },
    priorities: [],
    unresolvedReasons: [],
  },
  strategicSummary: {
    selectedYear: 2026,
    organization: {
      completedGoalsCount: 0,
      totalEligibleGoalsCount: 0,
      completionPercentage: null,
      excludedGoalsCount: 0,
      excludedGoalReasons: [],
    },
    priorities: [],
    goals: [],
  },
  categories: [category],
  kpis: [visitorsKpi, annualKpi, annualBreakdownKpi, donorConversionKpi],
  entries: [
    entry({ id: 1, kpi_id: visitorsKpi.id, year: 2026, month: 1, value: 100, notes: "Jan" }),
    entry({ id: 2, kpi_id: visitorsKpi.id, year: 2026, month: 2, value: 50 }),
    entry({ id: 3, kpi_id: visitorsKpi.id, year: 2025, month: 1, value: 60 }),
    entry({ id: 4, kpi_id: visitorsKpi.id, year: 2025, month: 2, value: 40 }),
    entry({ id: 5, kpi_id: annualKpi.id, year: 2026, month: 0, value: 5000 }),
    entry({ id: 6, kpi_id: annualKpi.id, year: 2025, month: 0, value: 4000 }),
  ],
  breakdowns: [
    breakdown({ id: 1, kpi_id: annualBreakdownKpi.id, year: 2026, month: 0, label: "Foundations", value: 7 }),
    breakdown({ id: 2, kpi_id: annualBreakdownKpi.id, year: 2025, month: 0, label: "Foundations", value: 5 }),
    breakdown({ id: 3, kpi_id: annualBreakdownKpi.id, year: 2024, month: 0, label: "Foundations", value: 4 }),
    breakdown({ id: 4, kpi_id: donorConversionKpi.id, year: 2026, month: 1, label: "Referred", value: 20 }),
    breakdown({ id: 5, kpi_id: donorConversionKpi.id, year: 2026, month: 1, label: "Donors", value: 10 }),
  ],
  goals: [
    goal({ id: 1, kpi_id: visitorsKpi.id, target_year: 2026 }),
    goal({ id: 2, kpi_id: visitorsKpi.id, target_year: 2025, target_value: 1 }),
  ],
  years: [2025, 2026],
  sampleData: true,
};

describe("reporting metric detail model", () => {
  it("builds analytics, trend points, selected-year goal, ytd bar, and table rows", () => {
    const model = buildMetricDetailModel(data, visitorsKpi.slug, period);

    expect(model.kpi?.slug).toBe("visitors");
    expect(model.category?.slug).toBe("museum");
    expect(model.isAnnual).toBe(false);
    expect(model.isBreakdown).toBe(false);
    expect(model.goal?.target_year).toBe(2026);
    expect(model.analytics?.ytdComparison.currentValue).toBe(150);
    expect(model.analytics?.ytdComparison.compareValue).toBe(100);
    expect(model.trendYears).toEqual([2025, 2026]);
    expect(model.trendPoints).toHaveLength(12);
    expect(model.ytdBar).toEqual([{ label: "Through February", 2025: 100, 2026: 150 }]);
    expect(model.tableRows[0]).toEqual({
      period: "Jan 2026",
      value: 100,
      notes: "Jan",
      compare: 60,
    });
    expect(model.directionLabel).toBe("Higher is better");
  });

  it("uses the nearest upcoming strategic goal when the selected year has none", () => {
    const strategicData = {
      ...data,
      goals: [
        goal({ id: 3, kpi_id: visitorsKpi.id, target_year: 2029 }),
        goal({ id: 4, kpi_id: visitorsKpi.id, target_year: 2027 }),
      ],
    };

    const model = buildMetricDetailModel(strategicData, visitorsKpi.slug, period);

    expect(model.goal?.target_year).toBe(2027);
  });

  it("builds annual models with full-year ytd bar labels and annual table rows", () => {
    const model = buildMetricDetailModel(data, annualKpi.slug, period);

    expect(model.isAnnual).toBe(true);
    expect(model.ytdBar).toEqual([{ label: "Full year", 2025: 4000, 2026: 5000 }]);
    expect(model.tableRows).toEqual([
      { period: "2025", value: 4000, notes: null },
      { period: "2026", value: 5000, notes: null },
    ]);
  });

  it("routes monthly breakdown metrics to donor conversion rows", () => {
    const model = buildMetricDetailModel(data, donorConversionKpi.slug, period);

    expect(model.isBreakdown).toBe(true);
    expect(model.breakdown?.kind).toBe("donor-conversion");
    expect(model.breakdown?.breakdowns.map((row) => row.label)).toEqual([
      "Referred",
      "Donors",
    ]);
  });

  it("routes annual breakdown metrics to current/compare month-zero rows", () => {
    const model = buildMetricDetailModel(data, annualBreakdownKpi.slug, period);

    expect(model.isBreakdown).toBe(true);
    expect(model.breakdown?.kind).toBe("annual-breakdown");
    expect(model.breakdown?.breakdowns.map((row) => [row.year, row.month, row.label])).toEqual([
      [2026, 0, "Foundations"],
      [2025, 0, "Foundations"],
    ]);
  });

  it("returns an empty model for an unknown KPI slug", () => {
    const model = buildMetricDetailModel(data, "missing", period);

    expect(model.kpi).toBeNull();
    expect(model.category).toBeNull();
    expect(model.analytics).toBeNull();
    expect(model.tableRows).toEqual([]);
  });
});
