import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GoalCompletionSummary } from "./GoalCompletionSummary";

describe("GoalCompletionSummary", () => {
  it("shows excluded Strategic Goal reasons and a configuration-gap drilldown", () => {
    const html = renderToStaticMarkup(
      <GoalCompletionSummary
        organization={{
          completedGoalsCount: 7,
          totalEligibleGoalsCount: 12,
          completionPercentage: 58.3,
          excludedGoalsCount: 1,
          excludedGoalReasons: [{
            goalId: "goal-visitor-survey",
            goalName: "Understand non-engaged audiences",
            reasons: ["Target not finalized", "Survey method needs definition"],
          }],
        }}
      />,
    );

    expect(html).toContain("1 goal excluded because configuration is incomplete.");
    expect(html).toContain("Review excluded goal details (1)");
    expect(html).toContain("Understand non-engaged audiences:");
    expect(html).toContain("Target not finalized; Survey method needs definition");
    expect(html).toContain('aria-label="Organization-wide excluded goal details"');
    expect(html).toContain('href="/admin/configuration-gaps"');
    expect(html).toContain("Review configuration gaps");
  });
});
