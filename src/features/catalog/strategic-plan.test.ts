import { describe, expect, it } from "vitest";
import {
  STRATEGIC_PLAN_BASELINE_YEAR,
  STRATEGIC_PLAN_CATEGORIES,
  STRATEGIC_PLAN_YEARS,
} from "./strategic-plan";

describe("canonical strategic plan", () => {
  const annualKpis = STRATEGIC_PLAN_CATEGORIES.flatMap(
    (category) => category.annual,
  );
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
    expect(allKpis.every((kpi) => !kpi.description.includes("TK"))).toBe(true);
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
      for (const year of STRATEGIC_PLAN_YEARS) {
        expect(
          Object.values(kpi.breakdown[year]).reduce(
            (sum, value) => sum + value,
            0,
          ),
        ).toBe(100);
      }
    }
  });

  it("defines 25 enabled strategic KPI targets for 2027 or 2029", () => {
    const goals = annualKpis.flatMap((kpi) => (kpi.goal ? [kpi.goal] : []));
    expect(goals).toHaveLength(25);
    expect(new Set(goals.map((goal) => goal.target_year))).toEqual(
      new Set([2027, 2029]),
    );
    expect(STRATEGIC_PLAN_BASELINE_YEAR).toBe(2026);
    expect(goals.every((goal) => !goal.notes?.includes("TK"))).toBe(true);
  });

  it("stores auditable endpoints instead of hand-calculated numeric deltas", () => {
    const targets = new Map(
      annualKpis.flatMap((kpi) => {
        if (!kpi.goal || !("target" in kpi.goal)) return [];
        return [[kpi.slug, kpi.goal.target] as const];
      }),
    );

    expect(targets.get("board-giving-participation")).toBe(100);
    expect(targets.get("departments-aligned-best-practices")).toBe(100);
    expect(targets.get("staff-reviews-strategic-alignment")).toBe(100);
    expect(targets.get("exhibits-with-interactive-digital")).toBe(50);
    expect(
      annualKpis
        .filter((kpi) => kpi.goal && "target" in kpi.goal)
        .every(
          (kpi) =>
            "target" in kpi.goal! &&
            kpi.goal.target >= kpi.annual[STRATEGIC_PLAN_BASELINE_YEAR],
        ),
    ).toBe(true);
  });
});
