import { getDb } from "@/lib/db";
import type {
  Category,
  Direction,
  KPI,
  KPIWithCategory,
  ReportingFrequency,
  UnitType,
} from "@/lib/types";

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
  return asCategory(row);
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

/**
 * Thrown when an admin attempts to delete a KPI or category that still has
 * dependent live entries. Deleting metadata with live entries used to cascade
 * silently and destroy monthly/breakdown rows. The admin must delete the
 * dependent entries first so their audit tombstones are recorded.
 */
export class DependentEntriesError extends Error {
  readonly code = "DEPENDENT_ENTRIES" as const;
  readonly dependency: "kpi" | "category";
  readonly dependents: number;

  constructor(dependency: "kpi" | "category", dependents: number) {
    const what = dependency === "kpi" ? "KPI" : "category";
    super(
      `Cannot delete ${what}: ${dependents} live entr${dependents === 1 ? "y is" : "ies are"} still referencing it. Delete the dependent entries first so their audit history is recorded.`,
    );
    this.name = "DependentEntriesError";
    this.dependency = dependency;
    this.dependents = dependents;
  }
}

/** Number of live monthly + breakdown entries for a KPI, including descendants. */
export function countKPIDependents(id: number): number {
  const db = getDb();
  const row = db
    .prepare(
      `WITH RECURSIVE descendants(id) AS (
         SELECT id FROM kpis WHERE id = ?
         UNION ALL
         SELECT k.id
         FROM kpis k
         JOIN descendants d ON k.parent_id = d.id
       )
       SELECT
         (SELECT COUNT(*) FROM monthly_entries WHERE kpi_id IN (SELECT id FROM descendants)) +
         (SELECT COUNT(*) FROM breakdown_entries WHERE kpi_id IN (SELECT id FROM descendants)) AS n`,
    )
    .get(id) as { n: number };
  return Number(row.n);
}

/** Total live entries across every KPI in a category. */
export function countCategoryDependents(id: number): number {
  const db = getDb();
  const monthly = db
    .prepare(
      `SELECT COUNT(*) AS n FROM monthly_entries
       WHERE kpi_id IN (SELECT id FROM kpis WHERE category_id = ?)`,
    )
    .get(id) as { n: number };
  const breakdown = db
    .prepare(
      `SELECT COUNT(*) AS n FROM breakdown_entries
       WHERE kpi_id IN (SELECT id FROM kpis WHERE category_id = ?)`,
    )
    .get(id) as { n: number };
  return Number(monthly.n) + Number(breakdown.n);
}

export function deleteCategory(id: number): void {
  const dependents = countCategoryDependents(id);
  if (dependents > 0) {
    throw new DependentEntriesError("category", dependents);
  }
  const db = getDb();
  db.prepare("DELETE FROM categories WHERE id = ?").run(id);
}

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
  return asKpi(row);
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
  const dependents = countKPIDependents(id);
  if (dependents > 0) {
    throw new DependentEntriesError("kpi", dependents);
  }
  const db = getDb();
  db.prepare("DELETE FROM kpis WHERE id = ?").run(id);
}
