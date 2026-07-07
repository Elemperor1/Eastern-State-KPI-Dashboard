import { describe, expect, it } from "vitest";
import {
  calculateGoalComputedValues,
  calculateGoalProgressPct,
  calculateGoalTarget,
} from "./calculations";
import { isAnnualReportingFrequency } from "@/features/metrics";

describe("goal calculations", () => {
  it("derives percentage and numeric targets from a fixed baseline", () => {
    expect(calculateGoalTarget({ goal_type: "pct", target_value: 20 }, 100)).toBe(120);
    expect(calculateGoalTarget({ goal_type: "number", target_value: -15 }, 100)).toBe(85);
    expect(calculateGoalTarget({ goal_type: "pct", target_value: 20 }, null)).toBeNull();
  });

  it("treats annual and flexible goals as month-0 full-year goals", () => {
    expect(isAnnualReportingFrequency("annual")).toBe(true);
    expect(isAnnualReportingFrequency("flexible")).toBe(true);
    expect(isAnnualReportingFrequency("monthly")).toBe(false);

    const values = calculateGoalComputedValues({
      goal: { goal_type: "number", target_value: 100 },
      reportingFrequency: "annual",
      direction: "higher",
      throughMonth: 3,
      baselineValue: 1000,
      ytdValue: 1100,
      fullYearValue: 1100,
    });

    expect(values.ytd_value).toBe(1100);
    expect(values.ytd_target).toBe(1100);
    expect(values.ytd_progress_pct).toBe(100);
    expect(values.full_year_target).toBe(1100);
    expect(values.full_year_progress_pct).toBe(100);
  });

  it("separates monthly YTD pacing from full-year completion", () => {
    const values = calculateGoalComputedValues({
      goal: { goal_type: "pct", target_value: 20 },
      reportingFrequency: "monthly",
      direction: "higher",
      throughMonth: 3,
      baselineValue: 120,
      ytdValue: 45,
      fullYearValue: 45,
    });

    expect(values.ytd_target).toBe(36);
    expect(values.ytd_progress_pct).toBe(100);
    expect(values.full_year_target).toBe(144);
    expect(values.full_year_progress_pct).toBe(31);
  });

  it("uses prorated baselines for lower-is-better monthly YTD progress", () => {
    const values = calculateGoalComputedValues({
      goal: { goal_type: "pct", target_value: -20 },
      reportingFrequency: "monthly",
      direction: "lower",
      throughMonth: 3,
      baselineValue: 1200,
      ytdValue: 270,
      fullYearValue: 1080,
    });

    expect(values.ytd_target).toBe(240);
    expect(values.ytd_progress_pct).toBe(50);
    expect(values.full_year_target).toBe(960);
    expect(values.full_year_progress_pct).toBe(50);
  });

  it("distinguishes missing actual values from zero actual values", () => {
    expect(
      calculateGoalProgressPct({
        actual: null,
        target: 150,
        baseline: 100,
        direction: "higher",
      }),
    ).toBeNull();
    expect(
      calculateGoalProgressPct({
        actual: 0,
        target: 150,
        baseline: 100,
        direction: "higher",
      }),
    ).toBe(0);
  });
});
