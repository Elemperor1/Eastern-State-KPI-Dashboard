import { getDb } from "@/lib/db";
import { asGoal, type GoalRow } from "./records";

export function upsertGoal(input: {
  kpi_id: number;
  target_year: number;
  baseline_year?: number;
  goal_type: "pct" | "number";
  target_value: number;
  enabled?: boolean;
  notes?: string | null;
  updated_by?: number | null;
}): GoalRow {
  const db = getDb();
  const enabled = input.enabled ?? true;
  const baselineYear = input.baseline_year ?? input.target_year - 1;
  db.prepare(
    `INSERT INTO kpi_goals (kpi_id, target_year, baseline_year, goal_type, target_value, enabled, notes, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(kpi_id, target_year) DO UPDATE SET
       baseline_year = excluded.baseline_year,
       goal_type = excluded.goal_type,
       target_value = excluded.target_value,
       enabled = excluded.enabled,
       notes = excluded.notes,
       updated_by = excluded.updated_by,
       updated_at = datetime('now')`,
  ).run(
    input.kpi_id,
    input.target_year,
    baselineYear,
    input.goal_type,
    input.target_value,
    enabled ? 1 : 0,
    input.notes ?? null,
    input.updated_by ?? null,
  );
  const row = db
    .prepare("SELECT * FROM kpi_goals WHERE kpi_id = ? AND target_year = ?")
    .get(input.kpi_id, input.target_year) as Record<string, unknown> | undefined;
  if (!row) {
    throw new Error(
      `upsertGoal: row not found after upsert for kpi_id=${input.kpi_id} year=${input.target_year}`,
    );
  }
  return asGoal(row);
}

export function toggleGoal(id: number, enabled: boolean): void {
  const db = getDb();
  db.prepare("UPDATE kpi_goals SET enabled = ?, updated_at = datetime('now') WHERE id = ?").run(
    enabled ? 1 : 0,
    id,
  );
}

export function updateGoal(input: {
  id: number;
  baseline_year?: number;
  goal_type?: "pct" | "number";
  target_value?: number;
  notes?: string | null;
  enabled?: boolean;
  updated_by?: number | null;
}): void {
  const db = getDb();
  const sets: string[] = ["updated_at = datetime('now')"];
  const params: (string | number | null)[] = [];
  if (input.baseline_year !== undefined) {
    sets.push("baseline_year = ?");
    params.push(input.baseline_year);
  }
  if (input.goal_type !== undefined) {
    sets.push("goal_type = ?");
    params.push(input.goal_type);
  }
  if (input.target_value !== undefined) {
    sets.push("target_value = ?");
    params.push(input.target_value);
  }
  if (input.notes !== undefined) {
    sets.push("notes = ?");
    params.push(input.notes);
  }
  if (input.enabled !== undefined) {
    sets.push("enabled = ?");
    params.push(input.enabled ? 1 : 0);
  }
  if (input.updated_by !== undefined) {
    sets.push("updated_by = ?");
    params.push(input.updated_by ?? null);
  }
  params.push(input.id);
  const result = db
    .prepare(`UPDATE kpi_goals SET ${sets.join(", ")} WHERE id = ?`)
    .run(...params);
  if (result.changes === 0) {
    throw new Error(`updateGoal: no row with id=${input.id}`);
  }
}

export function deleteGoal(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM kpi_goals WHERE id = ?").run(id);
}
