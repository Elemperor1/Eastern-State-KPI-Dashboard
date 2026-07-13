import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  StrategicBoardCsvRow,
  StrategicBoardKpiViewModel,
} from "@/features/reporting/strategic-board-report";
import type { StrategicCalculatedActual } from "@/features/reporting/strategy-actuals";
import type { DashboardData } from "@/features/reporting/types";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { MetricDetailClient, strategicBoardRowsForKpi } from "./MetricDetailClient";

describe("MetricDetailClient strategic history", () => {
  it("selects board CSV rows by stable KPI id when display names collide", () => {
    const rows = [
      { "KPI ID": "11", KPI: "Duplicate display name", "Detail Type": "kpi" },
      { "KPI ID": "22", KPI: "Duplicate display name", "Detail Type": "kpi" },
      { "KPI ID": "22", KPI: "Duplicate display name", "Detail Type": "component" },
    ] as StrategicBoardCsvRow[];

    expect(strategicBoardRowsForKpi(rows, "22")).toEqual([rows[1], rows[2]]);
  });

  it("shows cumulative first-class history without annual legacy charts or tables", () => {
    const html = renderMetric({
      legacyReportingFrequency: "annual",
      strategicKpi: strategicKpi({
        measurementType: "cumulative",
        reportingFrequency: "annual",
      }),
      strategicActuals: [strategicActual("cumulative")],
    });

    expect(html).toContain("Cumulative through 2026");
    expect(html).toContain("Calculated and retained results");
    expect(html).not.toContain("Annual results by reporting year");
    expect(html).not.toContain("Annual values");
    expect(html).not.toContain("Export history CSV");
    expect(html).not.toContain("Through month");
  });

  it("does not render an annual legacy chart for a monthly successor definition", () => {
    const html = renderMetric({
      legacyReportingFrequency: "annual",
      strategicKpi: strategicKpi({
        measurementType: "count",
        reportingFrequency: "monthly",
      }),
      strategicActuals: [],
    });

    expect(html).toContain("Monthly");
    expect(html).toContain("Through month");
    expect(html).not.toContain("Annual results by reporting year");
    expect(html).not.toContain("Annual values");
    expect(html).not.toContain("Export history CSV");
  });

  it("does not duplicate cadence-matching legacy history after first-class observations exist", () => {
    const html = renderMetric({
      legacyReportingFrequency: "annual",
      strategicKpi: strategicKpi({
        measurementType: "count",
        reportingFrequency: "annual",
      }),
      strategicActuals: [strategicActual("annual")],
    });

    expect(html).toContain("Annual · 2026");
    expect(html).toContain("Calculated and retained results");
    expect(html).not.toContain("Annual results by reporting year");
    expect(html).not.toContain("Annual values");
    expect(html).not.toContain("Export history CSV");
  });

  it("renders calculated YOY history instead of labeling raw legacy counts as results", () => {
    const html = renderMetric({
      legacyReportingFrequency: "annual",
      legacyValues: [14, 17],
      strategicKpi: strategicKpi({
        measurementType: "year_over_year",
        reportingFrequency: "annual",
        unit: "partnerships",
      }),
      strategicActuals: [],
    });

    expect(html).toContain("Calculated and retained results");
    expect(html).toContain("+21.4%");
    expect(html).toContain("17 current / 14 prior");
    expect(html).toContain("retained current and prior raw inputs");
    expect(html).not.toContain("Year-over-year result");
    expect(html).not.toContain("Annual values");
    expect(html).not.toContain("Export history CSV");
  });

  it("retains cumulative annual rows with annual period labels and compatibility copy", () => {
    const html = renderMetric({
      legacyReportingFrequency: "annual",
      legacyValues: [1, 2],
      strategicKpi: strategicKpi({
        measurementType: "cumulative",
        reportingFrequency: "annual",
        unit: "upgrades",
      }),
      strategicActuals: [],
    });

    expect(html).toContain("Annual · 2026");
    expect(html).toContain("2 upgrades");
    expect(html).toContain("Retained compatibility value");
    expect(html).toContain("retained from legacy annual reporting");
    expect(html).not.toContain("Annual results by reporting year");
    expect(html).not.toContain("Annual values");
  });

  it("retains one-time binary rows with one-time labels and truthful values", () => {
    const html = renderMetric({
      legacyReportingFrequency: "annual",
      legacyValues: [0, 1],
      strategicKpi: strategicKpi({
        measurementType: "binary",
        reportingFrequency: "one_time",
        unit: "Yes/No",
      }),
      strategicActuals: [],
    });

    expect(html).toContain("One-time result · 2026");
    expect(html).toContain("Complete");
    expect(html).toContain("One-time result · 2025");
    expect(html).toContain("Not complete");
    expect(html).toContain("Retained compatibility value");
    expect(html).not.toContain("Annual results by reporting year");
    expect(html).not.toContain("Annual values");
  });
});

function renderMetric({
  legacyReportingFrequency,
  legacyValues,
  strategicKpi: kpiView,
  strategicActuals,
}: {
  legacyReportingFrequency: "monthly" | "annual";
  legacyValues?: [number, number];
  strategicKpi: StrategicBoardKpiViewModel;
  strategicActuals: StrategicCalculatedActual[];
}): string {
  return renderToStaticMarkup(
    <MetricDetailClient
      data={dashboardData({
        legacyReportingFrequency,
        legacyValues,
        strategicKpi: kpiView,
        strategicActuals,
      })}
      kpiSlug="test-kpi"
      initialState={{ currentYear: 2026, compareYear: 2025, currentMonth: 6 }}
      legacyPdfEnabled={false}
    />,
  );
}

function dashboardData({
  legacyReportingFrequency,
  legacyValues = [5, 6],
  strategicKpi: kpiView,
  strategicActuals,
}: {
  legacyReportingFrequency: "monthly" | "annual";
  legacyValues?: [number, number];
  strategicKpi: StrategicBoardKpiViewModel;
  strategicActuals: StrategicCalculatedActual[];
}): DashboardData {
  const category = {
    id: 1,
    slug: "test-priority",
    name: "Test priority",
    description: null,
    sort_order: 1,
  };
  const kpi = {
    id: 1,
    category_id: category.id,
    parent_id: null,
    slug: "test-kpi",
    name: "Test KPI",
    unit: kpiView.unit ?? "items",
    unit_type: "count" as const,
    reporting_frequency: legacyReportingFrequency,
    direction: "higher" as const,
    description: "A cadence-sensitive KPI.",
    sort_order: 1,
    is_active: 1,
    created_at: "2025-01-01 00:00:00",
    category_name: category.name,
    category_slug: category.slug,
  };
  const entries = [2025, 2026].map((year, index) => ({
    id: index + 1,
    kpi_id: kpi.id,
    year,
    month: legacyReportingFrequency === "annual" ? 0 : 6,
    value: legacyValues[index],
    notes: null,
    updated_by: null,
    updated_at: `${year}-12-31 00:00:00`,
    kpi_name: kpi.name,
    kpi_unit: kpi.unit,
    kpi_unit_type: kpi.unit_type,
    category_id: category.id,
    category_name: category.name,
    category_slug: category.slug,
  }));

  return {
    categories: [category],
    kpis: [kpi],
    entries,
    breakdowns: [],
    goals: [],
    years: [2025, 2026],
    sampleData: true,
    strategicSummary: {} as DashboardData["strategicSummary"],
    strategicBoardReport: {
      organizationName: "Eastern State Penitentiary Historic Site",
      selectedYear: 2026,
      organizationGoalCompletion: completion(),
      priorities: [{
        id: "1",
        name: category.name,
        goalCompletion: completion(),
        goals: [{
          id: "1",
          name: "Test strategic goal",
          completionStatus: "not_reported",
          actualCompletionPercentage: null,
          displayCompletionPercentage: null,
          completedKpisCount: 0,
          totalEligibleKpisCount: 0,
          excludedKpisCount: 1,
          excludedReasons: [],
          kpis: [kpiView],
        }],
      }],
      unresolvedReasons: [],
    },
    strategicActuals,
    strategicAuditEvents: [],
  };
}

function strategicKpi(
  overrides: Pick<
    StrategicBoardKpiViewModel,
    "measurementType" | "reportingFrequency"
  > & Partial<Pick<StrategicBoardKpiViewModel, "unit">>,
): StrategicBoardKpiViewModel {
  return {
    id: "1",
    name: "Test KPI",
    unit: "items",
    ...overrides,
    result: {
      state: "ok",
      value: 6,
      displayValue: "6 items",
      numerator: null,
      denominator: null,
      respondentCount: null,
      formulaExplanation: "Retained strategic input.",
    },
    annualProgress: null,
    fullPlanProgress: null,
    boardStatus: "on_track",
    configurationStatus: "active",
    components: [],
    demographics: null,
    revenueBreakdown: null,
    unresolvedReasons: [],
  };
}

function strategicActual(
  periodType: StrategicCalculatedActual["periodType"],
): StrategicCalculatedActual {
  return {
    kpiId: 1,
    year: 2026,
    periodType,
    periodIndex: periodType === "annual" ? 0 : 0,
    value: 6,
    calculation: {
      state: "ok",
      measurementType: periodType === "cumulative" ? "cumulative" : "count",
      value: 6,
      normalizedPercentage: null,
      numerator: null,
      denominator: null,
      respondentCount: null,
      precision: 0,
      issues: [],
    },
  };
}

function completion() {
  return {
    completedGoalsCount: 0,
    totalEligibleGoalsCount: 0,
    completionPercentage: null,
    excludedGoalsCount: 0,
    excludedGoalReasons: [],
    countLabel: "0 of 0",
  };
}
