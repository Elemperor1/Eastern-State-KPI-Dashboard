import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StrategicBoardKpiViewModel } from "@/features/reporting/strategic-board-report";
import type { StrategicCalculatedActual } from "@/features/reporting/strategy-actuals";
import { StrategicKpiProgressPanel } from "./StrategicKpiProgressPanel";

describe("StrategicKpiProgressPanel", () => {
  it("renders recalculated history and an accessible demographic chart with its table", () => {
    const html = renderToStaticMarkup(
      <StrategicKpiProgressPanel
        kpi={kpi()}
        history={[actual()]}
      />,
    );

    expect(html).toContain("First-class strategic observations");
    expect(html).toContain("January 2026");
    expect(html).toContain("25 / 40");
    expect(html).toContain("Audience race demographic distribution chart");
    expect(html).toContain("People of color: 40% of respondents");
    expect(html).toContain("Unknown: not reported");
    expect(html).not.toContain("Unknown: 0% of respondents");
    expect(html).toContain("Audience race demographic distribution");
  });
});

function kpi(): StrategicBoardKpiViewModel {
  return {
    id: "1",
    name: "Audience race",
    measurementType: "distribution",
    reportingFrequency: "annual",
    unit: "percent",
    result: {
      state: "ok",
      value: null,
      displayValue: "Distribution reported",
      numerator: null,
      denominator: 10,
      respondentCount: 10,
      formulaExplanation: "Category count divided by respondent total.",
    },
    annualProgress: null,
    fullPlanProgress: null,
    boardStatus: "on_track",
    configurationStatus: "active",
    components: [],
    demographics: {
      respondentTotal: 10,
      mutuallyExclusive: true,
      populationCaveat: "Survey respondents are not every visitor.",
      derivedNonWhitePercentage: 40,
      bands: [
        {
          id: "1",
          label: "White",
          count: 6,
          percentage: 60,
          isUnknown: false,
          isDeclined: false,
          derivedGroup: "white",
        },
        {
          id: "2",
          label: "People of color",
          count: 4,
          percentage: 40,
          isUnknown: false,
          isDeclined: false,
          derivedGroup: "non_white",
        },
        {
          id: "3",
          label: "Unknown",
          count: null,
          percentage: null,
          isUnknown: true,
          isDeclined: false,
          derivedGroup: null,
        },
      ],
    },
    revenueBreakdown: null,
    unresolvedReasons: [],
  };
}

function actual(): StrategicCalculatedActual {
  return {
    kpiId: 1,
    year: 2026,
    periodType: "monthly",
    periodIndex: 1,
    value: 62.5,
    calculation: {
      state: "ok",
      measurementType: "percentage",
      value: 62.5,
      normalizedPercentage: 62.5,
      numerator: 25,
      denominator: 40,
      respondentCount: null,
      precision: 1,
      issues: [],
    },
  };
}
