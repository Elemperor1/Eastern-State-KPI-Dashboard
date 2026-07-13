import { recordStrategicAuditEvent } from "@/features/strategy/server";
import { getDb, transaction } from "@/lib/db";
import { asGoal, type GoalRow } from "./records";

const LEGACY_GOAL_AUDIT_SOURCE = "Legacy KPI goal administration";

interface GoalWithAuditContext {
  goal: GoalRow;
  kpi_name: string;
  category_name: string;
}

function readGoalWithAuditContextByKpiAndYear(
  kpiId: number,
  targetYear: number,
): GoalWithAuditContext | null {
  const row = getDb()
    .prepare(
      `SELECT g.*, k.name AS kpi_name, c.name AS category_name
       FROM kpi_goals g
       JOIN kpis k ON k.id = g.kpi_id
       JOIN categories c ON c.id = k.category_id
       WHERE g.kpi_id = ? AND g.target_year = ?`,
    )
    .get(kpiId, targetYear) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    goal: asGoal(row),
    kpi_name: String(row.kpi_name),
    category_name: String(row.category_name),
  };
}

function readGoalWithAuditContextById(id: number): GoalWithAuditContext | null {
  const row = getDb()
    .prepare(
      `SELECT g.*, k.name AS kpi_name, c.name AS category_name
       FROM kpi_goals g
       JOIN kpis k ON k.id = g.kpi_id
       JOIN categories c ON c.id = k.category_id
       WHERE g.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    goal: asGoal(row),
    kpi_name: String(row.kpi_name),
    category_name: String(row.category_name),
  };
}

function legacyGoalSnapshot(goal: GoalRow) {
  return {
    id: goal.id,
    kpi_id: goal.kpi_id,
    target_year: goal.target_year,
    baseline_year: goal.baseline_year,
    goal_type: goal.goal_type,
    target_value: goal.target_value,
    enabled: goal.enabled === 1,
    notes: goal.notes,
    created_by: goal.created_by,
    created_at: goal.created_at,
    updated_by: goal.updated_by,
    updated_at: goal.updated_at,
  };
}

function legacyGoalDisplayName(context: GoalWithAuditContext): string {
  return `${context.kpi_name} — ${context.goal.target_year} Legacy KPI Goal`;
}

function sameLegacyGoalDefinition(
  goal: GoalRow,
  expected: {
    baseline_year: number;
    goal_type: "pct" | "number";
    target_value: number;
    enabled: boolean;
    notes: string | null;
  },
): boolean {
  return (
    goal.baseline_year === expected.baseline_year &&
    goal.goal_type === expected.goal_type &&
    goal.target_value === expected.target_value &&
    (goal.enabled === 1) === expected.enabled &&
    goal.notes === expected.notes
  );
}

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
  return transaction(() => {
    const db = getDb();
    const before = readGoalWithAuditContextByKpiAndYear(
      input.kpi_id,
      input.target_year,
    );
    const enabled = input.enabled ?? true;
    const baselineYear = input.baseline_year ?? input.target_year - 1;
    const expected = {
      baseline_year: baselineYear,
      goal_type: input.goal_type,
      target_value: input.target_value,
      enabled,
      notes: input.notes ?? null,
    };
    if (before && sameLegacyGoalDefinition(before.goal, expected)) {
      return before.goal;
    }
    db.prepare(
      `INSERT INTO kpi_goals (
         kpi_id, target_year, baseline_year, goal_type, target_value, enabled,
         notes, created_by, updated_by, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
      input.updated_by ?? null,
    );
    const after = readGoalWithAuditContextByKpiAndYear(
      input.kpi_id,
      input.target_year,
    );
    if (!after) {
      throw new Error(
        `upsertGoal: row not found after upsert for kpi_id=${input.kpi_id} year=${input.target_year}`,
      );
    }
    if (!before) {
      recordStrategicAuditEvent({
        entity_type: "kpi",
        entity_id: after.goal.kpi_id,
        event_type: "create",
        entity_display_name: legacyGoalDisplayName(after),
        parent_priority_name: after.category_name,
        previous_value: null,
        new_value: legacyGoalSnapshot(after.goal),
        actor_id: input.updated_by ?? null,
        source_reference: LEGACY_GOAL_AUDIT_SOURCE,
      });
    } else {
      recordStrategicAuditEvent({
        entity_type: "kpi",
        entity_id: after.goal.kpi_id,
        event_type: "update",
        entity_display_name: legacyGoalDisplayName(after),
        parent_priority_name: after.category_name,
        previous_value: legacyGoalSnapshot(before.goal),
        new_value: legacyGoalSnapshot(after.goal),
        actor_id: input.updated_by ?? null,
        source_reference: LEGACY_GOAL_AUDIT_SOURCE,
      });
    }
    return after.goal;
  });
}

export function toggleGoal(
  id: number,
  enabled: boolean,
  actorId?: number | null,
): void {
  updateGoal({ id, enabled, updated_by: actorId });
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
  transaction(() => {
    const db = getDb();
    const before = readGoalWithAuditContextById(input.id);
    if (!before) {
      throw new Error(`updateGoal: no row with id=${input.id}`);
    }
    const changed =
      (input.baseline_year !== undefined &&
        input.baseline_year !== before.goal.baseline_year) ||
      (input.goal_type !== undefined && input.goal_type !== before.goal.goal_type) ||
      (input.target_value !== undefined &&
        input.target_value !== before.goal.target_value) ||
      (input.notes !== undefined && input.notes !== before.goal.notes) ||
      (input.enabled !== undefined && input.enabled !== (before.goal.enabled === 1));
    if (!changed) return;
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
    sets.push("updated_by = ?");
    params.push(input.updated_by ?? null);
    params.push(input.id);
    const result = db
      .prepare(`UPDATE kpi_goals SET ${sets.join(", ")} WHERE id = ?`)
      .run(...params);
    if (result.changes === 0) {
      throw new Error(`updateGoal: no row with id=${input.id}`);
    }
    const after = readGoalWithAuditContextById(input.id);
    if (!after) {
      throw new Error(`updateGoal: no row with id=${input.id}`);
    }
    recordStrategicAuditEvent({
      entity_type: "kpi",
      entity_id: after.goal.kpi_id,
      event_type: "update",
      entity_display_name: legacyGoalDisplayName(after),
      parent_priority_name: after.category_name,
      previous_value: legacyGoalSnapshot(before.goal),
      new_value: legacyGoalSnapshot(after.goal),
      actor_id: input.updated_by ?? null,
      source_reference: LEGACY_GOAL_AUDIT_SOURCE,
    });
  });
}

export function deleteGoal(id: number, actorId?: number | null): void {
  transaction(() => {
    const before = readGoalWithAuditContextById(id);
    if (!before) return;
    recordStrategicAuditEvent({
      entity_type: "kpi",
      entity_id: before.goal.kpi_id,
      event_type: "delete",
      entity_display_name: legacyGoalDisplayName(before),
      parent_priority_name: before.category_name,
      previous_value: legacyGoalSnapshot(before.goal),
      new_value: null,
      actor_id: actorId ?? null,
      source_reference: LEGACY_GOAL_AUDIT_SOURCE,
    });
    getDb().prepare("DELETE FROM kpi_goals WHERE id = ?").run(id);
  });
}
