import { getDb, transaction } from "./db";
import type {
  BreakdownEntry,
  BreakdownEntryWithMeta,
  Category,
  Direction,
  EntryHistoryWithMeta,
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
  const slug = input.slug.trim();
  const name = input.name.trim();
  // Re-read by the natural unique key (slug) rather than trusting
  // `result.lastInsertRowid`. See the upsert path for the rationale;
  // the same robustness argument applies here.
  db.prepare(
    `INSERT INTO categories (slug, name, description, sort_order)
     VALUES (?, ?, ?, ?)`,
  ).run(slug, name, input.description ?? null, input.sort_order ?? 0);
  const row = db
    .prepare("SELECT * FROM categories WHERE slug = ?")
    .get(slug) as Record<string, unknown> | undefined;
  if (!row) {
    throw new Error(`createCategory: row not found after insert for slug=${slug}`);
  }
  return {
    id: Number(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: row.description == null ? null : String(row.description),
    sort_order: Number(row.sort_order),
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
  const slug = input.slug.trim();
  const name = input.name.trim();
  // Re-read by the natural unique key (slug) rather than trusting
  // `result.lastInsertRowid`. See the upsert path for the rationale;
  // the same robustness argument applies here.
  db.prepare(
    `INSERT INTO kpis (category_id, parent_id, slug, name, unit, unit_type, reporting_frequency, direction, description, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.category_id,
    input.parent_id ?? null,
    slug,
    name,
    input.unit ?? "",
    input.unit_type ?? "count",
    input.reporting_frequency ?? "monthly",
    input.direction ?? "higher",
    input.description ?? null,
    input.sort_order ?? 0,
  );
  const row = db
    .prepare("SELECT * FROM kpis WHERE slug = ?")
    .get(slug) as Record<string, unknown> | undefined;
  if (!row) {
    throw new Error(`createKPI: row not found after insert for slug=${slug}`);
  }
  return {
    id: Number(row.id),
    category_id: Number(row.category_id),
    parent_id: row.parent_id == null ? null : Number(row.parent_id),
    slug: String(row.slug),
    name: String(row.name),
    unit: String(row.unit ?? ""),
    unit_type: String(row.unit_type) as UnitType,
    reporting_frequency: String(row.reporting_frequency) as ReportingFrequency,
    direction: String(row.direction) as Direction,
    description: row.description == null ? null : String(row.description),
    sort_order: Number(row.sort_order),
    is_active: Number(row.is_active ?? 1),
    created_at: String(row.created_at),
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

function recordHistory(input: {
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
  db.prepare(
    `INSERT INTO entry_history
       (entry_type, entry_id, kpi_id, year, month_or_label,
        prev_value, new_value, prev_notes, new_notes, changed_by, changed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
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
  );
}

export function upsertEntry(input: {
  kpi_id: number;
  year: number;
  month: number; // 1-12 monthly, 0 annual
  value: number;
  notes?: string | null;
  updated_by?: number | null;
}): MonthlyEntry {
  // The whole upsert+readback+history sequence runs in a single transaction
  // so a crash or concurrent writer cannot produce a torn audit row. The
  // post-write read uses the natural unique key (kpi_id, year, month), not
  // `result.lastInsertRowid` — that id is connection-level and on
  // ON CONFLICT DO UPDATE it is not guaranteed to point at the row we just
  // changed. A key match is asserted before the history row is recorded.
  return transaction(() => {
    const db = getDb();
    // Capture the prior value so we can record it as `prev_*` in the audit log.
    const prior = db
      .prepare(
        "SELECT id, value, notes FROM monthly_entries WHERE kpi_id = ? AND year = ? AND month = ?",
      )
      .get(input.kpi_id, input.year, input.month) as
      | { id: number; value: number; notes: string | null }
      | undefined;
    db.prepare(
      `INSERT INTO monthly_entries (kpi_id, year, month, value, notes, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(kpi_id, year, month) DO UPDATE SET
         value = excluded.value,
         notes = excluded.notes,
         updated_by = excluded.updated_by,
         updated_at = datetime('now')`,
    ).run(
      input.kpi_id,
      input.year,
      input.month,
      input.value,
      input.notes ?? null,
      input.updated_by ?? null,
    );
    // Read back by the natural key, not by `lastInsertRowid`. After an
    // ON CONFLICT update, `lastInsertRowid` may still point at a different
    // row that the connection inserted earlier — a silent wrong-row bug
    // that would corrupt the audit history.
    const row = db
      .prepare(
        "SELECT * FROM monthly_entries WHERE kpi_id = ? AND year = ? AND month = ?",
      )
      .get(input.kpi_id, input.year, input.month) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      // Defensive: a successful UPSERT must produce a row, so a missing
      // read-back indicates either a schema mismatch or a connection-level
      // failure. Refuse to write history for a row we cannot prove exists.
      throw new Error(
        `upsertEntry: row not found after upsert for kpi_id=${input.kpi_id} year=${input.year} month=${input.month}`,
      );
    }
    if (
      Number(row.kpi_id) !== input.kpi_id ||
      Number(row.year) !== input.year ||
      Number(row.month) !== input.month
    ) {
      // Key mismatch would mean a concurrent writer swapped the row out
      // from under us. The transaction is still open; rolling back keeps
      // the audit trail honest.
      throw new Error(
        `upsertEntry: read-back key mismatch (expected kpi=${input.kpi_id} year=${input.year} month=${input.month}, got kpi=${row.kpi_id} year=${row.year} month=${row.month})`,
      );
    }
    const entry = asEntry(row);
    recordHistory({
      entry_type: "monthly",
      entry_id: entry.id,
      kpi_id: entry.kpi_id,
      year: entry.year,
      month_or_label: String(entry.month),
      prev_value: prior?.value ?? null,
      new_value: entry.value,
      prev_notes: prior?.notes ?? null,
      new_notes: entry.notes,
      changed_by: input.updated_by ?? null,
    });
    return entry;
  });
}

export function deleteEntry(id: number, changedBy?: number | null): void {
  const db = getDb();
  // Snapshot before delete so the audit row still has prev_value/notes.
  const prior = db
    .prepare(
      "SELECT id, kpi_id, year, month, value, notes FROM monthly_entries WHERE id = ?",
    )
    .get(id) as
    | { id: number; kpi_id: number; year: number; month: number; value: number; notes: string | null }
    | undefined;
  db.prepare("DELETE FROM monthly_entries WHERE id = ?").run(id);
  if (prior) {
    recordHistory({
      entry_type: "monthly",
      entry_id: prior.id,
      kpi_id: prior.kpi_id,
      year: prior.year,
      month_or_label: String(prior.month),
      prev_value: prior.value,
      new_value: null,
      prev_notes: prior.notes,
      new_notes: null,
      changed_by: changedBy ?? null,
    });
  }
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
  // See upsertEntry for the rationale: the upsert + readback + history is
  // wrapped in a transaction, the post-write read uses the natural unique
  // key (kpi_id, year, label) instead of `lastInsertRowid`, and a key
  // mismatch throws so a wrong-row bug cannot silently corrupt the audit
  // trail.
  return transaction(() => {
    const db = getDb();
    const label = input.label.trim();
    // Capture the prior row (if any) so the history log records the before-state.
    const prior = db
      .prepare(
        "SELECT id, value, notes FROM breakdown_entries WHERE kpi_id = ? AND year = ? AND label = ?",
      )
      .get(input.kpi_id, input.year, label) as
      | { id: number; value: number; notes: string | null }
      | undefined;
    db.prepare(
      `INSERT INTO breakdown_entries (kpi_id, year, label, value, sort_order, notes, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(kpi_id, year, label) DO UPDATE SET
         value = excluded.value,
         sort_order = excluded.sort_order,
         notes = excluded.notes,
         updated_by = excluded.updated_by,
         updated_at = datetime('now')`,
    ).run(
      input.kpi_id,
      input.year,
      label,
      input.value,
      input.sort_order ?? 0,
      input.notes ?? null,
      input.updated_by ?? null,
    );
    const row = db
      .prepare(
        "SELECT * FROM breakdown_entries WHERE kpi_id = ? AND year = ? AND label = ?",
      )
      .get(input.kpi_id, input.year, label) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      throw new Error(
        `upsertBreakdown: row not found after upsert for kpi_id=${input.kpi_id} year=${input.year} label=${label}`,
      );
    }
    if (
      Number(row.kpi_id) !== input.kpi_id ||
      Number(row.year) !== input.year ||
      String(row.label) !== label
    ) {
      throw new Error(
        `upsertBreakdown: read-back key mismatch (expected kpi=${input.kpi_id} year=${input.year} label=${label}, got kpi=${row.kpi_id} year=${row.year} label=${row.label})`,
      );
    }
    const entry = asBreakdown(row);
    recordHistory({
      entry_type: "breakdown",
      entry_id: entry.id,
      kpi_id: entry.kpi_id,
      year: entry.year,
      month_or_label: entry.label,
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
      "SELECT id, kpi_id, year, label, value, notes FROM breakdown_entries WHERE id = ?",
    )
    .get(id) as
    | { id: number; kpi_id: number; year: number; label: string; value: number; notes: string | null }
    | undefined;
  db.prepare("DELETE FROM breakdown_entries WHERE id = ?").run(id);
  if (prior) {
    recordHistory({
      entry_type: "breakdown",
      entry_id: prior.id,
      kpi_id: prior.kpi_id,
      year: prior.year,
      month_or_label: prior.label,
      prev_value: prior.value,
      new_value: null,
      prev_notes: prior.notes,
      new_notes: null,
      changed_by: changedBy ?? null,
    });
  }
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

// ---------- Entry history (audit trail) ----------

export function listEntryHistory(filter?: {
  kpi_id?: number;
  category_id?: number;
  year?: number;
  limit?: number;
}): EntryHistoryWithMeta[] {
  const db = getDb();
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter?.kpi_id !== undefined) {
    where.push("h.kpi_id = ?");
    params.push(filter.kpi_id);
  }
  if (filter?.category_id !== undefined) {
    where.push("k.category_id = ?");
    params.push(filter.category_id);
  }
  if (filter?.year !== undefined) {
    where.push("h.year = ?");
    params.push(filter.year);
  }
  const limit = Math.min(Math.max(filter?.limit ?? 200, 1), 1000);
  const sql = `
    SELECT h.*,
           k.name as kpi_name, k.slug as kpi_slug,
           c.id as category_id, c.name as category_name, c.slug as category_slug,
           u.email as changed_by_email
    FROM entry_history h
    JOIN kpis k ON k.id = h.kpi_id
    JOIN categories c ON c.id = k.category_id
    LEFT JOIN users u ON u.id = h.changed_by
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY h.changed_at DESC, h.id DESC
    LIMIT ${limit}
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
    kpi_name: String(row.kpi_name),
    kpi_slug: String(row.kpi_slug),
    category_id: Number(row.category_id),
    category_name: String(row.category_name),
    category_slug: String(row.category_slug),
    changed_by_email: row.changed_by_email == null ? null : String(row.changed_by_email),
  }));
}
