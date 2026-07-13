import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CategoryOverviewSummary } from "@/features/reporting/types";
import { CategoryOverviewCard } from "./CategoryOverviewCard";

describe("CategoryOverviewCard comparison presentation", () => {
  it("keeps the full KPI count while naming the smaller comparison set", () => {
    const html = renderToStaticMarkup(
      <CategoryOverviewCard
        summary={summary({
          total: 12,
          comparisonMetricCount: 1,
          improving: 1,
        })}
        accent="var(--chart-primary)"
      />,
    );

    expect(html).toContain("12 metrics");
    expect(html).toContain("1 KPI comparison");
    expect(html).toContain('aria-label="1 improving"');
    expect(html).not.toContain("No selected-year KPI comparison is available.");
  });

  it("shows an intentional unavailable state instead of three misleading zero counts", () => {
    const html = renderToStaticMarkup(
      <CategoryOverviewCard
        summary={summary()}
        accent="var(--chart-primary)"
      />,
    );

    expect(html).toContain("No selected-year KPI comparison is available.");
    expect(html).not.toContain('aria-label="0 improving"');
    expect(html).not.toContain('aria-label="0 declining"');
    expect(html).not.toContain('aria-label="0 unchanged"');
  });
});

function summary(
  overrides: Partial<CategoryOverviewSummary> = {},
): CategoryOverviewSummary {
  return {
    category: {
      id: 1,
      slug: "visitor-experience",
      name: "Visitor Experience",
      description: "Visitor experience priority",
      sort_order: 1,
    },
    metrics: [],
    improving: 0,
    declining: 0,
    flat: 0,
    total: 8,
    comparisonMetricCount: 0,
    pctImproving: 0,
    topMover: null,
    goalCount: 0,
    averageGoalProgress: null,
    completedStrategicGoals: 2,
    eligibleStrategicGoals: 4,
    strategicGoalCompletionPercentage: 50,
    excludedStrategicGoals: 1,
    ...overrides,
  };
}
