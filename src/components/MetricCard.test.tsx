import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  BoardMeasurementType,
  StrategicBoardKpiViewModel,
  TargetProgressViewModel,
} from "@/features/reporting/strategic-board-report";
import type { KPIAnalytics } from "@/lib/types";
import { MetricCard } from "./MetricCard";

describe("MetricCard strategic presentation", () => {
  it("shows measurement, scoped target amounts and years, descriptions, progress, and board status", () => {
    const html = renderToStaticMarkup(
      <MetricCard analytics={analytics()} strategic={strategic()} />,
    );

    expect(html).toContain("Cumulative");
    expect(html).toContain("On Track");
    expect(html).toContain("3 upgrades");
    expect(html).toContain("Reporting year 2026");
    expect(html).toContain("Complete three visitor amenity upgrades in 2026.");
    expect(html).toContain("5 upgrades");
    expect(html).toContain("Plan target year 2029");
    expect(html).toContain("Complete five visitor amenity upgrades by 2029.");
    expect(html).toContain("Annual");
    expect(html).toContain("Full plan");
    expect(html).toContain("Pacing: On Track toward 1");
    expect(html).toContain("40%");
    expect(html).not.toContain("+100.0%");
    expect(html).not.toContain("vs 2025");
  });

  it("renders unresolved status and a nonnumeric missing target without a zero progress bar", () => {
    const unresolved = strategic();
    unresolved.configurationStatus = "needs_target";
    unresolved.fullPlanProgress = {
      ...progress(),
      targetValue: null,
      hasTarget: false,
      actualProgressPercentage: null,
      displayProgressPercentage: null,
      status: "target_not_finalized",
      targetDescription: null,
      targetDisplayText: "Target not finalized",
    };
    unresolved.unresolvedReasons = ["Finalize the board-approved target."];
    const html = renderToStaticMarkup(
      <MetricCard analytics={analytics()} strategic={unresolved} />,
    );

    expect(html).toContain("Needs Target");
    expect(html).toContain("Target not finalized");
    expect(html).toContain("Plan target year 2029");
    expect(html).toContain("Finalize the board-approved target.");
    expect(html).toContain("role=\"status\"");
    expect(html).not.toContain("Full plan progress for Visitor upgrades\" aria-valuenow=\"0\"");
  });

  it.each<BoardMeasurementType>([
    "binary",
    "milestone",
    "count",
    "percentage",
    "average",
    "cumulative",
    "distribution",
    "currency",
    "ratio",
  ])(
    "does not reuse Legacy Entry comparison claims for a %s strategic KPI",
    (measurementType) => {
      const view = strategic();
      view.measurementType = measurementType;

      const html = renderToStaticMarkup(
        <MetricCard analytics={analytics()} strategic={view} />,
      );

      expect(html).not.toContain("+100.0%");
      expect(html).not.toContain("vs 2025");
    },
  );

  it("does not fabricate a parent comparison for a component-only strategic KPI", () => {
    const componentOnly = strategic();
    componentOnly.measurementType = "multi_component";
    componentOnly.result = {
      state: "missing",
      value: null,
      displayValue: "See components",
      numerator: null,
      denominator: null,
      respondentCount: null,
      formulaExplanation:
        "Components calculate independently without a parent aggregation.",
    };
    componentOnly.components = [
      {
        id: "component-1",
        label: "Visitor satisfaction",
        measurementType: "percentage",
        unit: "%",
        result: {
          state: "ok",
          value: 85,
          displayValue: "85%",
          numerator: 85,
          denominator: 100,
          respondentCount: 100,
          formulaExplanation: "Positive responses divided by respondents.",
        },
        progress: null,
        configurationStatus: "active",
        unresolvedReasons: [],
      },
    ];

    const html = renderToStaticMarkup(
      <MetricCard analytics={analytics()} strategic={componentOnly} />,
    );

    expect(html).toContain("See components");
    expect(html).not.toContain("+100.0%");
    expect(html).not.toContain("vs 2025");
  });

  it("uses the strategic calculated result for an explicit year-over-year KPI", () => {
    const yearOverYear = strategic();
    yearOverYear.measurementType = "year_over_year";
    yearOverYear.result = {
      ...yearOverYear.result,
      value: 20,
      displayValue: "+20%",
      numerator: 10,
      denominator: 50,
      formulaExplanation:
        "Current value minus previous value, divided by the absolute previous value.",
    };

    const html = renderToStaticMarkup(
      <MetricCard analytics={analytics()} strategic={yearOverYear} />,
    );

    expect(html).toContain("+20%");
    expect(html).toContain("year over year");
    expect(html).not.toContain("+100.0%");
    expect(html).not.toContain("vs 2025");
  });

  it("preserves Dashboard Comparison behavior when no strategic view model exists", () => {
    const html = renderToStaticMarkup(<MetricCard analytics={analytics()} />);

    expect(html).toContain("+100.0%");
    expect(html).toContain("vs 2025");
  });
});

function strategic(): StrategicBoardKpiViewModel {
  return {
    id: "1",
    name: "Visitor upgrades",
    measurementType: "cumulative",
    reportingFrequency: "annual",
    unit: "upgrades",
    result: {
      state: "ok",
      value: 2,
      displayValue: "2 upgrades",
      numerator: null,
      denominator: null,
      respondentCount: null,
      formulaExplanation: "Cumulative count.",
    },
    annualProgress: {
      ...progress(),
      targetValue: 3,
      actualProgressPercentage: 66.7,
      displayProgressPercentage: 66.7,
      pacingTarget: 1,
      pacingStatus: "on_track",
      targetYear: 2026,
      targetDescription: "Complete three visitor amenity upgrades in 2026.",
      targetDisplayText: "Complete three visitor amenity upgrades in 2026.",
    },
    fullPlanProgress: progress(),
    boardStatus: "on_track",
    configurationStatus: "active",
    components: [],
    demographics: null,
    revenueBreakdown: null,
    unresolvedReasons: [],
  };
}

function progress(): TargetProgressViewModel {
  return {
    actualValue: 2,
    targetValue: 5,
    hasTarget: true,
    actualProgressPercentage: 40,
    displayProgressPercentage: 40,
    isExceeded: false,
    status: "in_progress",
    pacingTarget: null,
    pacingStatus: null,
    targetYear: 2029,
    targetDescription: "Complete five visitor amenity upgrades by 2029.",
    targetDisplayText: "Complete five visitor amenity upgrades by 2029.",
  };
}

function analytics(): KPIAnalytics {
  const comparison = {
    currentValue: 2,
    compareValue: 1,
    delta: 1,
    pctChange: 100,
    ptsChange: null,
    currentYear: 2026,
    compareYear: 2025,
    currentMonth: 12,
    isAnnual: true,
    isEmpty: false,
  };
  return {
    kpi: {
      id: 1,
      category_id: 1,
      parent_id: null,
      slug: "visitor-upgrades",
      name: "Visitor upgrades",
      unit: "upgrades",
      unit_type: "count",
      reporting_frequency: "annual",
      direction: "higher",
      description: null,
      sort_order: 1,
      is_active: 1,
      created_at: "2026-01-01",
      category_name: "Visitor Experience",
      category_slug: "visitor-experience",
    },
    years: [],
    monthlyComparison: comparison,
    ytdComparison: {
      ...comparison,
      throughMonth: 12,
    },
  };
}
