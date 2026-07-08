import { describe, expect, it } from "vitest";
import { buildCategoryPageModel } from "./category-page";
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
    kpi_id: 2,
    year: 2026,
    month: 0,
    label: "Group",
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
const monthlyBreakdownKpi = kpi({
  id: 2,
  slug: "percent-cultivated-donors",
  name: "People referred to development who became donors",
  unit_type: "breakdown",
});
const annualBreakdownKpi = kpi({
  id: 3,
  slug: "funders-by-breakdown",
  name: "Funders by breakdown",
  unit_type: "breakdown",
});
const otherCategoryKpi = kpi({
  id: 4,
  category_id: 2,
  category_slug: "other",
  category_name: "Other",
  slug: "other-kpi",
  name: "Other KPI",
});

const period: ComparePeriod = {
  currentYear: 2026,
  compareYear: 2025,
  currentMonth: 2,
};

const data: DashboardData = {
  categories: [category],
  kpis: [visitorsKpi, monthlyBreakdownKpi, annualBreakdownKpi, otherCategoryKpi],
  entries: [
    entry({ id: 1, kpi_id: visitorsKpi.id, year: 2026, month: 1, value: 100 }),
    entry({ id: 2, kpi_id: visitorsKpi.id, year: 2026, month: 2, value: 50 }),
    entry({ id: 3, kpi_id: visitorsKpi.id, year: 2025, month: 1, value: 60 }),
    entry({ id: 4, kpi_id: visitorsKpi.id, year: 2025, month: 2, value: 40 }),
    entry({ id: 5, kpi_id: otherCategoryKpi.id, year: 2026, month: 1, value: 999 }),
  ],
  breakdowns: [
    breakdown({ id: 1, kpi_id: monthlyBreakdownKpi.id, year: 2026, month: 1, label: "Referred", value: 20 }),
    breakdown({ id: 2, kpi_id: monthlyBreakdownKpi.id, year: 2026, month: 1, label: "Donors", value: 10 }),
    breakdown({ id: 3, kpi_id: annualBreakdownKpi.id, year: 2026, month: 0, label: "Foundations", value: 7 }),
    breakdown({ id: 4, kpi_id: annualBreakdownKpi.id, year: 2025, month: 0, label: "Foundations", value: 5 }),
    breakdown({ id: 5, kpi_id: annualBreakdownKpi.id, year: 2024, month: 0, label: "Foundations", value: 4 }),
  ],
  goals: [
    goal({ id: 1, kpi_id: visitorsKpi.id, target_year: 2026 }),
    goal({ id: 2, kpi_id: visitorsKpi.id, target_year: 2025, target_value: 1 }),
  ],
  years: [2025, 2026],
  sampleData: true,
};

describe("reporting category page model", () => {
  it("builds metric card analytics and selected-year goals for the category", () => {
    const model = buildCategoryPageModel(data, category.slug, period);

    expect(model.category?.slug).toBe("museum");
    expect(model.metricCards).toHaveLength(1);
    expect(model.metricCards[0].kpi.slug).toBe("visitors");
    expect(model.metricCards[0].goal?.target_year).toBe(2026);
    expect(model.metricCards[0].analytics.ytdComparison.currentValue).toBe(150);
    expect(model.metricCards[0].analytics.ytdComparison.compareValue).toBe(100);
  });

  it("separates monthly and annual breakdown sections with chart-ready rows", () => {
    const model = buildCategoryPageModel(data, category.slug, period);

    expect(model.monthlyBreakdowns.map((section) => section.kpi.slug)).toEqual([
      "percent-cultivated-donors",
    ]);
    expect(model.monthlyBreakdowns[0].breakdowns.map((row) => row.label)).toEqual([
      "Referred",
      "Donors",
    ]);
    expect(model.annualBreakdowns.map((section) => section.kpi.slug)).toEqual([
      "funders-by-breakdown",
    ]);
    expect(model.annualBreakdowns[0].breakdowns.map((row) => [row.year, row.month, row.label])).toEqual([
      [2026, 0, "Foundations"],
      [2025, 0, "Foundations"],
    ]);
  });

  it("returns an empty model for an unknown category slug", () => {
    const model = buildCategoryPageModel(data, "missing", period);

    expect(model.category).toBeNull();
    expect(model.metricCards).toEqual([]);
    expect(model.monthlyBreakdowns).toEqual([]);
    expect(model.annualBreakdowns).toEqual([]);
  });
});
