import type { GoalType } from "@/lib/types";

export interface GoalRow {
  id: number;
  kpi_id: number;
  target_year: number;
  goal_type: GoalType;
  target_value: number;
  enabled: number;
  notes: string | null;
  created_by: number | null;
  created_at: string;
  updated_by: number | null;
  updated_at: string;
}

export function asGoal(row: Record<string, unknown>): GoalRow {
  return {
    id: Number(row.id),
    kpi_id: Number(row.kpi_id),
    target_year: Number(row.target_year),
    goal_type: String(row.goal_type) as GoalType,
    target_value: Number(row.target_value),
    enabled: Number(row.enabled ?? 1),
    notes: row.notes == null ? null : String(row.notes),
    created_by: row.created_by == null ? null : Number(row.created_by),
    created_at: String(row.created_at),
    updated_by: row.updated_by == null ? null : Number(row.updated_by),
    updated_at: String(row.updated_at),
  };
}
