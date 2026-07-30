import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ExecutiveOverviewPageData } from "@/features/reporting/server";
import { ExecutiveOverview } from "./ExecutiveOverview";

vi.mock("next/navigation", () => ({
  /** Supports the use router test scenario. */
  useRouter: () => ({ replace: vi.fn() }),
}));

/** Supports the overview data test scenario. */
function overviewData(): ExecutiveOverviewPageData {
  return {
    years: [2025, 2026, 2027, 2028, 2029],
    sampleData: false,
    summary: {
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
    needsAttention: [],
  };
}

describe("Executive Overview empty states", () => {
  it("does not claim reporting readiness when no Strategic Goals exist", () => {
    const html = renderToStaticMarkup(
      <ExecutiveOverview data={overviewData()} />,
    );

    expect(html).toContain("No Strategic Goals for 2026");
    expect(html).toContain(
      "There are no Strategic Goals configured for this Reporting Year.",
    );
    expect(html).not.toContain("Nothing needs attention");
    expect(html).not.toContain("All included goals are ready for reporting.");
  });

  it("keeps the ready state when configured Goals have no attention items", () => {
    const data = overviewData();
    data.summary.goals.push({
      goalId: "1",
      goalName: "Preserve the site",
      priorityId: "1",
      prioritySlug: "preservation",
      priorityName: "Advance Historic Preservation",
      configurationStatus: "active",
      result: {
        goalId: "1",
        rule: "all_required_kpis",
        state: "ok",
        eligible: true,
        complete: true,
        completionPercentage: 100,
        completedKpisCount: 1,
        totalEligibleKpisCount: 1,
        excludedKpisCount: 0,
        excludedKpis: [],
        exclusionReasons: [],
        issues: [],
      },
      kpis: [],
    });

    const html = renderToStaticMarkup(<ExecutiveOverview data={data} />);

    expect(html).toContain("Nothing needs attention");
    expect(html).toContain("All included goals are ready for reporting.");
    expect(html).not.toContain("No Strategic Goals for 2026");
  });

  it("marks a priority and attention list when an eligible goal excludes an archived measure", () => {
    const data = overviewData();
    data.summary.priorities.push({
      priorityId: "1",
      priorityName: "Advance Historic Preservation",
      completedGoalsCount: 0,
      totalEligibleGoalsCount: 1,
      completionPercentage: 75,
      excludedGoalsCount: 0,
      excludedGoalReasons: [],
    });
    data.summary.goals.push({
      goalId: "1",
      goalName: "Preserve the site",
      priorityId: "1",
      prioritySlug: "preservation",
      priorityName: "Advance Historic Preservation",
      configurationStatus: "active",
      result: {
        goalId: "1",
        rule: "all_required_kpis",
        state: "ok",
        eligible: true,
        complete: false,
        completionPercentage: 75,
        completedKpisCount: 1,
        totalEligibleKpisCount: 2,
        excludedKpisCount: 1,
        excludedKpis: [{
          id: "3",
          label: "Deferred masonry work",
          reason: "archived",
        }],
        exclusionReasons: ["archived"],
        issues: [],
      },
      kpis: [],
    });
    data.needsAttention.push({
      goalId: "1",
      goalName: "Preserve the site",
      priorityName: "Advance Historic Preservation",
      reason: "One or more measures are archived",
    });

    const html = renderToStaticMarkup(<ExecutiveOverview data={data} />);

    expect(html).toContain("Needs attention");
    expect(html).toContain("One or more measures are archived");
    expect(html).not.toContain("Nothing needs attention");
  });
});
