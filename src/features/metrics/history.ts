import { getDb } from "@/lib/db";

/**
 * Sentinel slug/name helper used when a KPI/category snapshot column is NULL
 * (legacy migrated row whose metadata was already deleted, or a seed write
 * with no metadata). The history endpoint renders this distinctly: it is the
 * "deleted metadata" tombstone, not a real label.
 *
 * D8AD-CAN-005: see db.ts migrateEntryHistorySnapshots.
 */
function snapshotString(value: unknown): string | null {
  return value == null ? null : String(value);
}

export function recordMetricEntryHistory(input: {
  entry_type: "monthly" | "breakdown";
  entry_id: number | null;
  kpi_id: number;
  year: number;
  month_or_label: string;
  prev_value: number | null;
  new_value: number | null;
  prev_notes: string | null;
  new_notes: string | null;
  changed_by: number | null;
}): void {
  const db = getDb();
  // D8AD-CAN-005: capture the CURRENT KPI/category/user metadata as an
  // immutable snapshot in the same transaction as the change. This freezes
  // the human-readable label at the moment of the edit, so a later rename
  // or delete of the KPI/category cannot retroactively rewrite or hide the
  // audit row. If the KPI was somehow already gone (shouldn't happen for a
  // normal entry write because the FK would prevent it), snapshot columns stay
  // NULL and the row renders as a deleted-metadata tombstone.
  const meta = db
    .prepare(
      `SELECT k.name as kpi_name, k.slug as kpi_slug, k.unit as kpi_unit,
              k.category_id as category_id,
              c.name as category_name, c.slug as category_slug
       FROM kpis k
       LEFT JOIN categories c ON c.id = k.category_id
       WHERE k.id = ?`,
    )
    .get(input.kpi_id) as
    | {
        kpi_name: string | null;
        kpi_slug: string | null;
        kpi_unit: string | null;
        category_id: number | null;
        category_name: string | null;
        category_slug: string | null;
      }
    | undefined;
  const actorEmail = input.changed_by == null
    ? null
    : snapshotString(
        (db.prepare("SELECT email FROM users WHERE id = ?").get(input.changed_by) as
          | { email: string }
          | undefined)?.email,
      );
  db.prepare(
    `INSERT INTO entry_history
       (entry_type, entry_id, kpi_id, year, month_or_label,
        prev_value, new_value, prev_notes, new_notes, changed_by, changed_at,
        kpi_name, kpi_slug, kpi_unit, category_id, category_name, category_slug,
        changed_by_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.entry_type,
    input.entry_id,
    input.kpi_id,
    input.year,
    input.month_or_label,
    input.prev_value,
    input.new_value,
    input.prev_notes,
    input.new_notes,
    input.changed_by,
    snapshotString(meta?.kpi_name),
    snapshotString(meta?.kpi_slug),
    snapshotString(meta?.kpi_unit),
    meta?.category_id == null ? null : Number(meta.category_id),
    snapshotString(meta?.category_name),
    snapshotString(meta?.category_slug),
    actorEmail,
  );
}
