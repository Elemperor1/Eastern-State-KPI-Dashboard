import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StrategicBoardReportViewModel } from "@/features/reporting/strategic-board-report";
import { StrategicBoardReport } from "./StrategicBoardReport";

function emptyReport(): StrategicBoardReportViewModel {
  return {
    organizationName: "Eastern State Penitentiary Historic Site",
    selectedYear: 2026,
    reportingPeriod: "Full year",
    organizationGoalCompletion: {
      completedGoalsCount: 0,
      totalEligibleGoalsCount: 0,
      completionPercentage: null,
      excludedGoalsCount: 0,
      excludedGoalReasons: [],
      countLabel: "0 of 0 goals completed",
    },
    unresolvedReasons: [],
    priorities: [],
  };
}

describe("Strategic Board Report empty states", () => {
  it("does not claim completeness when no Strategic Goals exist", () => {
    const html = renderToStaticMarkup(
      <StrategicBoardReport report={emptyReport()} />,
    );

    expect(html).toContain("No Strategic Goals configured");
    expect(html).toContain(
      "Reporting completeness cannot be assessed because no Strategic Goals are configured for this Reporting Year.",
    );
    expect(html).not.toContain("Nothing needs attention");
    expect(html).not.toContain(
      "All reporting requirements represented in this report are complete.",
    );
  });

  it("keeps the complete reporting state for a configured report with no unresolved items", () => {
    const report = emptyReport();
    report.organizationGoalCompletion = {
      completedGoalsCount: 1,
      totalEligibleGoalsCount: 1,
      completionPercentage: 100,
      excludedGoalsCount: 0,
      excludedGoalReasons: [],
      countLabel: "1 of 1 goals completed",
    };
    report.priorities.push({
      id: "preservation",
      name: "Advance Historic Preservation",
      goalCompletion: report.organizationGoalCompletion,
      goals: [{
        id: "preserve-site",
        name: "Preserve the site",
        completionStatus: "complete",
        actualCompletionPercentage: 100,
        displayCompletionPercentage: 100,
        completedKpisCount: 0,
        totalEligibleKpisCount: 0,
        excludedKpisCount: 0,
        excludedReasons: [],
        kpis: [],
      }],
    });

    const html = renderToStaticMarkup(
      <StrategicBoardReport report={report} />,
    );

    expect(html).toContain("Nothing needs attention");
    expect(html).toContain(
      "All reporting requirements represented in this report are complete.",
    );
    expect(html).not.toContain("No Strategic Goals configured");
  });
});
