import { describe, expect, it } from "vitest";
import {
  buildCategoryMetricMovement,
  buildCategoryOverviewSummary,
} from "./category-summary";
import type { ComparePeriod, ReportingData } from "./types";
import type {
  BreakdownEntryWithMeta,
  Category,
  KPIWithCategory,
  KpiGoalWithMeta,
  MonthlyEntryWithMeta,
} from "@/lib/types";

const category: Category = {
  id: 1,
  slug: "fundraising",
  name: "Fundraising",
  description: "Fundraising metrics",
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
    kpi_id: 1,
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
    kpi_id: visitorsKpi.id,
    target_year: 2027,
    goal_type: "number",
    target_value: 10,
    enabled: true,
    notes: null,
    created_by: null,
    created_at: "2026-01-01",
    updated_by: null,
    updated_at: "2026-01-01",
    kpi_name: visitorsKpi.name,
    kpi_slug: visitorsKpi.slug,
    kpi_unit: visitorsKpi.unit,
    kpi_unit_type: visitorsKpi.unit_type,
    category_id: category.id,
    category_name: category.name,
    category_slug: category.slug,
    direction: visitorsKpi.direction,
    reporting_frequency: visitorsKpi.reporting_frequency,
    ytd_value: 80,
    ytd_target: 100,
    ytd_progress_pct: 80,
    full_year_value: 80,
    full_year_target: 100,
    full_year_progress_pct: 80,
    ...overrides,
  };
}

const visitorsKpi = kpi({ id: 1, slug: "visitors", name: "Visitors" });
const lowerIsBetterKpi = kpi({
  id: 2,
  slug: "triage",
  name: "Percent of site in triage",
  unit: "%",
  unit_type: "percent",
  direction: "lower",
});
const flatKpi = kpi({ id: 3, slug: "flat", name: "Flat metric" });
const annualBreakdownKpi = kpi({
  id: 4,
  slug: "funders-by-breakdown",
  name: "Funders by breakdown",
  unit_type: "breakdown",
});
const donorConversionKpi = kpi({
  id: 5,
  slug: "percent-cultivated-donors",
  name: "People referred to development who became donors",
  unit_type: "breakdown",
});

const period: ComparePeriod = {
  currentYear: 2026,
  compareYear: 2025,
  currentMonth: 2,
};

const reportingData: ReportingData = {
  categories: [category],
  kpis: [visitorsKpi, lowerIsBetterKpi, flatKpi, annualBreakdownKpi, donorConversionKpi],
  entries: [
    entry({ id: 1, kpi_id: visitorsKpi.id, year: 2026, month: 1, value: 100 }),
    entry({ id: 2, kpi_id: visitorsKpi.id, year: 2026, month: 2, value: 100 }),
    entry({ id: 3, kpi_id: visitorsKpi.id, year: 2025, month: 1, value: 50 }),
    entry({ id: 4, kpi_id: visitorsKpi.id, year: 2025, month: 2, value: 50 }),
    entry({ id: 5, kpi_id: lowerIsBetterKpi.id, year: 2026, month: 1, value: 30 }),
    entry({ id: 6, kpi_id: lowerIsBetterKpi.id, year: 2025, month: 1, value: 20 }),
    entry({ id: 7, kpi_id: flatKpi.id, year: 2026, month: 1, value: 10 }),
    entry({ id: 8, kpi_id: flatKpi.id, year: 2025, month: 1, value: 10 }),
  ],
  breakdowns: [
    breakdown({ id: 1, kpi_id: annualBreakdownKpi.id, year: 2026, month: 0, label: "Foundation", value: 70 }),
    breakdown({ id: 2, kpi_id: annualBreakdownKpi.id, year: 2026, month: 0, label: "Government", value: 50 }),
    breakdown({ id: 3, kpi_id: annualBreakdownKpi.id, year: 2025, month: 0, label: "Foundation", value: 50 }),
    breakdown({ id: 4, kpi_id: annualBreakdownKpi.id, year: 2025, month: 0, label: "Government", value: 50 }),
    breakdown({ id: 5, kpi_id: donorConversionKpi.id, year: 2026, month: 1, label: "Referred", value: 20 }),
    breakdown({ id: 6, kpi_id: donorConversionKpi.id, year: 2026, month: 1, label: "Donors", value: 10 }),
    breakdown({ id: 7, kpi_id: donorConversionKpi.id, year: 2026, month: 2, label: "Referred", value: 20 }),
    breakdown({ id: 8, kpi_id: donorConversionKpi.id, year: 2026, month: 2, label: "Donors", value: 10 }),
    breakdown({ id: 9, kpi_id: donorConversionKpi.id, year: 2025, month: 1, label: "Referred", value: 20 }),
    breakdown({ id: 10, kpi_id: donorConversionKpi.id, year: 2025, month: 1, label: "Donors", value: 5 }),
    breakdown({ id: 11, kpi_id: donorConversionKpi.id, year: 2025, month: 2, label: "Referred", value: 20 }),
    breakdown({ id: 12, kpi_id: donorConversionKpi.id, year: 2025, month: 2, label: "Donors", value: 5 }),
  ],
};

describe("reporting category summaries", () => {
  it("summarizes improving, declining, flat, and top-mover counts for a category", () => {
    const summary = buildCategoryOverviewSummary({
      ...reportingData,
      category,
      period,
      goals: [
        goal({ id: 1, target_year: 2027, full_year_progress_pct: 80 }),
        goal({ id: 2, target_year: 2029, full_year_progress_pct: null }),
        goal({ id: 3, target_year: 2025, full_year_progress_pct: 100 }),
      ],
    });

    expect(summary.total).toBe(5);
    expect(summary.improving).toBe(3);
    expect(summary.declining).toBe(1);
    expect(summary.flat).toBe(1);
    expect(summary.pctImproving).toBe(60);
    expect(summary.topMover?.kpi.slug).toBe("visitors");
    expect(summary.goalCount).toBe(2);
    expect(summary.averageGoalProgress).toBe(80);
    expect(summary.metrics.map((metric) => [metric.kpi.slug, metric.delta])).toEqual([
      ["visitors", 100],
      ["triage", 10],
      ["flat", 0],
      ["funders-by-breakdown", 20],
      ["percent-cultivated-donors", 25],
    ]);
  });

  it("compares monthly donor conversion as donor rate point change through the selected month", () => {
    const movement = buildCategoryMetricMovement({
      kpi: donorConversionKpi,
      entries: reportingData.entries,
      breakdowns: reportingData.breakdowns,
      period,
    });

    expect(movement.pct).toBe(25);
    expect(movement.delta).toBe(25);
    expect(movement.favorable).toBe(true);
  });

  it("treats monthly conversion with no referred people as flat with no percent movement", () => {
    const movement = buildCategoryMetricMovement({
      kpi: donorConversionKpi,
      entries: [],
      breakdowns: [
        breakdown({ id: 1, kpi_id: donorConversionKpi.id, year: 2026, month: 1, label: "Donors", value: 5 }),
        breakdown({ id: 2, kpi_id: donorConversionKpi.id, year: 2025, month: 1, label: "Donors", value: 3 }),
      ],
      period,
    });

    expect(movement.pct).toBeNull();
    expect(movement.delta).toBe(0);
    expect(movement.favorable).toBe(true);
  });
});
