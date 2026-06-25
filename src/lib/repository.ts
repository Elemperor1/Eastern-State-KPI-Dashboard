import { getDb } from "./db";
import type {
  BreakdownEntry,
  BreakdownEntryWithMeta,
  Category,
  Direction,
  KPI,
  KPIWithCategory,
  MonthlyEntry,
  MonthlyEntryWithMeta,
  ReportingFrequency,
  UnitType,
} from "./types";

interface CategoryRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
}

interface KPIRow {
  id: number;
  category_id: number;
  parent_id: number | null;
  slug: string;
  name: string;
  unit: string;
  unit_type: UnitType;
  reporting_frequency: ReportingFrequency;
  direction: Direction;
  description: string | null;
  sort_order: number;
  is_active: number;
  created_at: string;
}

interface EntryRow {
  id: number;
  kpi_id: number;
  year: number;
  month: number;
  value: number;
  notes: string | null;
  updated_by: number | null;
  updated_at: string;
}

interface EntryJoinRow extends EntryRow {
  kpi_name: string;
  kpi_unit: string;
  kpi_unit_type: UnitType;
  category_id: number;
  category_name: string;
  category_slug: string;
}

interface KPIJoinRow extends KPIRow {
  category_name: string;
  category_slug: string;
}

function asCategory(row: Record<string, unknown>): CategoryRow {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: row.description == null ? null : String(row.description),
    sort_order: Number(row.sort_order ?? 0),
  };
}

function asKpi(row: Record<string, unknown>): KPIRow {
  return {
    id: Number(row.id),
    category_id: Number(row.category_id),
    parent_id: row.parent_id == null ? null : Number(row.parent_id),
    slug: String(row.slug),
    name: String(row.name),
    unit: String(row.unit ?? ""),
    unit_type: row.unit_type as UnitType,
    reporting_frequency: row.reporting_frequency as ReportingFrequency,
    direction: row.direction as Direction,
    description: row.description == null ? null : String(row.description),
    sort_order: Number(row.sort_order ?? 0),
    is_active: Number(row.is_active ?? 1),
    created_at: String(row.created_at),
  };
}

function asKpiWithCategory(row: Record<string, unknown>): KPIWithCategory {
  const kpi = asKpi(row);
  return {
    ...kpi,
    category_name: String(row.category_name),
    category_slug: String(row.category_slug),
  };
}

function asEntry(row: Record<string, unknown>): EntryRow {
  return {
    id: Number(row.id),
    kpi_id: Number(row.kpi_id),
    year: Number(row.year),
    month: Number(row.month),
    value: Number(row.value),
    notes: row.notes == null ? null : String(row.notes),
    updated_by: row.updated_by == null ? null : Number(row.updated_by),
    updated_at: String(row.updated_at),
  };
}

function asEntryWithMeta(row: Record<string, unknown>): MonthlyEntryWithMeta {
  const entry = asEntry(row);
  return {
    ...entry,
    kpi_name: String(row.kpi_name),
    kpi_unit: String(row.kpi_unit ?? ""),
    kpi_unit_type: row.kpi_unit_type as UnitType,
    category_id: Number(row.category_id),
    category_name: String(row.category_name),
    category_slug: String(row.category_slug),
  };
}

// ---------- Categories ----------

export function listCategories(): Category[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM categories ORDER BY sort_order ASC, name ASC")
    .all() as Record<string, unknown>[];
  return rows.map(asCategory);
}

export function getCategory(id: number): Category | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? asCategory(row) : null;
}

export function getCategoryBySlug(slug: string): Category | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM categories WHERE slug = ?").get(slug) as
    | Record<string, unknown>
    | undefined;
  return row ? asCategory(row) : null;
}

export function createCategory(input: {
  slug: string;
  name: string;
  description?: string | null;
  sort_order?: number;
}): Category {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO categories (slug, name, description, sort_order)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      input.slug.trim(),
      input.name.trim(),
      input.description ?? null,
      input.sort_order ?? 0,
    );
  return {
    id: Number(result.lastInsertRowid),
    slug: input.slug.trim(),
    name: input.name.trim(),
    description: input.description ?? null,
    sort_order: input.sort_order ?? 0,
  };
}

export function updateCategory(
  id: number,
  patch: Partial<Pick<Category, "name" | "description" | "sort_order">>,
): void {
  const db = getDb();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  if (patch.name !== undefined) {
    fields.push("name = ?");
    values.push(patch.name);
  }
  if (patch.description !== undefined) {
    fields.push("description = ?");
    values.push(patch.description);
  }
  if (patch.sort_order !== undefined) {
    fields.push("sort_order = ?");
    values.push(patch.sort_order);
  }
  if (!fields.length) return;
  values.push(id);
  db.prepare(`UPDATE categories SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteCategory(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM categories WHERE id = ?").run(id);
}

// ---------- KPIs ----------

export function listKPIs(opts?: { includeInactive?: boolean; parentsOnly?: boolean }): KPIWithCategory[] {
  const db = getDb();
  const where: string[] = [];
  if (!opts?.includeInactive) where.push("k.is_active = 1");
  if (opts?.parentsOnly) where.push("k.parent_id IS NULL");
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT k.*, c.name as category_name, c.slug as category_slug
       FROM kpis k
       JOIN categories c ON c.id = k.category_id
       ${clause}
       ORDER BY c.sort_order ASC, k.sort_order ASC, k.name ASC`,
    )
    .all() as Record<string, unknown>[];
  return rows.map(asKpiWithCategory);
}

export function getKPI(id: number): KPIWithCategory | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT k.*, c.name as category_name, c.slug as category_slug
       FROM kpis k
       JOIN categories c ON c.id = k.category_id
       WHERE k.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  return row ? asKpiWithCategory(row) : null;
}

export function getKPIBySlug(slug: string): KPIWithCategory | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT k.*, c.name as category_name, c.slug as category_slug
       FROM kpis k
       JOIN categories c ON c.id = k.category_id
       WHERE k.slug = ?`,
    )
    .get(slug) as Record<string, unknown> | undefined;
  return row ? asKpiWithCategory(row) : null;
}

export function listChildKPIs(parentId: number): KPIWithCategory[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT k.*, c.name as category_name, c.slug as category_slug
       FROM kpis k
       JOIN categories c ON c.id = k.category_id
       WHERE k.parent_id = ?
       ORDER BY k.sort_order ASC, k.name ASC`,
    )
    .all(parentId) as Record<string, unknown>[];
  return rows.map(asKpiWithCategory);
}

export function createKPI(input: {
  category_id: number;
  parent_id?: number | null;
  slug: string;
  name: string;
  unit?: string;
  unit_type?: UnitType;
  reporting_frequency?: ReportingFrequency;
  direction?: Direction;
  description?: string | null;
  sort_order?: number;
}): KPI {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO kpis (category_id, parent_id, slug, name, unit, unit_type, reporting_frequency, direction, description, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.category_id,
      input.parent_id ?? null,
      input.slug.trim(),
      input.name.trim(),
      input.unit ?? "",
      input.unit_type ?? "count",
      input.reporting_frequency ?? "monthly",
      input.direction ?? "higher",
      input.description ?? null,
      input.sort_order ?? 0,
    );
  return {
    id: Number(result.lastInsertRowid),
    category_id: input.category_id,
    parent_id: input.parent_id ?? null,
    slug: input.slug.trim(),
    name: input.name.trim(),
    unit: input.unit ?? "",
    unit_type: input.unit_type ?? "count",
    reporting_frequency: input.reporting_frequency ?? "monthly",
    direction: input.direction ?? "higher",
    description: input.description ?? null,
    sort_order: input.sort_order ?? 0,
    is_active: 1,
    created_at: new Date().toISOString(),
  };
}

export function updateKPI(
  id: number,
  patch: Partial<{
    category_id: number;
    parent_id: number | null;
    name: string;
    unit: string;
    unit_type: UnitType;
    reporting_frequency: ReportingFrequency;
    direction: Direction;
    description: string | null;
    sort_order: number;
    is_active: number;
  }>,
): void {
  const db = getDb();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  (Object.entries(patch) as [string, string | number | null | undefined][]).forEach(
    ([key, value]) => {
      if (value === undefined) return;
      fields.push(`${key} = ?`);
      values.push(value as string | number | null);
    },
  );
  if (!fields.length) return;
  values.push(id);
  db.prepare(`UPDATE kpis SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteKPI(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM kpis WHERE id = ?").run(id);
}

// ---------- Monthly / annual entries ----------

export function listEntries(filter?: {
  kpi_id?: number;
  category_id?: number;
  year?: number;
  years?: number[];
}): MonthlyEntryWithMeta[] {
  const db = getDb();
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter?.kpi_id !== undefined) {
    where.push("e.kpi_id = ?");
    params.push(filter.kpi_id);
  }
  if (filter?.category_id !== undefined) {
    where.push("k.category_id = ?");
    params.push(filter.category_id);
  }
  if (filter?.year !== undefined) {
    where.push("e.year = ?");
    params.push(filter.year);
  }
  if (filter?.years && filter.years.length) {
    where.push(`e.year IN (${filter.years.map(() => "?").join(",")})`);
    params.push(...filter.years);
  }
  const sql = `
    SELECT e.*, k.name as kpi_name, k.unit as kpi_unit, k.unit_type as kpi_unit_type,
           c.id as category_id, c.name as category_name, c.slug as category_slug
    FROM monthly_entries e
    JOIN kpis k ON k.id = e.kpi_id
    JOIN categories c ON c.id = k.category_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY e.year ASC, e.month ASC, k.sort_order ASC
  `;
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(asEntryWithMeta);
}

export function upsertEntry(input: {
  kpi_id: number;
  year: number;
  month: number; // 1-12 monthly, 0 annual
  value: number;
  notes?: string | null;
  updated_by?: number | null;
}): MonthlyEntry {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO monthly_entries (kpi_id, year, month, value, notes, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(kpi_id, year, month) DO UPDATE SET
         value = excluded.value,
         notes = excluded.notes,
         updated_by = excluded.updated_by,
         updated_at = datetime('now')`,
    )
    .run(
      input.kpi_id,
      input.year,
      input.month,
      input.value,
      input.notes ?? null,
      input.updated_by ?? null,
    );
  const row = db
    .prepare("SELECT * FROM monthly_entries WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as Record<string, unknown>;
  return asEntry(row);
}

export function deleteEntry(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM monthly_entries WHERE id = ?").run(id);
}

// ---------- Breakdown entries ----------

function asBreakdown(row: Record<string, unknown>): BreakdownEntry {
  return {
    id: Number(row.id),
    kpi_id: Number(row.kpi_id),
    year: Number(row.year),
    label: String(row.label),
    value: Number(row.value),
    sort_order: Number(row.sort_order ?? 0),
    notes: row.notes == null ? null : String(row.notes),
    updated_by: row.updated_by == null ? null : Number(row.updated_by),
    updated_at: String(row.updated_at),
  };
}

function asBreakdownWithMeta(row: Record<string, unknown>): BreakdownEntryWithMeta {
  const entry = asBreakdown(row);
  return {
    ...entry,
    kpi_name: String(row.kpi_name),
    kpi_unit: String(row.kpi_unit ?? ""),
    category_id: Number(row.category_id),
    category_name: String(row.category_name),
    category_slug: String(row.category_slug),
  };
}

export function listBreakdowns(filter?: {
  kpi_id?: number;
  category_id?: number;
  year?: number;
  years?: number[];
}): BreakdownEntryWithMeta[] {
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
  const sql = `
    SELECT b.*, k.name as kpi_name, k.unit as kpi_unit,
           c.id as category_id, c.name as category_name, c.slug as category_slug
    FROM breakdown_entries b
    JOIN kpis k ON k.id = b.kpi_id
    JOIN categories c ON c.id = k.category_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY b.year ASC, b.sort_order ASC, b.label ASC
  `;
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(asBreakdownWithMeta);
}

export function upsertBreakdown(input: {
  kpi_id: number;
  year: number;
  label: string;
  value: number;
  sort_order?: number;
  notes?: string | null;
  updated_by?: number | null;
}): BreakdownEntry {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO breakdown_entries (kpi_id, year, label, value, sort_order, notes, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(kpi_id, year, label) DO UPDATE SET
         value = excluded.value,
         sort_order = excluded.sort_order,
         notes = excluded.notes,
         updated_by = excluded.updated_by,
         updated_at = datetime('now')`,
    )
    .run(
      input.kpi_id,
      input.year,
      input.label.trim(),
      input.value,
      input.sort_order ?? 0,
      input.notes ?? null,
      input.updated_by ?? null,
    );
  const row = db
    .prepare("SELECT * FROM breakdown_entries WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as Record<string, unknown>;
  return asBreakdown(row);
}

export function deleteBreakdown(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM breakdown_entries WHERE id = ?").run(id);
}

/** All distinct years present across monthly + breakdown entries. */
export function listAvailableYears(): number[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT year FROM (
        SELECT year FROM monthly_entries
        UNION ALL
        SELECT year FROM breakdown_entries
      ) ORDER BY year ASC`,
    )
    .all() as Record<string, unknown>[];
  return rows.map((r) => Number(r.year));
}
