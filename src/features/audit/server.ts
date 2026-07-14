import { getDb } from "@/lib/db";
import type { Category, EntryHistoryWithMeta, KPIWithCategory } from "@/lib/types";

export interface EntryHistoryFilter {
  kpi_id?: number;
  category_id?: number;
  year?: number;
  limit?: number;
  offset?: number;
}

export function listEntryHistory(filter?: EntryHistoryFilter): EntryHistoryWithMeta[] {
  const db = getDb();
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter?.kpi_id !== undefined) {
    // Filter on the snapshot KPI id so history stays reachable after deletion.
    where.push("h.kpi_id = ?");
    params.push(filter.kpi_id);
  }
  if (filter?.category_id !== undefined) {
    // D8AD-CAN-005: filter on the snapshot category id, never a live join.
    where.push("h.category_id = ?");
    params.push(filter.category_id);
  }
  if (filter?.year !== undefined) {
    where.push("h.year = ?");
    params.push(filter.year);
  }
  const limit = Math.min(Math.max(filter?.limit ?? 200, 1), 1000);
  const offset = Number.isSafeInteger(filter?.offset)
    ? Math.max(filter?.offset ?? 0, 0)
    : 0;
  const sql = `
    SELECT h.*,
           h.kpi_name as kpi_name,
           h.kpi_slug as kpi_slug,
           h.kpi_unit as kpi_unit,
           h.category_id as category_id,
           h.category_name as category_name,
           h.category_slug as category_slug,
           h.changed_by_email as changed_by_email,
           k.name as kpi_current_name,
           k.slug as kpi_current_slug,
           c.name as category_current_name,
           c.slug as category_current_slug,
           CASE WHEN k.id IS NULL OR (h.category_id IS NOT NULL AND c.id IS NULL)
                THEN 1 ELSE 0 END AS metadata_deleted,
           CASE WHEN k.id IS NOT NULL AND (
                  k.name IS NOT h.kpi_name OR k.slug IS NOT h.kpi_slug
                  OR c.name IS NOT h.category_name OR c.slug IS NOT h.category_slug
                )
                THEN 1 ELSE 0 END AS metadata_renamed
    FROM entry_history h
    LEFT JOIN kpis k ON k.id = h.kpi_id
    LEFT JOIN categories c ON c.id = h.category_id
    LEFT JOIN users u ON u.id = h.changed_by
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY h.changed_at DESC, h.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: Number(row.id),
    entry_type: String(row.entry_type) as "monthly" | "breakdown",
    entry_id: row.entry_id == null ? null : Number(row.entry_id),
    kpi_id: Number(row.kpi_id),
    year: Number(row.year),
    month_or_label: String(row.month_or_label),
    prev_value: row.prev_value == null ? null : Number(row.prev_value),
    new_value: row.new_value == null ? null : Number(row.new_value),
    prev_notes: row.prev_notes == null ? null : String(row.prev_notes),
    new_notes: row.new_notes == null ? null : String(row.new_notes),
    changed_by: row.changed_by == null ? null : Number(row.changed_by),
    changed_at: String(row.changed_at),
    kpi_name: row.kpi_name == null ? null : String(row.kpi_name),
    kpi_slug: row.kpi_slug == null ? null : String(row.kpi_slug),
    kpi_unit: row.kpi_unit == null ? null : String(row.kpi_unit),
    category_id: row.category_id == null ? null : Number(row.category_id),
    category_name: row.category_name == null ? null : String(row.category_name),
    category_slug: row.category_slug == null ? null : String(row.category_slug),
    changed_by_email: row.changed_by_email == null ? null : String(row.changed_by_email),
    kpi_current_name: row.kpi_current_name == null ? null : String(row.kpi_current_name),
    kpi_current_slug: row.kpi_current_slug == null ? null : String(row.kpi_current_slug),
    category_current_name: row.category_current_name == null ? null : String(row.category_current_name),
    category_current_slug: row.category_current_slug == null ? null : String(row.category_current_slug),
    metadata_deleted: Number(row.metadata_deleted) === 1,
    metadata_renamed: Number(row.metadata_renamed) === 1,
  }));
}

export function listEntryHistoryYears(): number[] {
  const rows = getDb()
    .prepare("SELECT DISTINCT year FROM entry_history ORDER BY year DESC")
    .all() as Array<{ year: number }>;
  return rows.map((row) => Number(row.year));
}

export function listDeletedHistoryCategories(): Category[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      WITH deleted_categories AS (
        SELECT
          h.category_id,
          h.category_name,
          h.category_slug,
          ROW_NUMBER() OVER (
            PARTITION BY h.category_id
            ORDER BY h.changed_at DESC, h.id DESC
          ) AS rn
        FROM entry_history h
        LEFT JOIN categories c ON c.id = h.category_id
        WHERE h.category_id IS NOT NULL AND c.id IS NULL
      )
      SELECT category_id, category_name, category_slug
      FROM deleted_categories
      WHERE rn = 1
      ORDER BY category_id ASC
      `,
    )
    .all() as Record<string, unknown>[];
  return rows.map((row) => ({
    id: Number(row.category_id),
    slug: row.category_slug == null ? `deleted-${Number(row.category_id)}` : String(row.category_slug),
    name: row.category_name == null ? `Deleted category ${Number(row.category_id)}` : String(row.category_name),
    description: null,
    sort_order: 9999,
  }));
}

export function listDeletedHistoryKpis(): KPIWithCategory[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      WITH deleted_kpis AS (
        SELECT
          h.kpi_id,
          h.kpi_name,
          h.kpi_slug,
          h.kpi_unit,
          h.category_id,
          h.category_name,
          h.category_slug,
          ROW_NUMBER() OVER (
            PARTITION BY h.kpi_id
            ORDER BY h.changed_at DESC, h.id DESC
          ) AS rn
        FROM entry_history h
        LEFT JOIN kpis k ON k.id = h.kpi_id
        WHERE k.id IS NULL
      )
      SELECT kpi_id, kpi_name, kpi_slug, kpi_unit, category_id, category_name, category_slug
      FROM deleted_kpis
      WHERE rn = 1
      ORDER BY kpi_id ASC
      `,
    )
    .all() as Record<string, unknown>[];
  return rows.map((row) => ({
    id: Number(row.kpi_id),
    category_id: row.category_id == null ? 0 : Number(row.category_id),
    parent_id: null,
    slug: row.kpi_slug == null ? `deleted-${Number(row.kpi_id)}` : String(row.kpi_slug),
    name: row.kpi_name == null ? `Deleted KPI ${Number(row.kpi_id)}` : String(row.kpi_name),
    unit: row.kpi_unit == null ? "" : String(row.kpi_unit),
    unit_type: "count",
    reporting_frequency: "monthly",
    direction: "higher",
    description: null,
    sort_order: 9999,
    is_active: 0,
    created_at: "",
    category_name: row.category_name == null ? "Deleted category" : String(row.category_name),
    category_slug: row.category_slug == null ? "deleted" : String(row.category_slug),
  }));
}
