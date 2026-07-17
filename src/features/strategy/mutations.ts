import {
  STRATEGIC_GOAL_DEFINITIONS,
  STRATEGIC_KPI_DEFINITIONS,
  STRATEGIC_PLAN_SOURCE_REFERENCE,
  type StrategicComponentDefinition,
  type StrategicKpiDefinition,
  type StrategicTargetDefinition,
} from "@/features/catalog";
import { getDb, transaction } from "@/lib/db";
import {
  ComponentInputSchema,
  ConfigurationStatusSchema,
  MeasurementConfigInputSchema,
  StrategicGoalInputSchema,
  StrategicGoalMembershipInputSchema,
  TargetInputSchema,
} from "./validation";
import {
  configurationStatusBeforeArchive,
  recordStrategicAuditEvent,
} from "./audit";
import {
  asComponent,
  asMeasurementConfig,
  asStrategicGoal,
  stableSnapshot,
  type PersistedComponent,
  type PersistedMeasurementConfig,
  type PersistedStrategicGoal,
} from "./records";
import type {
  ConfigurationStatus,
  MeasurementType,
  StrategyJsonValue,
} from "./types";
import {
  assertStrategyEntityArchiveIntegrity,
  assertStrategyEntityRestoreIntegrity,
} from "./configuration-editing";

const PLAN_START_YEAR = 2025;
const PLAN_END_YEAR = 2029;

export class StrategyEntityNotFoundError extends Error {
  constructor(
    public readonly entity: "goal" | "measurement_config" | "component" | "target",
    public readonly id: number,
  ) {
    super(`Strategic ${entity.replaceAll("_", " ")} ${id} was not found.`);
    this.name = "StrategyEntityNotFoundError";
  }
}

export class StrategyConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StrategyConfigurationError";
  }
}

interface ChangeCounts {
  created: number;
  updated: number;
  unchanged: number;
}

interface StrategicConfigurationEnsureResult {
  goals: ChangeCounts;
  measurement_configs: ChangeCounts;
  memberships: ChangeCounts;
  components: ChangeCounts;
  targets: ChangeCounts;
}

type Change = keyof ChangeCounts;

function emptyCounts(): ChangeCounts {
  return { created: 0, updated: 0, unchanged: 0 };
}

function increment(counts: ChangeCounts, change: Change): void {
  counts[change] += 1;
}

function unresolvedQuestionFor(
  status: ConfigurationStatus,
  explicit: string | undefined,
  displayName: string,
  targetDescription?: string,
): string | null {
  if (explicit?.trim()) return explicit.trim();
  if (status !== "needs_definition" && status !== "needs_target") return null;
  if (targetDescription?.trim()) return targetDescription.trim();
  return status === "needs_target"
    ? `Finalize the source target for ${displayName}.`
    : `Define the source measurement configuration for ${displayName}.`;
}

function sameManagedValues(
  row: Record<string, unknown>,
  expected: Record<string, unknown>,
): boolean {
  return Object.entries(expected).every(([key, value]) => {
    const actual = row[key] ?? null;
    const normalizedExpected = value ?? null;
    return actual === normalizedExpected || String(actual) === String(normalizedExpected);
  });
}

function snapshot(
  row: Record<string, unknown>,
  expected: Record<string, unknown>,
): Record<string, StrategyJsonValue> {
  return stableSnapshot(row, Object.keys(expected));
}

interface CatalogContext {
  categories: Map<string, { id: number; slug: string; name: string }>;
  kpis: Map<
    string,
    { id: number; slug: string; name: string; unit: string; category_id: number }
  >;
}

function loadCatalogContext(): CatalogContext {
  const db = getDb();
  const categoryRows = db
    .prepare("SELECT id, slug, name FROM categories")
    .all() as Record<string, unknown>[];
  const kpiRows = db
    .prepare("SELECT id, slug, name, unit, category_id FROM kpis")
    .all() as Record<string, unknown>[];
  const categories = new Map(
    categoryRows.map((row) => [
      String(row.slug),
      { id: Number(row.id), slug: String(row.slug), name: String(row.name) },
    ]),
  );
  const kpis = new Map(
    kpiRows.map((row) => [
      String(row.slug),
      {
        id: Number(row.id),
        slug: String(row.slug),
        name: String(row.name),
        unit: String(row.unit ?? ""),
        category_id: Number(row.category_id),
      },
    ]),
  );
  const missingPriorities = STRATEGIC_GOAL_DEFINITIONS.filter(
    (goal) => !categories.has(goal.priority_slug),
  ).map((goal) => goal.priority_slug);
  const missingKpis = STRATEGIC_KPI_DEFINITIONS.filter(
    (definition) => !kpis.has(definition.kpi_slug),
  ).map((definition) => definition.kpi_slug);
  if (missingPriorities.length || missingKpis.length) {
    throw new StrategyConfigurationError(
      [
        missingPriorities.length
          ? `Missing strategic priorities: ${Array.from(new Set(missingPriorities)).join(", ")}.`
          : "",
        missingKpis.length
          ? `Missing canonical KPIs: ${missingKpis.join(", ")}.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  return { categories, kpis };
}

function readGoalRaw(slug: string): Record<string, unknown> | undefined {
  return getDb().prepare("SELECT * FROM strategic_goals WHERE slug = ?").get(slug) as
    | Record<string, unknown>
    | undefined;
}

function syncGoal(
  definition: (typeof STRATEGIC_GOAL_DEFINITIONS)[number],
  priority: { id: number; name: string },
  actorId: number | null,
): { row: PersistedStrategicGoal; change: Change } {
  const db = getDb();
  const before = readGoalRaw(definition.slug);
  const configuredStatus = definition.configuration_status ?? "active";
  const expected: Record<string, unknown> = {
    priority_id: priority.id,
    name: definition.name,
    description: definition.description,
    plan_start_year: PLAN_START_YEAR,
    plan_end_year: PLAN_END_YEAR,
    completion_rule: "all_required_kpis",
    threshold_count: null,
    threshold_percentage: null,
    manual_status: null,
    board_level_status: "not_reported",
    configuration_status: before?.archived_at ? "archived" : configuredStatus,
    unresolved_question: definition.unresolved_question ?? null,
    source_reference: STRATEGIC_PLAN_SOURCE_REFERENCE,
    sort_order: definition.sort_order,
  };
  StrategicGoalInputSchema.parse({
    priority_id: priority.id,
    slug: definition.slug,
    name: definition.name,
    description: definition.description,
    completion_rule: "all_required_kpis",
    threshold_count: null,
    threshold_percentage: null,
    manual_status: null,
    board_level_status: "not_reported",
    display_order: definition.sort_order,
    effective_start_year: PLAN_START_YEAR,
    effective_end_year: PLAN_END_YEAR,
    configuration_status: configuredStatus,
    unresolved_question: definition.unresolved_question ?? null,
    owner: null,
    due_date: null,
    resolution_notes: null,
    source_reference: STRATEGIC_PLAN_SOURCE_REFERENCE,
    last_reviewed_date: null,
  });

  let change: Change;
  if (!before) {
    db.prepare(
      `INSERT INTO strategic_goals (
         priority_id, slug, name, description, plan_start_year, plan_end_year,
         completion_rule, threshold_count, threshold_percentage, manual_status,
         board_level_status, configuration_status, unresolved_question,
         source_reference, sort_order, created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      priority.id,
      definition.slug,
      definition.name,
      definition.description,
      PLAN_START_YEAR,
      PLAN_END_YEAR,
      "all_required_kpis",
      null,
      null,
      null,
      "not_reported",
      configuredStatus,
      definition.unresolved_question ?? null,
      STRATEGIC_PLAN_SOURCE_REFERENCE,
      definition.sort_order,
      actorId,
      actorId,
    );
    change = "created";
  } else if (!sameManagedValues(before, expected)) {
    db.prepare(
      `UPDATE strategic_goals SET
         priority_id = ?, name = ?, description = ?, plan_start_year = ?,
         plan_end_year = ?, completion_rule = ?, threshold_count = ?,
         threshold_percentage = ?, manual_status = ?, board_level_status = ?,
         configuration_status = ?, unresolved_question = ?, source_reference = ?,
         sort_order = ?, updated_by = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      ...Object.values(expected),
      actorId,
      Number(before.id),
    );
    change = "updated";
  } else {
    change = "unchanged";
  }

  const after = readGoalRaw(definition.slug)!;
  if (change !== "unchanged") {
    recordStrategicAuditEvent({
      entity_type: "strategic_goal",
      entity_id: Number(after.id),
      event_type: change === "created" ? "create" : "update",
      entity_display_name: definition.name,
      parent_priority_name: priority.name,
      previous_value: before ? snapshot(before, expected) : null,
      new_value: snapshot(after, expected),
      actor_id: actorId,
      source_reference: STRATEGIC_PLAN_SOURCE_REFERENCE,
    });
  }
  return {
    row: asStrategicGoal({
      ...after,
      priority_slug: definition.priority_slug,
      priority_name: priority.name,
    }),
    change,
  };
}

function syncConfig(
  definition: StrategicKpiDefinition,
  kpi: { id: number; name: string; unit: string },
  goal: PersistedStrategicGoal,
  actorId: number | null,
): { row: PersistedMeasurementConfig; change: Change } {
  const db = getDb();
  const configuredUnit = (definition.unit ?? kpi.unit) || null;
  const before = db
    .prepare(
      "SELECT * FROM kpi_measurement_configs WHERE kpi_id = ? AND effective_from_year = ?",
    )
    .get(kpi.id, PLAN_START_YEAR) as Record<string, unknown> | undefined;
  const unresolvedQuestion = unresolvedQuestionFor(
    definition.configuration_status,
    definition.unresolved_question,
    kpi.name,
    definition.target_description,
  );
  const expected: Record<string, unknown> = {
    effective_to_year: PLAN_END_YEAR,
    measurement_type: definition.measurement_type,
    unit: configuredUnit,
    numerator_label: definition.numerator_label ?? null,
    denominator_label: definition.denominator_label ?? null,
    fixed_denominator: definition.fixed_denominator ?? null,
    reporting_frequency: definition.reporting_frequency,
    aggregation_method: definition.aggregation_method,
    board_level_status: "not_reported",
    calculation_precision: definition.calculation_precision ?? 1,
    configuration_status: before?.archived_at
      ? "archived"
      : definition.configuration_status,
    unresolved_question: unresolvedQuestion,
    source_reference: STRATEGIC_PLAN_SOURCE_REFERENCE,
  };
  MeasurementConfigInputSchema.parse({
    kpi_id: kpi.id,
    measurement_type: definition.measurement_type,
    unit: configuredUnit,
    numerator_label: definition.numerator_label ?? null,
    denominator_label: definition.denominator_label ?? null,
    fixed_denominator: definition.fixed_denominator ?? null,
    reporting_frequency: definition.reporting_frequency,
    aggregation_method: definition.aggregation_method,
    board_level_status: "not_reported",
    calculation_precision: definition.calculation_precision ?? 1,
    effective_start_year: PLAN_START_YEAR,
    effective_end_year: PLAN_END_YEAR,
    configuration_status: definition.configuration_status,
    unresolved_question: unresolvedQuestion,
    owner: null,
    due_date: null,
    resolution_notes: null,
    source_reference: STRATEGIC_PLAN_SOURCE_REFERENCE,
    last_reviewed_date: null,
  });

  let change: Change;
  if (!before) {
    db.prepare(
      `INSERT INTO kpi_measurement_configs (
         kpi_id, effective_from_year, effective_to_year, measurement_type, unit,
         numerator_label, denominator_label, fixed_denominator,
         reporting_frequency, aggregation_method, board_level_status,
         calculation_precision, configuration_status, unresolved_question,
         source_reference, created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      kpi.id,
      PLAN_START_YEAR,
      ...Object.values(expected),
      actorId,
      actorId,
    );
    change = "created";
  } else if (!sameManagedValues(before, expected)) {
    db.prepare(
      `UPDATE kpi_measurement_configs SET
         effective_to_year = ?, measurement_type = ?, unit = ?,
         numerator_label = ?, denominator_label = ?, fixed_denominator = ?,
         reporting_frequency = ?, aggregation_method = ?, board_level_status = ?,
         calculation_precision = ?, configuration_status = ?, unresolved_question = ?,
         source_reference = ?, updated_by = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(...Object.values(expected), actorId, Number(before.id));
    change = "updated";
  } else {
    change = "unchanged";
  }
  const after = db
    .prepare(
      "SELECT * FROM kpi_measurement_configs WHERE kpi_id = ? AND effective_from_year = ?",
    )
    .get(kpi.id, PLAN_START_YEAR) as Record<string, unknown>;
  if (change !== "unchanged") {
    recordStrategicAuditEvent({
      entity_type: "measurement_config",
      entity_id: Number(after.id),
      event_type: change === "created" ? "create" : "update",
      entity_display_name: `${kpi.name} measurement configuration`,
      parent_priority_name: goal.priority_name,
      parent_goal_name: goal.name,
      previous_value: before ? snapshot(before, expected) : null,
      new_value: snapshot(after, expected),
      actor_id: actorId,
      source_reference: STRATEGIC_PLAN_SOURCE_REFERENCE,
    });
  }
  return { row: asMeasurementConfig(after), change };
}

function syncMembership(
  goal: PersistedStrategicGoal,
  kpi: { id: number; name: string },
  definition: StrategicKpiDefinition,
  displayOrder: number,
  actorId: number | null,
): Change {
  const db = getDb();
  const before = db
    .prepare(
      `SELECT * FROM goal_kpis
       WHERE goal_id = ? AND kpi_id = ? AND effective_from_year = ?`,
    )
    .get(goal.id, kpi.id, PLAN_START_YEAR) as Record<string, unknown> | undefined;
  const expected: Record<string, unknown> = {
    is_required: definition.required === false ? 0 : 1,
    weight: definition.weight ?? 1,
    display_order: displayOrder,
    effective_to_year: PLAN_END_YEAR,
  };
  StrategicGoalMembershipInputSchema.parse({
    goal_id: goal.id,
    kpi_id: kpi.id,
    role: definition.required === false ? "informational" : "required",
    weight: definition.weight ?? 1,
    display_order: displayOrder,
    effective_start_year: PLAN_START_YEAR,
    effective_end_year: PLAN_END_YEAR,
  });
  let change: Change;
  if (!before) {
    db.prepare(
      `INSERT INTO goal_kpis (
         goal_id, kpi_id, is_required, weight, display_order,
         effective_from_year, effective_to_year, created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      goal.id,
      kpi.id,
      expected.is_required,
      expected.weight,
      displayOrder,
      PLAN_START_YEAR,
      PLAN_END_YEAR,
      actorId,
      actorId,
    );
    change = "created";
  } else if (!sameManagedValues(before, expected)) {
    db.prepare(
      `UPDATE goal_kpis SET is_required = ?, weight = ?, display_order = ?,
         effective_to_year = ?, updated_by = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(...Object.values(expected), actorId, Number(before.id));
    change = "updated";
  } else {
    change = "unchanged";
  }
  const after = db
    .prepare(
      `SELECT * FROM goal_kpis
       WHERE goal_id = ? AND kpi_id = ? AND effective_from_year = ?`,
    )
    .get(goal.id, kpi.id, PLAN_START_YEAR) as Record<string, unknown>;
  if (change !== "unchanged") {
    recordStrategicAuditEvent({
      entity_type: "goal_membership",
      entity_id: Number(after.id),
      event_type: change === "created" ? "create" : "update",
      entity_display_name: `${kpi.name} membership`,
      parent_priority_name: goal.priority_name,
      parent_goal_name: goal.name,
      previous_value: before ? snapshot(before, expected) : null,
      new_value: snapshot(after, expected),
      actor_id: actorId,
      source_reference: STRATEGIC_PLAN_SOURCE_REFERENCE,
    });
  }
  return change;
}

function syncComponent(
  definition: StrategicComponentDefinition,
  parentDefinition: StrategicKpiDefinition,
  kpi: { id: number; name: string },
  config: PersistedMeasurementConfig,
  goal: PersistedStrategicGoal,
  displayOrder: number,
  actorId: number | null,
): { row: PersistedComponent; change: Change } {
  const db = getDb();
  const before = db
    .prepare("SELECT * FROM kpi_components WHERE configuration_id = ? AND slug = ?")
    .get(config.id, definition.slug) as Record<string, unknown> | undefined;
  const componentStatus =
    definition.configuration_status ?? parentDefinition.configuration_status;
  const unresolvedQuestion = unresolvedQuestionFor(
    componentStatus,
    definition.unresolved_question ?? parentDefinition.unresolved_question,
    `${kpi.name} — ${definition.label}`,
    definition.targets?.[0]?.target_description ?? parentDefinition.target_description,
  );
  const expected: Record<string, unknown> = {
    configuration_id: config.id,
    label: definition.label,
    measurement_type: definition.measurement_type,
    unit: definition.unit || null,
    numerator_label: definition.numerator_label ?? null,
    denominator_label: definition.denominator_label ?? null,
    fixed_denominator: definition.fixed_denominator ?? null,
    aggregation_role: definition.aggregation_role ?? "value",
    weight: definition.weight ?? 1,
    display_order: displayOrder,
    configuration_status: before?.archived_at ? "archived" : componentStatus,
    unresolved_question: unresolvedQuestion,
  };
  const firstTarget = definition.targets?.[0];
  ComponentInputSchema.parse({
    parent_kpi_id: kpi.id,
    slug: definition.slug,
    label: definition.label,
    measurement_type: definition.measurement_type,
    unit: definition.unit || null,
    numerator_label: definition.numerator_label ?? null,
    denominator_label: definition.denominator_label ?? null,
    fixed_denominator: definition.fixed_denominator ?? null,
    aggregation_role: definition.aggregation_role ?? "value",
    value: null,
    baseline_value: null,
    previous_period_value: null,
    target_value: firstTarget?.target_value ?? null,
    annual_target_value:
      firstTarget?.scope === "annual" ? firstTarget.target_value : null,
    target_year: firstTarget?.target_year ?? null,
    target_description: firstTarget?.target_description ?? null,
    weight: definition.weight ?? 1,
    display_order: displayOrder,
    configuration_status: componentStatus,
    effective_start_year: PLAN_START_YEAR,
    effective_end_year: PLAN_END_YEAR,
  });
  let change: Change;
  if (!before) {
    db.prepare(
      `INSERT INTO kpi_components (
         kpi_id, configuration_id, slug, label, measurement_type, unit,
         numerator_label, denominator_label, fixed_denominator, aggregation_role, weight,
         display_order, configuration_status, unresolved_question,
         created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      kpi.id,
      config.id,
      definition.slug,
      definition.label,
      definition.measurement_type,
      definition.unit || null,
      definition.numerator_label ?? null,
      definition.denominator_label ?? null,
      definition.fixed_denominator ?? null,
      definition.aggregation_role ?? "value",
      definition.weight ?? 1,
      displayOrder,
      componentStatus,
      unresolvedQuestion,
      actorId,
      actorId,
    );
    change = "created";
  } else if (!sameManagedValues(before, expected)) {
    db.prepare(
      `UPDATE kpi_components SET configuration_id = ?, label = ?,
         measurement_type = ?, unit = ?, numerator_label = ?, denominator_label = ?,
         fixed_denominator = ?, aggregation_role = ?, weight = ?, display_order = ?, configuration_status = ?,
         unresolved_question = ?, updated_by = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(...Object.values(expected), actorId, Number(before.id));
    change = "updated";
  } else {
    change = "unchanged";
  }
  const after = db
    .prepare("SELECT * FROM kpi_components WHERE configuration_id = ? AND slug = ?")
    .get(config.id, definition.slug) as Record<string, unknown>;
  if (change !== "unchanged") {
    recordStrategicAuditEvent({
      entity_type: "component",
      entity_id: Number(after.id),
      event_type: change === "created" ? "create" : "update",
      entity_display_name: definition.label,
      parent_priority_name: goal.priority_name,
      parent_goal_name: goal.name,
      previous_value: before ? snapshot(before, expected) : null,
      new_value: snapshot(after, expected),
      actor_id: actorId,
      source_reference: STRATEGIC_PLAN_SOURCE_REFERENCE,
    });
  }
  return { row: asComponent(after), change };
}

function targetLookup(
  subject: { kpiId?: number; componentId?: number },
  target: StrategicTargetDefinition,
): Record<string, unknown> | undefined {
  const subjectColumn = subject.kpiId === undefined ? "component_id" : "kpi_id";
  const subjectId = subject.kpiId ?? subject.componentId!;
  return getDb()
    .prepare(
      `SELECT * FROM kpi_targets
       WHERE ${subjectColumn} = ? AND target_scope = ?
         AND COALESCE(reporting_year, -1) = COALESCE(?, -1)
         AND target_year = ?`,
    )
    .get(subjectId, target.scope, target.reporting_year ?? null, target.target_year) as
    | Record<string, unknown>
    | undefined;
}

function syncTarget(
  subject: { kpiId?: number; componentId?: number; measurementType: MeasurementType },
  definition: StrategicTargetDefinition,
  displayName: string,
  goal: PersistedStrategicGoal,
  actorId: number | null,
): Change {
  const db = getDb();
  const before = targetLookup(subject, definition);
  const structuredJson = definition.structured_target
    ? JSON.stringify(definition.structured_target)
    : null;
  const expected: Record<string, unknown> = {
    target_value: definition.target_value,
    structured_target_json: structuredJson,
    target_description: definition.target_description,
    external_target_year: 0,
    configuration_status: before?.archived_at
      ? "archived"
      : definition.configuration_status,
    source_reference: STRATEGIC_PLAN_SOURCE_REFERENCE,
  };
  // The qualitative recognition target is intentionally explicit but numeric-null.
  // Other targets pass the complete measurement-aware schema.
  if (definition.target_value !== null || subject.measurementType === "binary") {
    TargetInputSchema.parse({
      kpi_id: subject.kpiId ?? 1,
      component_id: subject.componentId ?? null,
      measurement_type: subject.measurementType,
      scope: definition.scope,
      target_value: definition.target_value,
      target_description: definition.target_description,
      target_year: definition.target_year,
      is_external_target: false,
      effective_start_year: PLAN_START_YEAR,
      effective_end_year: PLAN_END_YEAR,
    });
  } else if (!definition.target_description.trim()) {
    throw new StrategyConfigurationError(
      `Qualitative target for ${displayName} requires a description.`,
    );
  }
  let change: Change;
  if (!before) {
    db.prepare(
      `INSERT INTO kpi_targets (
         kpi_id, component_id, target_scope, reporting_year, target_year,
         external_target_year, target_value, structured_target_json,
         target_description, configuration_status, source_reference,
         created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      subject.kpiId ?? null,
      subject.componentId ?? null,
      definition.scope,
      definition.reporting_year ?? null,
      definition.target_year,
      0,
      definition.target_value,
      structuredJson,
      definition.target_description,
      definition.configuration_status,
      STRATEGIC_PLAN_SOURCE_REFERENCE,
      actorId,
      actorId,
    );
    change = "created";
  } else if (!sameManagedValues(before, expected)) {
    db.prepare(
      `UPDATE kpi_targets SET target_value = ?, structured_target_json = ?,
         target_description = ?, external_target_year = ?, configuration_status = ?,
         source_reference = ?, updated_by = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(...Object.values(expected), actorId, Number(before.id));
    change = "updated";
  } else {
    change = "unchanged";
  }
  const after = targetLookup(subject, definition)!;
  if (change !== "unchanged") {
    recordStrategicAuditEvent({
      entity_type: "target",
      entity_id: Number(after.id),
      event_type: change === "created" ? "create" : "update",
      entity_display_name: `${displayName} — ${definition.target_description}`,
      parent_priority_name: goal.priority_name,
      parent_goal_name: goal.name,
      previous_value: before ? snapshot(before, expected) : null,
      new_value: snapshot(after, expected),
      actor_id: actorId,
      source_reference: STRATEGIC_PLAN_SOURCE_REFERENCE,
    });
  }
  return change;
}

/**
 * Backfill the canonical strategic configuration by stable slug. The operation
 * is additive and idempotent: it never deletes legacy or extra strategic rows,
 * and a no-op rerun writes neither timestamps nor audit events.
 */
export function ensureStrategicPlanConfiguration(
  actorId: number | null = null,
): StrategicConfigurationEnsureResult {
  return transaction(() => {
    const context = loadCatalogContext();
    const result: StrategicConfigurationEnsureResult = {
      goals: emptyCounts(),
      measurement_configs: emptyCounts(),
      memberships: emptyCounts(),
      components: emptyCounts(),
      targets: emptyCounts(),
    };
    const goals = new Map<string, PersistedStrategicGoal>();
    for (const definition of STRATEGIC_GOAL_DEFINITIONS) {
      const priority = context.categories.get(definition.priority_slug)!;
      const synced = syncGoal(definition, priority, actorId);
      goals.set(definition.slug, synced.row);
      increment(result.goals, synced.change);
    }
    const memberOrder = new Map<string, number>();
    for (const definition of STRATEGIC_KPI_DEFINITIONS) {
      const goal = goals.get(definition.goal_slug);
      const kpi = context.kpis.get(definition.kpi_slug);
      if (!goal || !kpi) {
        throw new StrategyConfigurationError(
          `Could not resolve ${definition.kpi_slug} → ${definition.goal_slug}.`,
        );
      }
      const config = syncConfig(definition, kpi, goal, actorId);
      increment(result.measurement_configs, config.change);
      const displayOrder = memberOrder.get(goal.slug) ?? 0;
      memberOrder.set(goal.slug, displayOrder + 1);
      increment(
        result.memberships,
        syncMembership(goal, kpi, definition, displayOrder, actorId),
      );
      for (const target of definition.targets ?? []) {
        increment(
          result.targets,
          syncTarget(
            { kpiId: kpi.id, measurementType: definition.measurement_type },
            target,
            kpi.name,
            goal,
            actorId,
          ),
        );
      }
      for (const [index, componentDefinition] of (
        definition.components ?? []
      ).entries()) {
        const component = syncComponent(
          componentDefinition,
          definition,
          kpi,
          config.row,
          goal,
          index,
          actorId,
        );
        increment(result.components, component.change);
        for (const target of componentDefinition.targets ?? []) {
          increment(
            result.targets,
            syncTarget(
              {
                componentId: component.row.id,
                measurementType: componentDefinition.measurement_type,
              },
              target,
              componentDefinition.label,
              goal,
              actorId,
            ),
          );
        }
      }
    }
    return result;
  });
}

type ArchivableKind = "goal" | "measurement_config" | "component" | "target";

const ARCHIVABLE = {
  goal: { table: "strategic_goals", entityType: "strategic_goal" },
  measurement_config: {
    table: "kpi_measurement_configs",
    entityType: "measurement_config",
  },
  component: { table: "kpi_components", entityType: "component" },
  target: { table: "kpi_targets", entityType: "target" },
} as const;

function archivableContext(kind: ArchivableKind, row: Record<string, unknown>) {
  const db = getDb();
  if (kind === "goal") {
    const priority = db
      .prepare("SELECT name FROM categories WHERE id = ?")
      .get(Number(row.priority_id)) as { name?: string } | undefined;
    return {
      displayName: String(row.name),
      priorityName: priority?.name ?? null,
      goalName: String(row.name),
    };
  }
  let kpiId: number;
  if (kind === "measurement_config" || kind === "component") {
    kpiId = Number(row.kpi_id);
  } else if (row.kpi_id != null) {
    kpiId = Number(row.kpi_id);
  } else {
    const component = db
      .prepare("SELECT kpi_id FROM kpi_components WHERE id = ?")
      .get(Number(row.component_id)) as { kpi_id?: number } | undefined;
    kpiId = Number(component?.kpi_id);
  }
  const context = db
    .prepare(
      `SELECT k.name AS kpi_name, c.name AS priority_name, g.name AS goal_name
       FROM kpis k
       JOIN categories c ON c.id = k.category_id
       LEFT JOIN goal_kpis membership ON membership.kpi_id = k.id
         AND membership.archived_at IS NULL
       LEFT JOIN strategic_goals g ON g.id = membership.goal_id
       WHERE k.id = ?
       ORDER BY membership.effective_from_year DESC
       LIMIT 1`,
    )
    .get(kpiId) as
    | { kpi_name?: string; priority_name?: string; goal_name?: string }
    | undefined;
  return {
    displayName:
      kind === "component"
        ? String(row.label)
        : kind === "target"
          ? String(row.target_description ?? `${context?.kpi_name ?? "KPI"} target`)
          : `${context?.kpi_name ?? "KPI"} measurement configuration`,
    priorityName: context?.priority_name ?? null,
    goalName: context?.goal_name ?? null,
  };
}

function setArchived(
  kind: ArchivableKind,
  id: number,
  archived: boolean,
  actorId: number | null,
): void {
  transaction(() => {
    const descriptor = ARCHIVABLE[kind];
    const db = getDb();
    const before = db.prepare(`SELECT * FROM ${descriptor.table} WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    if (!before) throw new StrategyEntityNotFoundError(kind, id);
    const already = before.archived_at != null;
    if (already === archived) return;
    const context = archivableContext(kind, before);
    const restoredStatus = archived
      ? "archived"
      : (configurationStatusBeforeArchive(descriptor.entityType, id) ?? "draft");
    if (archived && (kind === "component" || kind === "target")) {
      assertStrategyEntityArchiveIntegrity(kind, id);
    }
    if (
      !archived &&
      (kind === "measurement_config" || kind === "component" || kind === "target")
    ) {
      assertStrategyEntityRestoreIntegrity(kind, id, restoredStatus);
    }
    db.prepare(
      `UPDATE ${descriptor.table}
       SET archived_at = ${archived ? "datetime('now')" : "NULL"},
           configuration_status = ?, updated_by = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(restoredStatus, actorId, id);
    const after = db.prepare(`SELECT * FROM ${descriptor.table} WHERE id = ?`).get(id) as
      Record<string, unknown>;
    const fields = ["configuration_status", "archived_at"] as const;
    recordStrategicAuditEvent({
      entity_type: descriptor.entityType,
      entity_id: id,
      event_type: archived ? "archive" : "restore",
      entity_display_name: context.displayName,
      parent_priority_name: context.priorityName,
      parent_goal_name: context.goalName,
      previous_value: stableSnapshot(before, fields),
      new_value: stableSnapshot(after, fields),
      actor_id: actorId,
      source_reference: STRATEGIC_PLAN_SOURCE_REFERENCE,
    });
  });
}

export function archiveStrategicGoal(id: number, actorId: number | null = null): void {
  setArchived("goal", id, true, actorId);
}
export function restoreStrategicGoal(id: number, actorId: number | null = null): void {
  setArchived("goal", id, false, actorId);
}
export function archiveMeasurementConfig(id: number, actorId: number | null = null): void {
  setArchived("measurement_config", id, true, actorId);
}
export function restoreMeasurementConfig(id: number, actorId: number | null = null): void {
  setArchived("measurement_config", id, false, actorId);
}
export function archiveComponent(id: number, actorId: number | null = null): void {
  setArchived("component", id, true, actorId);
}
export function restoreComponent(id: number, actorId: number | null = null): void {
  setArchived("component", id, false, actorId);
}
export function archiveTarget(id: number, actorId: number | null = null): void {
  setArchived("target", id, true, actorId);
}
export function restoreTarget(id: number, actorId: number | null = null): void {
  setArchived("target", id, false, actorId);
}

function updateConfigurationStatus(
  kind: ArchivableKind,
  id: number,
  status: ConfigurationStatus,
  actorId: number | null,
): void {
  ConfigurationStatusSchema.parse(status);
  if (status === "archived") {
    setArchived(kind, id, true, actorId);
    return;
  }
  transaction(() => {
    const descriptor = ARCHIVABLE[kind];
    const db = getDb();
    const before = db.prepare(`SELECT * FROM ${descriptor.table} WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    if (!before) throw new StrategyEntityNotFoundError(kind, id);
    if (before.archived_at != null) {
      throw new StrategyConfigurationError(
        `Restore strategic ${kind.replaceAll("_", " ")} ${id} before changing its status.`,
      );
    }
    if (before.configuration_status === status) return;
    const context = archivableContext(kind, before);
    db.prepare(
      `UPDATE ${descriptor.table}
       SET configuration_status = ?, updated_by = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(status, actorId, id);
    recordStrategicAuditEvent({
      entity_type: descriptor.entityType,
      entity_id: id,
      event_type: "status_change",
      entity_display_name: context.displayName,
      parent_priority_name: context.priorityName,
      parent_goal_name: context.goalName,
      previous_value: { configuration_status: String(before.configuration_status) },
      new_value: { configuration_status: status },
      actor_id: actorId,
      source_reference: STRATEGIC_PLAN_SOURCE_REFERENCE,
    });
  });
}

export function updateMeasurementConfigurationStatus(
  id: number,
  status: ConfigurationStatus,
  actorId: number | null = null,
): void {
  updateConfigurationStatus("measurement_config", id, status, actorId);
}
