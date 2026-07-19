import { getDb } from "../src/lib/db";

/**
 * Populate the disposable pre-strategy tables used only by `db:seed`.
 *
 * The product has no runtime read or mutation adapter for these rows. They
 * remain in the seed solely so operators can test schema migration and archive
 * preservation until a backup-tested migration removes the physical tables.
 */
export function seedLegacyScalar(input: {
  kpiId: number;
  year: number;
  value: number;
  notes?: string | null;
}): void {
  getDb().prepare(
    `INSERT INTO monthly_entries (kpi_id, year, month, value, notes)
     VALUES (?, ?, 0, ?, ?)
     ON CONFLICT(kpi_id, year, month) DO UPDATE SET
       value = excluded.value,
       notes = excluded.notes,
       updated_at = datetime('now')`,
  ).run(input.kpiId, input.year, input.value, input.notes ?? null);
}

/** Seeds legacy breakdown. */
export function seedLegacyBreakdown(input: {
  kpiId: number;
  year: number;
  label: string;
  value: number;
  sortOrder: number;
  notes?: string | null;
}): void {
  getDb().prepare(
    `INSERT INTO breakdown_entries (
       kpi_id, year, month, label, value, sort_order, notes
     ) VALUES (?, ?, 0, ?, ?, ?, ?)
     ON CONFLICT(kpi_id, year, month, label) DO UPDATE SET
       value = excluded.value,
       sort_order = excluded.sort_order,
       notes = excluded.notes,
       updated_at = datetime('now')`,
  ).run(
    input.kpiId,
    input.year,
    input.label,
    input.value,
    input.sortOrder,
    input.notes ?? null,
  );
}

/** Seeds legacy goal. */
export function seedLegacyGoal(input: {
  kpiId: number;
  targetYear: number;
  baselineYear: number;
  goalType: "pct" | "number";
  targetValue: number;
  notes?: string | null;
}): void {
  getDb().prepare(
    `INSERT INTO kpi_goals (
       kpi_id, target_year, baseline_year, goal_type, target_value,
       enabled, notes
     ) VALUES (?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(kpi_id, target_year) DO UPDATE SET
       baseline_year = excluded.baseline_year,
       goal_type = excluded.goal_type,
       target_value = excluded.target_value,
       enabled = 1,
       notes = excluded.notes,
       updated_at = datetime('now')`,
  ).run(
    input.kpiId,
    input.targetYear,
    input.baselineYear,
    input.goalType,
    input.targetValue,
    input.notes ?? null,
  );
}
