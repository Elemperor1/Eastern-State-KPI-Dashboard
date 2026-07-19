import { describe, expect, it } from "vitest";
import type {
  StrategicBoardKpiViewModel,
  StrategicBoardReportViewModel,
  TargetProgressViewModel,
} from "@/features/reporting/strategic-board-report";
import {
  boardReportProgressAriaText,
  countStrategicBoardReportStructure,
  formatBoardReportCurrency,
  formatBoardReportMetricValue,
  formatBoardReportPercentage,
  formatBoardReportTarget,
  formatBoardReportToken,
} from "./strategic-board-report-presentation";

function kpi(id: string): StrategicBoardKpiViewModel {
  return {
    id,
    name: id,
    measurementType: "count",
    reportingFrequency: "annual",
    unit: "items",
    result: {
      state: "ok",
      value: 1,
      displayValue: "1 item",
      numerator: null,
      denominator: null,
      respondentCount: null,
      formulaExplanation: null,
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

function report(): StrategicBoardReportViewModel {
  return {
    organizationName: "Eastern State",
    organizationSlug: "eastern-state",
    selectedYear: 2027,
    reportingPeriod: "Full year",
    organizationGoalCompletion: {
      completedGoalsCount: 1,
      totalEligibleGoalsCount: 2,
      completionPercentage: 50,
      excludedGoalsCount: 0,
      excludedGoalReasons: [],
      countLabel: "1 of 2 goals completed",
    },
    unresolvedReasons: [],
    priorities: [
      {
        id: "one",
        name: "Priority one",
        goalCompletion: {
          completedGoalsCount: 1,
          totalEligibleGoalsCount: 1,
          completionPercentage: 100,
          excludedGoalsCount: 0,
          excludedGoalReasons: [],
          countLabel: "1 of 1 goals completed",
        },
        goals: [
          {
            id: "goal-one",
            name: "Goal one",
            completionStatus: "complete",
            actualCompletionPercentage: 100,
            displayCompletionPercentage: 100,
            completedKpisCount: 2,
            totalEligibleKpisCount: 2,
            excludedKpisCount: 0,
            excludedReasons: [],
            kpis: [],
          },
        ],
      },
      {
        id: "two",
        name: "Priority two",
        goalCompletion: {
          completedGoalsCount: 0,
          totalEligibleGoalsCount: 1,
          completionPercentage: 0,
          excludedGoalsCount: 0,
          excludedGoalReasons: [],
          countLabel: "0 of 1 goals completed",
        },
        goals: [
          {
            id: "goal-two",
            name: "Goal two",
            completionStatus: "in_progress",
            actualCompletionPercentage: 20,
            displayCompletionPercentage: 20,
            completedKpisCount: 0,
            totalEligibleKpisCount: 2,
            excludedKpisCount: 0,
            excludedReasons: [],
            kpis: [kpi("one"), kpi("two")],
          },
        ],
      },
    ],
  };
}

function progress(
  overrides: Partial<TargetProgressViewModel> = {},
): TargetProgressViewModel {
  return {
    actualValue: 0,
    targetValue: 0,
    hasTarget: true,
    actualProgressPercentage: 120,
    displayProgressPercentage: 100,
    isExceeded: true,
    status: "exceeded",
    pacingTarget: null,
    pacingStatus: null,
    targetYear: 2029,
    targetDescription: "Maintain zero unresolved exceptions",
    targetDisplayText: "Maintain zero unresolved exceptions",
    ...overrides,
  };
}

describe("strategic board report presentation", () => {
  it("counts only the supplied priority, goal, and KPI records", () => {
    expect(countStrategicBoardReportStructure(report())).toEqual({
      priorities: 2,
      goals: 2,
      kpis: 2,
    });
  });

  it("formats labels without changing the underlying status", () => {
    expect(formatBoardReportToken("target_not_finalized")).toBe(
      "Target not finalized",
    );
    expect(formatBoardReportToken("year_over_year")).toBe("Year over year");
  });

  it("keeps zero distinct from missing values", () => {
    expect(formatBoardReportMetricValue(0, "USD")).toBe("$0.00");
    expect(formatBoardReportMetricValue(0, "%")).toBe("0%");
    expect(formatBoardReportMetricValue(null, "USD")).toBe("Not reported");
    expect(formatBoardReportCurrency(null)).toBe("Not reported");
    expect(formatBoardReportPercentage(null)).toBe("Not reported");
  });

  it("does not invent a target when the model says it is missing", () => {
    expect(formatBoardReportTarget(progress(), "count")).toBe("0 count");
    expect(
      formatBoardReportTarget(
        progress({ targetValue: null, hasTarget: false }),
        "count",
      ),
    ).toBe("Target not finalized");
    expect(formatBoardReportTarget(null, "count")).toBe("No target record");
  });

  it("exposes uncapped progress and supplied status to assistive text", () => {
    expect(boardReportProgressAriaText(progress())).toBe(
      "120% progress; Exceeded",
    );
  });
});
