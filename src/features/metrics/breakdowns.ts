import { ANNUAL_ENTRY_MONTH } from "./period-rules";
import { asBreakdown, asBreakdownWithMeta } from "./records";
import { recordMetricEntryHistory } from "./history";
import { getDb, transaction } from "@/lib/db";
import type { BreakdownEntry, BreakdownEntryWithMeta } from "@/lib/types";

export interface BreakdownFilter {
  kpi_id?: number;
  category_id?: number;
  year?: number;
  years?: number[];
  month?: number;
}

export function listBreakdowns(filter?: BreakdownFilter): BreakdownEntryWithMeta[] {
  const db = getDb();
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter?.kpi_id !== undefined) {
    where.push("b.kpi_id = ?");
    params.push(filter.kpi_id);
  }
  if (filter?.category_id !== undefined) {
    where.push("k.category_id = ?");
    params.push(filter.category_id);
  }
  if (filter?.year !== undefined) {
    where.push("b.year = ?");
    params.push(filter.year);
  }
  if (filter?.years && filter.years.length) {
    where.push(`b.year IN (${filter.years.map(() => "?").join(",")})`);
    params.push(...filter.years);
  }
  if (filter?.month !== undefined) {
    where.push("b.month = ?");
    params.push(filter.month);
  }
  const sql = `
    SELECT b.*, k.name as kpi_name, k.unit as kpi_unit,
           c.id as category_id, c.name as category_name, c.slug as category_slug
    FROM breakdown_entries b
    JOIN kpis k ON k.id = b.kpi_id
    JOIN categories c ON c.id = k.category_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY b.year ASC, b.month ASC, b.sort_order ASC, b.label ASC
  `;
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(asBreakdownWithMeta);
}

export function upsertBreakdown(input: {
  kpi_id: number;
  year: number;
  month?: number;
  label: string;
  value: number;
  sort_order?: number;
  notes?: string | null;
  updated_by?: number | null;
}): BreakdownEntry {
  // See upsertEntry for the rationale: the upsert + readback + history is
  // wrapped in a transaction, the post-write read uses the natural unique
  // key (kpi_id, year, month, label) instead of `lastInsertRowid`, and a key
  // mismatch throws so a wrong-row bug cannot silently corrupt the audit trail.
  return transaction(() => {
    const db = getDb();
    const month = input.month ?? ANNUAL_ENTRY_MONTH;
    const label = input.label.trim();
    const prior = db
      .prepare(
        "SELECT id, value, notes FROM breakdown_entries WHERE kpi_id = ? AND year = ? AND month = ? AND label = ?",
      )
      .get(input.kpi_id, input.year, month, label) as
      | { id: number; value: number; notes: string | null }
      | undefined;
    db.prepare(
      `INSERT INTO breakdown_entries (kpi_id, year, month, label, value, sort_order, notes, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(kpi_id, year, month, label) DO UPDATE SET
        value = excluded.value,
        sort_order = excluded.sort_order,
        notes = excluded.notes,
        updated_by = excluded.updated_by,
        updated_at = datetime('now')`,
    ).run(
      input.kpi_id,
      input.year,
      month,
      label,
      input.value,
      input.sort_order ?? 0,
      input.notes ?? null,
      input.updated_by ?? null,
    );
    const row = db
      .prepare(
        "SELECT * FROM breakdown_entries WHERE kpi_id = ? AND year = ? AND month = ? AND label = ?",
      )
      .get(input.kpi_id, input.year, month, label) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      throw new Error(
        `upsertBreakdown: row not found after upsert for kpi_id=${input.kpi_id} year=${input.year} month=${month} label=${label}`,
      );
    }
    if (
      Number(row.kpi_id) !== input.kpi_id ||
      Number(row.year) !== input.year ||
      Number(row.month ?? ANNUAL_ENTRY_MONTH) !== month ||
      String(row.label) !== label
    ) {
      throw new Error(
        `upsertBreakdown: read-back key mismatch (expected kpi=${input.kpi_id} year=${input.year} month=${month} label=${label}, got kpi=${row.kpi_id} year=${row.year} month=${row.month} label=${row.label})`,
      );
    }
    const entry = asBreakdown(row);
    recordMetricEntryHistory({
      entry_type: "breakdown",
      entry_id: entry.id,
      kpi_id: entry.kpi_id,
      year: entry.year,
      month_or_label: `${month}|${entry.label}`,
      prev_value: prior?.value ?? null,
      new_value: entry.value,
      prev_notes: prior?.notes ?? null,
      new_notes: entry.notes,
      changed_by: input.updated_by ?? null,
    });
    return entry;
  });
}

export function deleteBreakdown(id: number, changedBy?: number | null): void {
  const db = getDb();
  const prior = db
    .prepare(
      "SELECT id, kpi_id, year, month, label, value, notes FROM breakdown_entries WHERE id = ?",
    )
    .get(id) as
    | { id: number; kpi_id: number; year: number; month: number; label: string; value: number; notes: string | null }
    | undefined;
  db.prepare("DELETE FROM breakdown_entries WHERE id = ?").run(id);
  if (prior) {
    recordMetricEntryHistory({
      entry_type: "breakdown",
      entry_id: prior.id,
      kpi_id: prior.kpi_id,
      year: prior.year,
      month_or_label: `${prior.month}|${prior.label}`,
      prev_value: prior.value,
      new_value: null,
      prev_notes: prior.notes,
      new_notes: null,
      changed_by: changedBy ?? null,
    });
  }
}
