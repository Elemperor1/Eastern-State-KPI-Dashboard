import type {
  ExplicitStrategyReportingFrequency,
  MeasurementType,
} from "@/features/strategy";
import {
  appendStrategicGoalMembership,
  createMeasurementConfiguration,
  getStrategicGoalRecord,
  recordStrategicAuditEvent,
} from "@/features/strategy/server";
import { getDb, transaction } from "@/lib/db";
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
  archived_at: string | null;
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
  archived_at: string | null;
}

function asCategory(row: Record<string, unknown>): CategoryRow {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: row.description == null ? null : String(row.description),
    sort_order: Number(row.sort_order ?? 0),
    archived_at: row.archived_at == null ? null : String(row.archived_at),
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
    archived_at: row.archived_at == null ? null : String(row.archived_at),
  };
}

function asKpiWithCategory(row: Record<string, unknown>): KPIWithCategory {
  const kpi = asKpi(row);
  return {
    ...kpi,
    category_name: String(row.category_name),
    category_slug: String(row.category_slug),
    category_archived_at:
      row.category_archived_at == null
        ? null
        : String(row.category_archived_at),
  };
}

export function listCategories(
  options: { includeArchived?: boolean } = {},
): Category[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM categories
       ${options.includeArchived ? "" : "WHERE archived_at IS NULL"}
       ORDER BY sort_order ASC, name ASC`,
    )
    .all() as Record<string, unknown>[];
  return rows.map(asCategory);
}

export function getCategory(
  id: number,
  options: { includeArchived?: boolean } = {},
): Category | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM categories WHERE id = ?
       ${options.includeArchived ? "" : "AND archived_at IS NULL"}`,
    )
    .get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? asCategory(row) : null;
}

export function getCategoryBySlug(
  slug: string,
  options: { includeArchived?: boolean } = {},
): Category | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM categories WHERE slug = ?
       ${options.includeArchived ? "" : "AND archived_at IS NULL"}`,
    )
    .get(slug) as
    | Record<string, unknown>
    | undefined;
  return row ? asCategory(row) : null;
}

export function createCategory(
  input: {
    slug: string;
    name: string;
    description?: string | null;
    sort_order?: number;
  },
  actorId: number | null = null,
): Category {
  return transaction(() => {
    const db = getDb();
    const slug = input.slug.trim();
    const name = input.name.trim();
    const result = db
      .prepare(
        `INSERT INTO categories (slug, name, description, sort_order)
         VALUES (?, ?, ?, ?)`,
      )
      .run(slug, name, input.description ?? null, input.sort_order ?? 0);
    const row = rawCategory(Number(result.lastInsertRowid));
    recordLegacyCategoryEvent(null, row, "create", actorId);
    return asCategory(row);
  });
}

export function updateCategory(
  id: number,
  patch: Partial<Pick<Category, "name" | "description" | "sort_order">>,
  actorId: number | null = null,
): void {
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
  transaction(() => {
    const before = rawCategory(id);
    getDb()
      .prepare(`UPDATE categories SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values, id);
    const after = rawCategory(id);
    if (
      !sameSnapshot(
        legacyCategorySnapshot(before),
        legacyCategorySnapshot(after),
      )
    ) {
      recordLegacyCategoryEvent(before, after, "update", actorId);
    }
  });
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
function countKPIDependents(id: number): number {
  const db = getDb();
  const row = db
    .prepare(
      `WITH RECURSIVE descendants(id) AS (
         SELECT id FROM kpis WHERE id = ?
         UNION
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

/**
 * Total live entries across every KPI owned by a category, including every
 * descendant that SQLite would cascade-delete through `kpis.parent_id` even
 * when that descendant is assigned to a different category.
 */
export function countCategoryDependents(id: number): number {
  const db = getDb();
  const row = db
    .prepare(
      `WITH RECURSIVE descendants(id) AS (
         SELECT id FROM kpis WHERE category_id = ?
         UNION
         SELECT child.id
         FROM kpis child
         JOIN descendants parent ON child.parent_id = parent.id
       )
       SELECT
         (SELECT COUNT(*) FROM monthly_entries
          WHERE kpi_id IN (SELECT id FROM descendants)) +
         (SELECT COUNT(*) FROM breakdown_entries
          WHERE kpi_id IN (SELECT id FROM descendants)) AS n`,
    )
    .get(id) as { n: number };
  return Number(row.n);
}

function deleteCategory(id: number): void {
  const dependents = countCategoryDependents(id);
  if (dependents > 0) {
    throw new DependentEntriesError("category", dependents);
  }
  const db = getDb();
  db.prepare("DELETE FROM categories WHERE id = ?").run(id);
}

export function listKPIs(opts?: {
  includeInactive?: boolean;
  parentsOnly?: boolean;
  includeArchived?: boolean;
}): KPIWithCategory[] {
  const db = getDb();
  const where: string[] = [];
  if (!opts?.includeInactive) where.push("k.is_active = 1");
  if (opts?.parentsOnly) where.push("k.parent_id IS NULL");
  if (!opts?.includeArchived) {
    where.push("k.archived_at IS NULL");
    where.push("c.archived_at IS NULL");
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT k.*, c.name as category_name, c.slug as category_slug,
              c.archived_at as category_archived_at
       FROM kpis k
       JOIN categories c ON c.id = k.category_id
       ${clause}
       ORDER BY c.sort_order ASC, k.sort_order ASC, k.name ASC`,
    )
    .all() as Record<string, unknown>[];
  return rows.map(asKpiWithCategory);
}

export function getKPI(
  id: number,
  options: { includeArchived?: boolean } = {},
): KPIWithCategory | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT k.*, c.name as category_name, c.slug as category_slug,
              c.archived_at as category_archived_at
       FROM kpis k
       JOIN categories c ON c.id = k.category_id
       WHERE k.id = ?
         ${options.includeArchived ? "" : "AND k.archived_at IS NULL AND c.archived_at IS NULL"}`,
    )
    .get(id) as Record<string, unknown> | undefined;
  return row ? asKpiWithCategory(row) : null;
}

export function createKPI(
  input: {
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
  },
  actorId: number | null = null,
): KPI {
  return transaction(() => {
    const db = getDb();
    const slug = input.slug.trim();
    const name = input.name.trim();
    const result = db
      .prepare(
        `INSERT INTO kpis (category_id, parent_id, slug, name, unit, unit_type, reporting_frequency, direction, description, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
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
    const row = rawKpiWithContext(Number(result.lastInsertRowid));
    recordLegacyKpiEvent(null, row, "create", actorId);
    return asKpi(row);
  });
}

export interface CreateStrategicMeasureInput {
  goal_id: number;
  reporting_year: number;
  slug: string;
  name: string;
  unit: string;
  measurement_type: MeasurementType;
  reporting_frequency: ExplicitStrategyReportingFrequency;
  direction: Direction;
  description?: string | null;
}

function legacyUnitTypeForMeasurement(
  measurementType: MeasurementType,
): UnitType {
  if (measurementType === "currency") return "currency";
  if (
    measurementType === "percentage" ||
    measurementType === "average" ||
    measurementType === "ratio"
  ) {
    return "percent";
  }
  if (measurementType === "distribution") return "breakdown";
  if (
    measurementType === "binary" ||
    measurementType === "milestone" ||
    measurementType === "multi_component"
  ) {
    return "note";
  }
  return "count";
}

function legacyFrequencyForStrategy(
  frequency: ExplicitStrategyReportingFrequency,
): ReportingFrequency {
  if (frequency === "monthly" || frequency === "annual") return frequency;
  return "flexible";
}

/**
 * Create every record a runtime strategic measure needs as one unit of work.
 * The legacy KPI row remains the shared identity/catalog record, while the
 * membership and configuration make the measure usable by Setup, Data Entry,
 * and Reports. Any validation or persistence failure rolls back all three.
 */
export function createStrategicMeasure(
  input: CreateStrategicMeasureInput,
  actorId: number | null = null,
) {
  return transaction(() => {
    const goal = getStrategicGoalRecord(input.goal_id);
    if (!goal) {
      throw new Error(`Strategic goal ${input.goal_id} was not found.`);
    }
    const priority = getCategory(goal.priority_id, { includeArchived: true });
    if (
      !priority ||
      priority.archived_at !== null ||
      goal.archived_at !== null ||
      goal.configuration_status === "archived"
    ) {
      throw new Error(
        "Restore the goal and Strategic Priority before adding a measure.",
      );
    }
    if (
      input.reporting_year < goal.plan_start_year ||
      input.reporting_year > goal.plan_end_year
    ) {
      throw new Error(
        `Reporting year must be between ${goal.plan_start_year} and ${goal.plan_end_year}.`,
      );
    }

    const kpi = createKPI(
      {
        category_id: goal.priority_id,
        slug: input.slug,
        name: input.name,
        unit: input.unit,
        unit_type: legacyUnitTypeForMeasurement(input.measurement_type),
        reporting_frequency: legacyFrequencyForStrategy(
          input.reporting_frequency,
        ),
        direction: input.direction,
        description: input.description ?? null,
      },
      actorId,
    );
    const membership = appendStrategicGoalMembership(
      {
        goal_id: goal.id,
        role: "required",
        weight: 1,
        effective_start_year: input.reporting_year,
        effective_end_year: goal.plan_end_year,
      },
      {
        kpi_id: kpi.id,
        priority_id: kpi.category_id,
        kpi_archived_at: kpi.archived_at ?? null,
        priority_archived_at: priority.archived_at,
      },
      actorId,
    );
    const configuration = createMeasurementConfiguration(
      {
        kpi_id: kpi.id,
        measurement_type: input.measurement_type,
        unit: input.unit,
        numerator_label: null,
        denominator_label: null,
        fixed_denominator: null,
        baseline_value: null,
        reporting_frequency: input.reporting_frequency,
        aggregation_method: "none",
        board_level_status: "not_reported",
        calculation_precision: 1,
        allow_score_over_max: false,
        effective_start_year: input.reporting_year,
        effective_end_year: goal.plan_end_year,
        configuration_status: "draft",
        unresolved_question: null,
        owner: null,
        due_date: null,
        resolution_notes: null,
        source_reference: "Created in Setup",
        last_reviewed_date: null,
      },
      actorId,
    );

    return { kpi, membership, configuration };
  });
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
  actorId: number | null = null,
): void {
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
  transaction(() => {
    const before = rawKpiWithContext(id);
    getDb()
      .prepare(`UPDATE kpis SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values, id);
    const after = rawKpiWithContext(id);
    if (!sameSnapshot(legacyKpiSnapshot(before), legacyKpiSnapshot(after))) {
      recordLegacyKpiEvent(before, after, "update", actorId);
    }
  });
}

function deleteKPI(id: number): void {
  const dependents = countKPIDependents(id);
  if (dependents > 0) {
    throw new DependentEntriesError("kpi", dependents);
  }
  const db = getDb();
  db.prepare("DELETE FROM kpis WHERE id = ?").run(id);
}

export type CatalogLifecycleResult = "archived" | "deleted";

export class CatalogEntityNotFoundError extends Error {
  readonly code = "CATALOG_ENTITY_NOT_FOUND" as const;

  constructor(kind: "KPI" | "category", id: number) {
    super(`${kind} ${id} was not found.`);
    this.name = "CatalogEntityNotFoundError";
  }
}

function rawCategory(id: number): Record<string, unknown> {
  const row = getDb()
    .prepare("SELECT * FROM categories WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  if (!row) throw new CatalogEntityNotFoundError("category", id);
  return row;
}

function legacyCategorySnapshot(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: row.description == null ? null : String(row.description),
    sort_order: Number(row.sort_order ?? 0),
    archived_at: row.archived_at == null ? null : String(row.archived_at),
  };
}

function sameSnapshot(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): boolean {
  return JSON.stringify(before) === JSON.stringify(after);
}

function recordLegacyCategoryEvent(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  eventType: "create" | "update" | "delete",
  actorId: number | null,
): void {
  const subject = after ?? before;
  if (!subject) throw new Error("Category audit events require a snapshot.");
  recordStrategicAuditEvent({
    entity_type: "strategic_priority",
    entity_id: Number(subject.id),
    event_type: eventType,
    entity_display_name: String(subject.name),
    parent_priority_name: String(subject.name),
    previous_value: before == null ? null : legacyCategorySnapshot(before),
    new_value: after == null ? null : legacyCategorySnapshot(after),
    actor_id: actorId,
    source_reference: "Admin catalog configuration",
  });
}

function rawKpiWithContext(id: number): Record<string, unknown> {
  const row = getDb()
    .prepare(
      `SELECT k.*, c.name AS category_name,
              (
                SELECT g.name
                FROM goal_kpis membership
                JOIN strategic_goals g ON g.id = membership.goal_id
                WHERE membership.kpi_id = k.id
                ORDER BY membership.archived_at IS NULL DESC,
                         membership.effective_from_year DESC,
                         membership.id DESC
                LIMIT 1
              ) AS goal_name
       FROM kpis k
       JOIN categories c ON c.id = k.category_id
       WHERE k.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!row) throw new CatalogEntityNotFoundError("KPI", id);
  return row;
}

function legacyKpiSnapshot(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    category_id: Number(row.category_id),
    category_name: String(row.category_name),
    parent_id: row.parent_id == null ? null : Number(row.parent_id),
    slug: String(row.slug),
    name: String(row.name),
    unit: String(row.unit ?? ""),
    unit_type: String(row.unit_type),
    reporting_frequency: String(row.reporting_frequency),
    direction: String(row.direction),
    description: row.description == null ? null : String(row.description),
    sort_order: Number(row.sort_order ?? 0),
    is_active: Number(row.is_active ?? 1),
    created_at: String(row.created_at),
    archived_at: row.archived_at == null ? null : String(row.archived_at),
  };
}

function recordLegacyKpiEvent(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  eventType: "create" | "update" | "delete",
  actorId: number | null,
): void {
  const subject = after ?? before;
  if (!subject) throw new Error("KPI audit events require a snapshot.");
  recordStrategicAuditEvent({
    entity_type: "kpi",
    entity_id: Number(subject.id),
    event_type: eventType,
    entity_display_name: String(subject.name),
    parent_priority_name: String(subject.category_name),
    parent_goal_name:
      subject.goal_name == null ? null : String(subject.goal_name),
    previous_value: before == null ? null : legacyKpiSnapshot(before),
    new_value: after == null ? null : legacyKpiSnapshot(after),
    actor_id: actorId,
    source_reference: "Admin catalog configuration",
  });
}

function rawKpisInCategoryWithContext(
  categoryId: number,
): Record<string, unknown>[] {
  const ids = getDb()
    .prepare(
      `WITH RECURSIVE descendants(id) AS (
         SELECT id FROM kpis WHERE category_id = ?
         UNION
         SELECT child.id
         FROM kpis child
         JOIN descendants parent ON child.parent_id = parent.id
       )
       SELECT id FROM descendants ORDER BY id`,
    )
    .all(categoryId) as Array<{ id: number }>;
  return ids.map(({ id }) => rawKpiWithContext(Number(id)));
}

function rawKpiTreeWithContext(kpiId: number): Record<string, unknown>[] {
  const ids = getDb()
    .prepare(
      `WITH RECURSIVE descendants(id) AS (
         SELECT id FROM kpis WHERE id = ?
         UNION
         SELECT child.id
         FROM kpis child
         JOIN descendants parent ON child.parent_id = parent.id
       )
       SELECT id FROM descendants ORDER BY id`,
    )
    .all(kpiId) as Array<{ id: number }>;
  if (ids.length === 0) throw new CatalogEntityNotFoundError("KPI", kpiId);
  return ids.map(({ id }) => rawKpiWithContext(Number(id)));
}

export function isStrategicKPI(id: number): boolean {
  const row = getDb()
    .prepare(
      `WITH RECURSIVE descendants(id) AS (
         SELECT id FROM kpis WHERE id = ?
         UNION
         SELECT child.id
         FROM kpis child
         JOIN descendants parent ON child.parent_id = parent.id
       )
       SELECT CASE WHEN
         EXISTS (
           SELECT 1 FROM descendants k
           WHERE EXISTS (SELECT 1 FROM goal_kpis WHERE kpi_id = k.id) OR
                 EXISTS (SELECT 1 FROM kpi_measurement_configs WHERE kpi_id = k.id)
         )
       THEN 1 ELSE 0 END AS strategic`,
    )
    .get(id) as { strategic: number };
  return Number(row.strategic) === 1;
}

export function isStrategicCategory(id: number): boolean {
  const row = getDb()
    .prepare(
      `WITH RECURSIVE descendants(id) AS (
         SELECT id FROM kpis WHERE category_id = ?
         UNION
         SELECT child.id
         FROM kpis child
         JOIN descendants parent ON child.parent_id = parent.id
       )
       SELECT CASE WHEN
         EXISTS (SELECT 1 FROM strategic_goals WHERE priority_id = ?) OR
         EXISTS (
           SELECT 1 FROM descendants k
           WHERE
             EXISTS (SELECT 1 FROM goal_kpis membership WHERE membership.kpi_id = k.id) OR
             EXISTS (SELECT 1 FROM kpi_measurement_configs config WHERE config.kpi_id = k.id)
         )
       THEN 1 ELSE 0 END AS strategic`,
    )
    .get(id, id) as { strategic: number };
  return Number(row.strategic) === 1;
}

function previousKpiActiveState(id: number): number {
  const row = getDb()
    .prepare(
      `SELECT previous_value_json
       FROM strategic_audit_events
       WHERE entity_type = 'kpi' AND entity_id = ? AND event_type = 'archive'
       ORDER BY occurred_at DESC, id DESC
       LIMIT 1`,
    )
    .get(id) as { previous_value_json?: string | null } | undefined;
  if (!row?.previous_value_json) return 1;
  try {
    const parsed = JSON.parse(row.previous_value_json) as { is_active?: unknown };
    return Number(parsed.is_active) === 0 ? 0 : 1;
  } catch {
    return 1;
  }
}

export function archiveKPI(id: number, actorId: number | null = null): void {
  transaction(() => {
    const before = rawKpiWithContext(id);
    if (before.archived_at != null) return;
    getDb()
      .prepare(
        `UPDATE kpis
         SET archived_at = datetime('now'), is_active = 0, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(id);
    const after = rawKpiWithContext(id);
    recordStrategicAuditEvent({
      entity_type: "kpi",
      entity_id: id,
      event_type: "archive",
      entity_display_name: String(before.name),
      parent_priority_name: String(before.category_name),
      parent_goal_name: before.goal_name == null ? null : String(before.goal_name),
      previous_value: {
        archived_at: before.archived_at == null ? null : String(before.archived_at),
        is_active: Number(before.is_active),
      },
      new_value: {
        archived_at: after.archived_at == null ? null : String(after.archived_at),
        is_active: Number(after.is_active),
      },
      actor_id: actorId,
      source_reference: "Admin catalog lifecycle",
    });
  });
}

export function restoreKPI(id: number, actorId: number | null = null): void {
  transaction(() => {
    const before = rawKpiWithContext(id);
    if (before.archived_at == null) return;
    getDb()
      .prepare(
        `UPDATE kpis
         SET archived_at = NULL, is_active = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(previousKpiActiveState(id), id);
    const after = rawKpiWithContext(id);
    recordStrategicAuditEvent({
      entity_type: "kpi",
      entity_id: id,
      event_type: "restore",
      entity_display_name: String(before.name),
      parent_priority_name: String(before.category_name),
      parent_goal_name: before.goal_name == null ? null : String(before.goal_name),
      previous_value: {
        archived_at: before.archived_at == null ? null : String(before.archived_at),
        is_active: Number(before.is_active),
      },
      new_value: {
        archived_at: after.archived_at == null ? null : String(after.archived_at),
        is_active: Number(after.is_active),
      },
      actor_id: actorId,
      source_reference: "Admin catalog lifecycle",
    });
  });
}

export function archiveCategory(
  id: number,
  actorId: number | null = null,
): void {
  transaction(() => {
    const before = rawCategory(id);
    if (before.archived_at != null) return;
    getDb()
      .prepare(
        `UPDATE categories
         SET archived_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(id);
    const after = rawCategory(id);
    recordStrategicAuditEvent({
      entity_type: "strategic_priority",
      entity_id: id,
      event_type: "archive",
      entity_display_name: String(before.name),
      parent_priority_name: String(before.name),
      previous_value: {
        archived_at: before.archived_at == null ? null : String(before.archived_at),
      },
      new_value: {
        archived_at: after.archived_at == null ? null : String(after.archived_at),
      },
      actor_id: actorId,
      source_reference: "Admin catalog lifecycle",
    });
  });
}

export function restoreCategory(
  id: number,
  actorId: number | null = null,
): void {
  transaction(() => {
    const before = rawCategory(id);
    if (before.archived_at == null) return;
    getDb()
      .prepare(
        `UPDATE categories
         SET archived_at = NULL, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(id);
    const after = rawCategory(id);
    recordStrategicAuditEvent({
      entity_type: "strategic_priority",
      entity_id: id,
      event_type: "restore",
      entity_display_name: String(before.name),
      parent_priority_name: String(before.name),
      previous_value: {
        archived_at: before.archived_at == null ? null : String(before.archived_at),
      },
      new_value: {
        archived_at: after.archived_at == null ? null : String(after.archived_at),
      },
      actor_id: actorId,
      source_reference: "Admin catalog lifecycle",
    });
  });
}

/** Archive configured strategy rows; retain the legacy hard-delete workflow. */
export function retireOrDeleteKPI(
  id: number,
  actorId: number | null = null,
): CatalogLifecycleResult {
  if (isStrategicKPI(id)) {
    archiveKPI(id, actorId);
    return "archived";
  }
  transaction(() => {
    const tree = rawKpiTreeWithContext(id);
    for (const before of tree) {
      recordLegacyKpiEvent(before, null, "delete", actorId);
    }
    deleteKPI(id);
  });
  return "deleted";
}

/** Archive configured strategic priorities; retain legacy category deletion. */
export function retireOrDeleteCategory(
  id: number,
  actorId: number | null = null,
): CatalogLifecycleResult {
  if (isStrategicCategory(id)) {
    archiveCategory(id, actorId);
    return "archived";
  }
  transaction(() => {
    const before = rawCategory(id);
    const categoryKpis = rawKpisInCategoryWithContext(id);
    for (const kpi of categoryKpis) {
      recordLegacyKpiEvent(kpi, null, "delete", actorId);
    }
    recordLegacyCategoryEvent(before, null, "delete", actorId);
    deleteCategory(id);
  });
  return "deleted";
}
