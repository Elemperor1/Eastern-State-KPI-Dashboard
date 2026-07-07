import type { Direction, GoalType, ReportingFrequency } from "@/lib/types";
import { isAnnualReportingFrequency } from "@/features/metrics";

export interface GoalDefinition {
  goal_type: GoalType;
  target_value: number;
}

export interface GoalComputedValues {
  ytd_value: number | null;
  ytd_target: number | null;
  ytd_progress_pct: number | null;
  full_year_value: number | null;
  full_year_target: number | null;
  full_year_progress_pct: number | null;
}

export function calculateGoalTarget(
  goal: GoalDefinition,
  baselineValue: number | null,
): number | null {
  if (baselineValue == null) return null;
  if (goal.goal_type === "pct") {
    return baselineValue * (1 + goal.target_value / 100);
  }
  return baselineValue + goal.target_value;
}

export function calculateGoalProgressPct({
  actual,
  target,
  baseline,
  direction,
}: {
  actual: number | null;
  target: number | null;
  baseline: number | null;
  direction: Direction;
}): number | null {
  if (target == null) return null;
  if (actual == null) return null;

  if (direction === "lower" && baseline != null) {
    const range = baseline - target;
    if (range <= 0) {
      if (target === 0) return 100;
      const fallback = (actual / target) * 100;
      return Math.max(0, Math.min(Math.round(fallback), 100));
    }
    const progress = ((baseline - actual) / range) * 100;
    return Math.max(0, Math.min(Math.round(progress), 100));
  }

  if (target === 0) return 100;
  const progress = (actual / target) * 100;
  return Math.max(0, Math.min(Math.round(progress), 100));
}

export function calculateGoalComputedValues({
  goal,
  reportingFrequency,
  direction,
  throughMonth,
  baselineValue,
  ytdValue,
  fullYearValue,
}: {
  goal: GoalDefinition;
  reportingFrequency: ReportingFrequency;
  direction: Direction;
  throughMonth: number;
  baselineValue: number | null;
  ytdValue: number | null;
  fullYearValue: number | null;
}): GoalComputedValues {
  const annual = isAnnualReportingFrequency(reportingFrequency);
  const fullYearTarget = calculateGoalTarget(goal, baselineValue);
  const fullYearProgressPct = calculateGoalProgressPct({
    actual: fullYearValue,
    target: fullYearTarget,
    baseline: baselineValue,
    direction,
  });

  let ytdTarget: number | null;
  let ytdBaseline: number | null;
  if (annual || fullYearTarget == null) {
    ytdTarget = fullYearTarget;
    ytdBaseline = baselineValue;
  } else {
    const fraction = throughMonth / 12;
    ytdTarget = fullYearTarget * fraction;
    ytdBaseline = baselineValue != null ? baselineValue * fraction : null;
  }

  const ytdProgressPct = calculateGoalProgressPct({
    actual: ytdValue,
    target: ytdTarget,
    baseline: ytdBaseline,
    direction,
  });

  return {
    ytd_value: ytdValue,
    ytd_target: ytdTarget,
    ytd_progress_pct: ytdProgressPct,
    full_year_value: fullYearValue,
    full_year_target: fullYearTarget,
    full_year_progress_pct: fullYearProgressPct,
  };
}
