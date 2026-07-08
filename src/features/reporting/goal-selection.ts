import type { KpiGoalWithMeta } from "@/lib/types";

export function selectReportingGoal(
  goals: KpiGoalWithMeta[],
  kpiId: number,
  currentYear: number,
): KpiGoalWithMeta | null {
  const candidates = goals
    .filter(
      (goal) =>
        goal.enabled &&
        goal.kpi_id === kpiId &&
        goal.target_year >= currentYear,
    )
    .sort((a, b) => a.target_year - b.target_year);
  return candidates[0] ?? null;
}
