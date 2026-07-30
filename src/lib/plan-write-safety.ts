import { getDb } from "@/lib/db";

export type PlanWriteSafetyState =
  | { allowed: true }
  | { allowed: false; reason: "activation_pause" | "integrity_incident" };

/**
 * Reads the durable lifecycle safety markers before any authenticated
 * mutation starts. Database-level plan immutability remains the final
 * defense; this seam gives ordinary clients a clear retry or operator message
 * before they spend work parsing and validating a body.
 */
export function getPlanWriteSafetyState(): PlanWriteSafetyState {
  const db = getDb();
  const tables = new Set(
    db
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
      .all()
      .map((row) => String(row.name)),
  );
  if (!tables.has("strategic_plans")) return { allowed: true };
  const pause = db
    .prepare(
      "SELECT value FROM meta WHERE key = 'plan_activation_write_pause'",
    )
    .get() as { value?: string } | undefined;
  if (pause?.value === "1") {
    return { allowed: false, reason: "activation_pause" };
  }
  const blocked = db
    .prepare(
      "SELECT value FROM meta WHERE key = 'active_plan_integrity_blocked'",
    )
    .get() as { value?: string } | undefined;
  if (blocked?.value === "1") {
    return { allowed: false, reason: "integrity_incident" };
  }
  const planCounts = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN lifecycle_state = 'active' THEN 1 ELSE 0 END) AS active
       FROM strategic_plans`,
    )
    .get() as { total: number; active: number | null };
  if (
    Number(planCounts.total) > 0 &&
    Number(planCounts.active ?? 0) !== 1
  ) {
    return { allowed: false, reason: "integrity_incident" };
  }
  return { allowed: true };
}
