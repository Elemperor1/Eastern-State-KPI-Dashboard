import { describe, expect, it } from "vitest";
import { STRATEGIC_PLAN_CATEGORIES } from "./strategic-plan";
import {
  STRATEGIC_GOAL_DEFINITIONS,
  STRATEGIC_KPI_DEFINITIONS,
} from "./strategic-config";

describe("strategic KPI configuration mapping", () => {
  const canonicalKpis = STRATEGIC_PLAN_CATEGORIES.flatMap((category) => [
    ...category.annual,
    ...(category.breakdown ?? []),
  ]);

  it("maps the five priorities into 22 explicit named strategic goals", () => {
    expect(STRATEGIC_GOAL_DEFINITIONS).toHaveLength(22);
    expect(new Set(STRATEGIC_GOAL_DEFINITIONS.map((goal) => goal.slug)).size).toBe(22);
    expect(new Set(STRATEGIC_GOAL_DEFINITIONS.map((goal) => goal.priority_slug))).toEqual(
      new Set(STRATEGIC_PLAN_CATEGORIES.map((category) => category.slug)),
    );
  });

  it("maps every canonical KPI exactly once by stable slug", () => {
    const canonicalSlugs = canonicalKpis.map((kpi) => kpi.slug).sort();
    const configuredSlugs = STRATEGIC_KPI_DEFINITIONS.map((kpi) => kpi.kpi_slug).sort();
    expect(configuredSlugs).toEqual(canonicalSlugs);
    expect(new Set(configuredSlugs).size).toBe(configuredSlugs.length);
  });

  it("uses only explicit goal references", () => {
    const goals = new Set(STRATEGIC_GOAL_DEFINITIONS.map((goal) => goal.slug));
    expect(STRATEGIC_KPI_DEFINITIONS.every((kpi) => goals.has(kpi.goal_slug))).toBe(true);
  });

  it("preserves unresolved targets as gaps instead of numeric zero", () => {
    const unresolved = STRATEGIC_KPI_DEFINITIONS.filter((kpi) =>
      ["needs_definition", "needs_target"].includes(kpi.configuration_status),
    );
    expect(unresolved.length).toBeGreaterThan(0);
    expect(
      unresolved.every(
        (kpi) =>
          kpi.unresolved_question ||
          kpi.components?.some((component) => component.configuration_status !== "active"),
      ),
    ).toBe(true);
    expect(
      STRATEGIC_KPI_DEFINITIONS.some(
        (kpi) =>
          kpi.kpi_slug === "archival-materials-digitized-online" &&
          kpi.targets === undefined,
      ),
    ).toBe(true);
  });

  it("models representative component and distribution shapes without misleading aggregation", () => {
    const bySlug = new Map(
      STRATEGIC_KPI_DEFINITIONS.map((definition) => [definition.kpi_slug, definition]),
    );
    expect(bySlug.get("justice-ed-total-participants")?.components).toHaveLength(5);
    expect(bySlug.get("revenue-by-stream")?.components).toHaveLength(8);
    expect(bySlug.get("workforce-satisfaction-skill-improvement")?.aggregation_method).toBe("none");
    expect(bySlug.get("justice-ed-diverse-demographics")?.measurement_type).toBe("distribution");
    expect(bySlug.get("justice-ed-states-represented")?.fixed_denominator).toBe(50);
  });
});
