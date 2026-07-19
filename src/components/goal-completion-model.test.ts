import { describe, expect, it } from "vitest";
import {
  normalizeGoalCompletionViewModel,
  normalizePriorityGoalCompletionViewModel,
  type GoalCompletionViewModel,
} from "./goal-completion-model";

/** Supports the model test scenario. */
function model(
  overrides: Partial<GoalCompletionViewModel> = {},
): GoalCompletionViewModel {
  return {
    completedGoalsCount: 7,
    totalEligibleGoalsCount: 12,
    completionPercentage: 58.3,
    excludedGoalsCount: 2,
    excludedGoalReasons: [
      {
        goalId: "visitor-dwell-time",
        goalName: "Visitor dwell time",
        reasons: ["Target not finalized"],
      },
      {
        goalId: "audience-demographics",
        goalName: "Audience demographics",
        reasons: ["Age and income bands need definition"],
      },
    ],
    ...overrides,
  };
}

describe("goal-completion presentation model", () => {
  it("renders the organization percentage and exact completed-count language", () => {
    expect(normalizeGoalCompletionViewModel(model())).toMatchObject({
      completionPercentage: 58.3,
      displayCompletionPercentage: 58.3,
      completionPercentageLabel: "58.3%",
      countLabel: "7 of 12 goals completed",
      excludedGoalsCount: 2,
      hasCompletionPercentage: true,
    });
  });

  it("preserves zero completion as a valid result", () => {
    expect(normalizeGoalCompletionViewModel(model({
      completedGoalsCount: 0,
      totalEligibleGoalsCount: 5,
      completionPercentage: 0,
      excludedGoalsCount: 0,
      excludedGoalReasons: [],
    }))).toMatchObject({
      completionPercentage: 0,
      completionPercentageLabel: "0%",
      countLabel: "0 of 5 goals completed",
      excludedNote: "No goals are excluded for configuration gaps.",
    });
  });

  it("keeps no eligible goals explicit instead of presenting a false zero percent", () => {
    expect(normalizeGoalCompletionViewModel(model({
      completedGoalsCount: 0,
      totalEligibleGoalsCount: 0,
      completionPercentage: 0,
    }))).toMatchObject({
      completionPercentage: null,
      completionPercentageLabel: "Not available",
      countLabel: "0 of 0 goals completed",
      hasEligibleGoals: false,
      hasCompletionPercentage: false,
      progressAriaValueText: "Goal completion percentage not available. 0 of 0 goals completed.",
    });
  });

  it("caps the display percentage and completed count defensively", () => {
    expect(normalizeGoalCompletionViewModel(model({
      completedGoalsCount: 20,
      totalEligibleGoalsCount: 12,
      completionPercentage: 140,
    }))).toMatchObject({
      completedGoalsCount: 12,
      completionPercentage: 100,
      displayCompletionPercentage: 100,
      completionPercentageLabel: "100%",
      countLabel: "12 of 12 goals completed",
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "never exposes non-finite percentage %s",
    (unsafe) => {
      const normalized = normalizeGoalCompletionViewModel(model({
        completionPercentage: unsafe,
      }));
      expect(normalized.completionPercentage).toBeNull();
      expect(normalized.completionPercentageLabel).toBe("Not available");
      expect(normalized.displayCompletionPercentage).toBe(0);
      expect(JSON.stringify(normalized)).not.toMatch(/NaN|Infinity|undefined/);
    },
  );

  it("normalizes and deduplicates printable exclusion reasons", () => {
    const normalized = normalizeGoalCompletionViewModel(model({
      excludedGoalsCount: 1,
      excludedGoalReasons: [
        {
          goalId: "  goal-a ",
          goalName: " Goal A ",
          reasons: ["Needs target", "Needs target", "undefined", ""],
        },
        {
          goalId: "goal-b",
          reasons: [],
        },
      ],
    }));
    expect(normalized.excludedGoalsCount).toBe(1);
    expect(normalized.excludedNote).toBe(
      "1 goal excluded because configuration is incomplete.",
    );
    expect(normalized.excludedGoalReasons).toEqual([
      {
        goalId: "goal-a",
        goalName: "Goal A",
        reasons: ["Needs target"],
      },
    ]);
  });

  it("translates calculation and configuration codes into decision-ready copy", () => {
    const normalized = normalizeGoalCompletionViewModel(model({
      excludedGoalReasons: [{
        goalId: "goal-a",
        goalName: "Goal A",
        reasons: ["NO_ELIGIBLE_KPIS", "needs_target", "GOAL_NEEDS_DEFINITION"],
      }],
    }));

    expect(normalized.excludedGoalReasons[0]?.reasons).toEqual([
      "No required, fully configured measures are ready",
      "One or more measure targets are not finalized",
      "The goal definition is not finalized",
    ]);
    expect(JSON.stringify(normalized.excludedGoalReasons)).not.toMatch(
      /NO_ELIGIBLE_KPIS|needs_target|GOAL_NEEDS_DEFINITION/,
    );
  });

  it("never understates exclusions when detailed reasons exceed the supplied count", () => {
    expect(normalizeGoalCompletionViewModel(model({
      excludedGoalsCount: 0,
    })).excludedGoalsCount).toBe(2);
  });

  it("normalizes priority identity without introducing comparison language", () => {
    const normalized = normalizePriorityGoalCompletionViewModel({
      ...model(),
      priorityId: " visitor-experience ",
      priorityName: " Reimagine Visitor Experience ",
    });
    expect(normalized).toMatchObject({
      priorityId: "visitor-experience",
      priorityName: "Reimagine Visitor Experience",
    });
    expect(JSON.stringify(normalized).toLowerCase()).not.toContain("yoy");
    expect(JSON.stringify(normalized).toLowerCase()).not.toContain("year-over-year");
  });
});
