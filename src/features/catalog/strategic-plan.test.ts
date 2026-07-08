import { describe, expect, it } from "vitest";
import {
  STRATEGIC_PLAN_CATEGORIES,
  STRATEGIC_PLAN_YEARS,
} from "./strategic-plan";

describe("canonical strategic plan", () => {
  const annualKpis = STRATEGIC_PLAN_CATEGORIES.flatMap((category) => category.annual);
  const breakdownKpis = STRATEGIC_PLAN_CATEGORIES.flatMap(
    (category) => category.breakdown ?? [],
  );
  const allKpis = [...annualKpis, ...breakdownKpis];

  it("defines the approved five priorities and 59 KPIs in order", () => {
    expect(
      STRATEGIC_PLAN_CATEGORIES.map(({ slug, name }) => ({ slug, name })),
    ).toEqual([
      { slug: "visitor-experience", name: "Reimagine Visitor Experience" },
      { slug: "historic-preservation", name: "Advance Historic Preservation" },
      { slug: "workforce-development", name: "Expand Workforce Development" },
      {
        slug: "justice-education",
        name: "Support Learning through Justice Education",
      },
      {
        slug: "organizational-capacity",
        name: "Enhance Organizational Capacity",
      },
    ]);
    expect(allKpis).toHaveLength(59);
  });

  it("uses unique slugs and goal-prefixed KPI names", () => {
    const slugs = allKpis.map((kpi) => kpi.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(allKpis.every((kpi) => kpi.name.includes(" — "))).toBe(true);
  });

  it("defines annual sample values for every approved year", () => {
    expect(STRATEGIC_PLAN_YEARS).toEqual([2024, 2025, 2026]);
    for (const kpi of annualKpis) {
      expect(Object.keys(kpi.annual).map(Number).sort()).toEqual([
        ...STRATEGIC_PLAN_YEARS,
      ]);
    }
    for (const kpi of breakdownKpis) {
      expect(Object.keys(kpi.breakdown).map(Number).sort()).toEqual([
        ...STRATEGIC_PLAN_YEARS,
      ]);
    }
  });

  it("defines 25 enabled strategic KPI targets for 2027 or 2029", () => {
    const goals = annualKpis.flatMap((kpi) => (kpi.goal ? [kpi.goal] : []));
    expect(goals).toHaveLength(25);
    expect(new Set(goals.map((goal) => goal.target_year))).toEqual(
      new Set([2027, 2029]),
    );
  });
});
