import type { KPIWithCategory, KpiGoalWithMeta } from "@/lib/types";

export interface AdminGoalCategorySummary {
  id: number;
  name: string;
  goalCount: number;
}

export interface AdminGoalFilters {
  query: string;
  categoryId: number | null;
}

export interface AdminGoalKpiOptions {
  availableKpis: KPIWithCategory[];
  unavailableKpis: KPIWithCategory[];
}

export function buildAdminGoalCategorySummaries(
  kpis: KPIWithCategory[],
  goals: KpiGoalWithMeta[],
): AdminGoalCategorySummary[] {
  const names = new Map<number, string>();
  for (const kpi of kpis) names.set(kpi.category_id, kpi.category_name);

  const counts = new Map<number, number>();
  for (const goal of goals) {
    counts.set(goal.category_id, (counts.get(goal.category_id) ?? 0) + 1);
  }

  return Array.from(names, ([id, name]) => ({
    id,
    name,
    goalCount: counts.get(id) ?? 0,
  }));
}

export function filterAdminGoals(
  goals: KpiGoalWithMeta[],
  filters: AdminGoalFilters,
): KpiGoalWithMeta[] {
  const needle = filters.query.trim().toLowerCase();
  return goals.filter((goal) => {
    if (filters.categoryId !== null && goal.category_id !== filters.categoryId) {
      return false;
    }
    if (!needle) return true;
    return (
      goal.kpi_name.toLowerCase().includes(needle) ||
      goal.kpi_slug.toLowerCase().includes(needle)
    );
  });
}

export function countEnabledAdminGoals(goals: KpiGoalWithMeta[]): number {
  return goals.filter((goal) => goal.enabled).length;
}

export function buildAdminGoalYearOptions(currentYear = new Date().getFullYear()): number[] {
  return Array.from({ length: 5 }, (_, index) => currentYear - 1 + index);
}

export function buildAdminGoalKpiOptions(
  kpis: KPIWithCategory[],
  goals: KpiGoalWithMeta[],
  targetYear: number,
): AdminGoalKpiOptions {
  const goalsForYear = new Set(
    goals
      .filter((goal) => goal.target_year === targetYear)
      .map((goal) => goal.kpi_id),
  );
  return {
    availableKpis: kpis.filter((kpi) => !goalsForYear.has(kpi.id)),
    unavailableKpis: kpis.filter((kpi) => goalsForYear.has(kpi.id)),
  };
}

export function formatAdminGoalChangeLabel(goal: Pick<KpiGoalWithMeta, "goal_type" | "target_value">): string {
  const signedValue = `${goal.target_value > 0 ? "+" : ""}${goal.target_value}`;
  return goal.goal_type === "pct" ? `${signedValue}%` : signedValue;
}

export function formatAdminGoalTarget(value: number | null): string {
  return value !== null
    ? value.toLocaleString(undefined, { maximumFractionDigits: 1 })
    : "—";
}
