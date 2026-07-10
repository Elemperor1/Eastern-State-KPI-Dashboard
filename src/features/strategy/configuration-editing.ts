import { z } from "zod";
import { getDb, transaction } from "@/lib/db";
import { recordStrategicAuditEvent } from "./audit";
import {
  asComponent,
  asGoalMembership,
  asMeasurementConfig,
  asStrategicGoal,
  asTarget,
  stableSnapshot,
  type PersistedComponent,
  type PersistedGoalMembership,
  type PersistedMeasurementConfig,
  type PersistedStrategicGoal,
  type PersistedTarget,
} from "./records";
import type { MeasurementType, StrategyJsonValue } from "./types";
import {
  ComponentInputSchema,
  MeasurementConfigInputSchema,
  MeasurementConfigurationCreateSchema,
  MeasurementConfigurationUpdateSchema,
  StrategicGoalInputSchema,
  StrategicGoalMembershipInputSchema,
  StrategicGoalMembershipUpdateSchema,
  StrategicGoalSettingsUpdateSchema,
  StrategicTargetCreateSchema,
  StrategicTargetUpdateSchema,
  StrategyComponentCreateSchema,
  StrategyComponentReorderSchema,
  StrategyComponentUpdateSchema,
  type ValidatedMeasurementConfigurationCreate,
  type ValidatedMeasurementConfigurationUpdate,
  type ValidatedStrategicTargetCreate,
  type ValidatedStrategicTargetUpdate,
  type ValidatedStrategyComponentUpdate,
} from "./validation";

export interface StrategyEditIssue {
  path: string;
  message: string;
}

export class StrategyEditValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: StrategyEditIssue[] = [],
  ) {
    super(message);
    this.name = "StrategyEditValidationError";
  }
}

export class StrategyEditConflictError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "StrategyEditConflictError";
  }
}

export class StrategyEditNotFoundError extends Error {
  constructor(
    public readonly entity:
      | "kpi"
      | "strategic_goal"
      | "goal_membership"
      | "measurement_config"
      | "component"
      | "target",
    public readonly id: number,
  ) {
    super(`${entity.replaceAll("_", " ")} ${id} was not found.`);
    this.name = "StrategyEditNotFoundError";
  }
}

type RawRow = Record<string, unknown>;

interface AuditContext {
  kpi_name: string;
  priority_name: string | null;
  goal_name: string | null;
}

interface TargetSubject {
  kpi_id: number | null;
  component_id: number | null;
  effective_kpi_id: number;
  measurement_type: MeasurementType;
  archived: boolean;
}

function issues(error: z.ZodError): StrategyEditIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function parse<Schema extends z.ZodTypeAny>(
  schema: Schema,
  value: unknown,
  message: string,
): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new StrategyEditValidationError(message, issues(result.error));
  }
  return result.data;
}

function same(left: unknown, right: unknown): boolean {
  const normalize = (value: unknown) => (value === undefined ? null : value);
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function rowChanged(
  before: RawRow,
  values: Record<string, unknown>,
): boolean {
  return Object.entries(values).some(([field, value]) => !same(before[field], value));
}

function auditContextForKpi(kpiId: number): AuditContext {
  const row = getDb()
    .prepare(
      `SELECT k.name AS kpi_name, category.name AS priority_name,
              goal.name AS goal_name
       FROM kpis k
       JOIN categories category ON category.id = k.category_id
       LEFT JOIN goal_kpis membership ON membership.kpi_id = k.id
         AND membership.archived_at IS NULL
       LEFT JOIN strategic_goals goal ON goal.id = membership.goal_id
         AND goal.archived_at IS NULL
       WHERE k.id = ?
       ORDER BY membership.effective_from_year DESC, membership.id DESC
       LIMIT 1`,
    )
    .get(kpiId) as
    | { kpi_name: string; priority_name: string; goal_name: string | null }
    | undefined;
  if (!row) throw new StrategyEditNotFoundError("kpi", kpiId);
  return row;
}

function rawConfiguration(id: number): RawRow {
  const row = getDb()
    .prepare("SELECT * FROM kpi_measurement_configs WHERE id = ?")
    .get(id) as RawRow | undefined;
  if (!row) throw new StrategyEditNotFoundError("measurement_config", id);
  return row;
}

function rawGoal(id: number): RawRow {
  const row = getDb()
    .prepare(
      `SELECT goal.*, category.slug AS priority_slug,
              category.name AS priority_name
       FROM strategic_goals goal
       JOIN categories category ON category.id = goal.priority_id
       WHERE goal.id = ?`,
    )
    .get(id) as RawRow | undefined;
  if (!row) throw new StrategyEditNotFoundError("strategic_goal", id);
  return row;
}

function rawGoalMembership(id: number): RawRow {
  const row = getDb()
    .prepare(
      `SELECT membership.*,
              kpi.name AS kpi_name, kpi.archived_at AS kpi_archived_at,
              goal.name AS goal_name, goal.archived_at AS goal_archived_at,
              goal.source_reference AS goal_source_reference,
              category.name AS priority_name,
              category.archived_at AS priority_archived_at
       FROM goal_kpis membership
       JOIN kpis kpi ON kpi.id = membership.kpi_id
       JOIN categories category ON category.id = kpi.category_id
       JOIN strategic_goals goal ON goal.id = membership.goal_id
       WHERE membership.id = ?`,
    )
    .get(id) as RawRow | undefined;
  if (!row) throw new StrategyEditNotFoundError("goal_membership", id);
  return row;
}

function rawComponent(id: number): RawRow {
  const row = getDb()
    .prepare("SELECT * FROM kpi_components WHERE id = ?")
    .get(id) as RawRow | undefined;
  if (!row) throw new StrategyEditNotFoundError("component", id);
  return row;
}

function rawTarget(id: number): RawRow {
  const row = getDb()
    .prepare("SELECT * FROM kpi_targets WHERE id = ?")
    .get(id) as RawRow | undefined;
  if (!row) throw new StrategyEditNotFoundError("target", id);
  return row;
}

function requireEditable(row: RawRow, entity: string): void {
  if (row.archived_at != null || row.configuration_status === "archived") {
    throw new StrategyEditConflictError(
      `Restore ${entity} ${String(row.id)} before editing it.`,
      "archived_entity",
    );
  }
}

function ensureNoConfigurationOverlap(
  kpiId: number,
  startYear: number,
  endYear: number | null,
  excludingId: number | null,
): void {
  const overlap = getDb()
    .prepare(
      `SELECT id FROM kpi_measurement_configs
       WHERE kpi_id = ?
         AND (? IS NULL OR id <> ?)
         AND effective_from_year <= ?
         AND (effective_to_year IS NULL OR effective_to_year >= ?)
       LIMIT 1`,
    )
    .get(kpiId, excludingId, excludingId, endYear ?? 2100, startYear) as
    | { id: number }
    | undefined;
  if (overlap) {
    throw new StrategyEditConflictError(
      `Measurement configuration overlaps configuration ${overlap.id}.`,
      "effective_range_overlap",
    );
  }
}

function ensureConfigurationHistoryFits(
  id: number,
  startYear: number,
  endYear: number | null,
): void {
  const row = getDb()
    .prepare(
      `SELECT MIN(year) AS min_year, MAX(year) AS max_year
       FROM kpi_observations WHERE configuration_id = ?`,
    )
    .get(id) as { min_year: number | null; max_year: number | null };
  if (
    row.min_year !== null &&
    (row.min_year < startYear || (endYear !== null && row.max_year! > endYear))
  ) {
    throw new StrategyEditConflictError(
      "The effective-year change would orphan historical observations.",
      "observation_year_conflict",
    );
  }
}

const CONFIG_FIELDS = [
  "effective_from_year",
  "effective_to_year",
  "measurement_type",
  "unit",
  "numerator_label",
  "denominator_label",
  "fixed_denominator",
  "baseline_value",
  "reporting_frequency",
  "aggregation_method",
  "board_level_status",
  "calculation_precision",
  "configuration_status",
  "unresolved_question",
  "owner",
  "due_date",
  "resolution_notes",
  "source_reference",
  "last_reviewed_date",
  "allow_score_over_max",
] as const;

function configurationValues(
  input: ValidatedMeasurementConfigurationCreate,
): Record<(typeof CONFIG_FIELDS)[number], unknown> {
  return {
    effective_from_year: input.effective_start_year,
    effective_to_year: input.effective_end_year,
    measurement_type: input.measurement_type,
    unit: input.unit,
    numerator_label: input.numerator_label,
    denominator_label: input.denominator_label,
    fixed_denominator: input.fixed_denominator,
    baseline_value: input.baseline_value,
    reporting_frequency: input.reporting_frequency,
    aggregation_method: input.aggregation_method,
    board_level_status: input.board_level_status,
    calculation_precision: input.calculation_precision,
    configuration_status: input.configuration_status,
    unresolved_question: input.unresolved_question,
    owner: input.owner,
    due_date: input.due_date,
    resolution_notes: input.resolution_notes,
    source_reference: input.source_reference,
    last_reviewed_date: input.last_reviewed_date,
    allow_score_over_max: input.allow_score_over_max ? 1 : 0,
  };
}

function validateConfigurationTransition(
  before: RawRow | null,
  input: ValidatedMeasurementConfigurationCreate,
): void {
  if (!before || before.measurement_type === input.measurement_type) return;
  const counts = getDb()
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM kpi_observations WHERE configuration_id = ?) AS observations,
         (SELECT COUNT(*) FROM kpi_components WHERE configuration_id = ?) AS components`,
    )
    .get(Number(before.id), Number(before.id)) as {
    observations: number;
    components: number;
  };
  if (counts.observations > 0 || counts.components > 0) {
    throw new StrategyEditConflictError(
      "Measurement type cannot change after observations or components exist.",
      "measurement_history_conflict",
    );
  }
}

export function createMeasurementConfiguration(
  input: unknown,
  actorId: number | null = null,
): PersistedMeasurementConfig {
  const parsed = parse(
    MeasurementConfigurationCreateSchema,
    input,
    "Invalid measurement configuration.",
  );
  if (parsed.configuration_status === "archived") {
    throw new StrategyEditValidationError("Invalid measurement configuration.", [
      {
        path: "configuration_status",
        message: "Create the configuration first, then use the archive lifecycle action.",
      },
    ]);
  }
  return transaction(() => {
    const context = auditContextForKpi(parsed.kpi_id);
    ensureNoConfigurationOverlap(
      parsed.kpi_id,
      parsed.effective_start_year,
      parsed.effective_end_year,
      null,
    );
    const values = configurationValues(parsed);
    const result = getDb()
      .prepare(
        `INSERT INTO kpi_measurement_configs (
           kpi_id, ${CONFIG_FIELDS.join(", ")}, created_by, updated_by
         ) VALUES (?, ${CONFIG_FIELDS.map(() => "?").join(", ")}, ?, ?)`,
      )
      .run(parsed.kpi_id, ...Object.values(values), actorId, actorId);
    const row = rawConfiguration(Number(result.lastInsertRowid));
    recordStrategicAuditEvent({
      entity_type: "measurement_config",
      entity_id: Number(row.id),
      event_type: "create",
      entity_display_name: `${context.kpi_name} measurement configuration`,
      parent_priority_name: context.priority_name,
      parent_goal_name: context.goal_name,
      previous_value: null,
      new_value: stableSnapshot(row, CONFIG_FIELDS),
      actor_id: actorId,
      source_reference: parsed.source_reference,
    });
    return asMeasurementConfig(row);
  });
}

function mergedConfiguration(
  row: RawRow,
  patch: ValidatedMeasurementConfigurationUpdate,
): ValidatedMeasurementConfigurationCreate {
  return parse(
    MeasurementConfigInputSchema,
    {
      kpi_id: Number(row.kpi_id),
      measurement_type: patch.measurement_type ?? row.measurement_type,
      unit: patch.unit === undefined ? row.unit ?? null : patch.unit,
      numerator_label:
        patch.numerator_label === undefined
          ? row.numerator_label ?? null
          : patch.numerator_label,
      denominator_label:
        patch.denominator_label === undefined
          ? row.denominator_label ?? null
          : patch.denominator_label,
      fixed_denominator:
        patch.fixed_denominator === undefined
          ? row.fixed_denominator ?? null
          : patch.fixed_denominator,
      baseline_value:
        patch.baseline_value === undefined
          ? row.baseline_value ?? null
          : patch.baseline_value,
      reporting_frequency: patch.reporting_frequency ?? row.reporting_frequency,
      aggregation_method: patch.aggregation_method ?? row.aggregation_method,
      board_level_status: patch.board_level_status ?? row.board_level_status,
      calculation_precision:
        patch.calculation_precision ?? Number(row.calculation_precision),
      allow_score_over_max:
        patch.allow_score_over_max ?? Number(row.allow_score_over_max) === 1,
      effective_start_year:
        patch.effective_start_year ?? Number(row.effective_from_year),
      effective_end_year:
        patch.effective_end_year === undefined
          ? row.effective_to_year == null
            ? null
            : Number(row.effective_to_year)
          : patch.effective_end_year,
      configuration_status:
        patch.configuration_status ?? row.configuration_status,
      unresolved_question:
        patch.unresolved_question === undefined
          ? row.unresolved_question ?? null
          : patch.unresolved_question,
      owner: patch.owner === undefined ? row.owner ?? null : patch.owner,
      due_date:
        patch.due_date === undefined ? row.due_date ?? null : patch.due_date,
      resolution_notes:
        patch.resolution_notes === undefined
          ? row.resolution_notes ?? null
          : patch.resolution_notes,
      source_reference:
        patch.source_reference === undefined
          ? row.source_reference ?? null
          : patch.source_reference,
      last_reviewed_date:
        patch.last_reviewed_date === undefined
          ? row.last_reviewed_date ?? null
          : patch.last_reviewed_date,
    },
    "Invalid measurement configuration.",
  );
}

export function updateMeasurementConfiguration(
  input: unknown,
  actorId: number | null = null,
): PersistedMeasurementConfig {
  const patch = parse(
    MeasurementConfigurationUpdateSchema,
    input,
    "Invalid measurement configuration update.",
  );
  return transaction(() => {
    const before = rawConfiguration(patch.id);
    requireEditable(before, "measurement configuration");
    const merged = mergedConfiguration(before, patch);
    validateConfigurationTransition(before, merged);
    ensureNoConfigurationOverlap(
      Number(before.kpi_id),
      merged.effective_start_year,
      merged.effective_end_year,
      patch.id,
    );
    ensureConfigurationHistoryFits(
      patch.id,
      merged.effective_start_year,
      merged.effective_end_year,
    );
    const values = configurationValues(merged);
    if (!rowChanged(before, values)) return asMeasurementConfig(before);
    getDb()
      .prepare(
        `UPDATE kpi_measurement_configs SET
           ${CONFIG_FIELDS.map((field) => `${field} = ?`).join(", ")},
           updated_by = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(...Object.values(values), actorId, patch.id);
    const after = rawConfiguration(patch.id);
    const context = auditContextForKpi(Number(before.kpi_id));
    const onlyStatus = Object.keys(patch).every((key) =>
      ["id", "configuration_status", "unresolved_question", "owner", "due_date", "resolution_notes", "last_reviewed_date"].includes(key),
    );
    recordStrategicAuditEvent({
      entity_type: "measurement_config",
      entity_id: patch.id,
      event_type: onlyStatus ? "status_change" : "update",
      entity_display_name: `${context.kpi_name} measurement configuration`,
      parent_priority_name: context.priority_name,
      parent_goal_name: context.goal_name,
      previous_value: stableSnapshot(before, CONFIG_FIELDS),
      new_value: stableSnapshot(after, CONFIG_FIELDS),
      actor_id: actorId,
      source_reference: String(after.source_reference ?? "") || null,
    });
    return asMeasurementConfig(after);
  });
}

const GOAL_SETTING_FIELDS = [
  "completion_rule",
  "threshold_count",
  "threshold_percentage",
  "manual_status",
  "board_level_status",
  "configuration_status",
  "unresolved_question",
  "owner",
  "due_date",
  "resolution_notes",
  "source_reference",
  "last_reviewed_date",
] as const;

export function updateStrategicGoalSettings(
  input: unknown,
  actorId: number | null = null,
): PersistedStrategicGoal {
  const patch = parse(
    StrategicGoalSettingsUpdateSchema,
    input,
    "Invalid strategic goal update.",
  );
  return transaction(() => {
    const before = rawGoal(patch.id);
    requireEditable(before, "strategic goal");
    const merged = parse(
      StrategicGoalInputSchema,
      {
        priority_id: Number(before.priority_id),
        slug: String(before.slug),
        name: String(before.name),
        description: before.description ?? null,
        completion_rule: patch.completion_rule ?? before.completion_rule,
        threshold_count:
          patch.threshold_count === undefined
            ? before.threshold_count ?? null
            : patch.threshold_count,
        threshold_percentage:
          patch.threshold_percentage === undefined
            ? before.threshold_percentage ?? null
            : patch.threshold_percentage,
        manual_status:
          patch.manual_status === undefined
            ? before.manual_status ?? null
            : patch.manual_status,
        board_level_status: patch.board_level_status ?? before.board_level_status,
        display_order: Number(before.sort_order),
        effective_start_year: Number(before.plan_start_year),
        effective_end_year: Number(before.plan_end_year),
        configuration_status:
          patch.configuration_status ?? before.configuration_status,
        unresolved_question:
          patch.unresolved_question === undefined
            ? before.unresolved_question ?? null
            : patch.unresolved_question,
        owner: patch.owner === undefined ? before.owner ?? null : patch.owner,
        due_date:
          patch.due_date === undefined ? before.due_date ?? null : patch.due_date,
        resolution_notes:
          patch.resolution_notes === undefined
            ? before.resolution_notes ?? null
            : patch.resolution_notes,
        source_reference:
          patch.source_reference === undefined
            ? before.source_reference ?? null
            : patch.source_reference,
        last_reviewed_date:
          patch.last_reviewed_date === undefined
            ? before.last_reviewed_date ?? null
            : patch.last_reviewed_date,
      },
      "Invalid strategic goal update.",
    );
    const values: Record<string, unknown> = {
      completion_rule: merged.completion_rule,
      threshold_count: merged.threshold_count,
      threshold_percentage: merged.threshold_percentage,
      manual_status: merged.manual_status,
      board_level_status: merged.board_level_status,
      configuration_status: merged.configuration_status,
      unresolved_question: merged.unresolved_question,
      owner: merged.owner,
      due_date: merged.due_date,
      resolution_notes: merged.resolution_notes,
      source_reference: merged.source_reference,
      last_reviewed_date: merged.last_reviewed_date,
    };
    if (!rowChanged(before, values)) return asStrategicGoal(before);
    getDb()
      .prepare(
        `UPDATE strategic_goals SET
           ${GOAL_SETTING_FIELDS.map((field) => `${field} = ?`).join(", ")},
           updated_by = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(...Object.values(values), actorId, patch.id);
    const after = rawGoal(patch.id);
    const onlyStatus = Object.keys(patch).every((key) =>
      ["id", "manual_status", "board_level_status", "configuration_status", "unresolved_question", "owner", "due_date", "resolution_notes", "last_reviewed_date"].includes(key),
    );
    recordStrategicAuditEvent({
      entity_type: "strategic_goal",
      entity_id: patch.id,
      event_type: onlyStatus ? "status_change" : "update",
      entity_display_name: String(after.name),
      parent_priority_name: String(after.priority_name),
      parent_goal_name: String(after.name),
      previous_value: stableSnapshot(before, GOAL_SETTING_FIELDS),
      new_value: stableSnapshot(after, GOAL_SETTING_FIELDS),
      actor_id: actorId,
      source_reference: String(after.source_reference ?? "") || null,
    });
    return asStrategicGoal(after);
  });
}

const GOAL_MEMBERSHIP_SETTING_FIELDS = [
  "is_required",
  "weight",
  "display_order",
] as const;

/**
 * Update an existing goal membership without changing its identity or
 * effective-year range. Keeping those historical boundaries immutable here
 * prevents a routine role/weight edit from silently rewriting prior reports.
 */
export function updateStrategicGoalMembership(
  input: unknown,
  actorId: number | null = null,
): PersistedGoalMembership {
  const patch = parse(
    StrategicGoalMembershipUpdateSchema,
    input,
    "Invalid strategic goal membership update.",
  );
  return transaction(() => {
    const before = rawGoalMembership(patch.id);
    if (
      before.archived_at != null ||
      before.goal_archived_at != null ||
      before.kpi_archived_at != null ||
      before.priority_archived_at != null
    ) {
      throw new StrategyEditConflictError(
        "Restore the membership and its strategic-plan parents before editing it.",
        "archived_membership_context",
      );
    }

    const merged = parse(
      StrategicGoalMembershipInputSchema,
      {
        goal_id: Number(before.goal_id),
        kpi_id: Number(before.kpi_id),
        role:
          patch.role ??
          (Number(before.is_required) === 1 ? "required" : "informational"),
        weight: patch.weight ?? Number(before.weight),
        display_order: patch.display_order ?? Number(before.display_order),
        effective_start_year: Number(before.effective_from_year),
        effective_end_year:
          before.effective_to_year == null
            ? null
            : Number(before.effective_to_year),
      },
      "Invalid strategic goal membership update.",
    );
    const values: Record<string, unknown> = {
      is_required: merged.role === "required" ? 1 : 0,
      weight: merged.weight,
      display_order: merged.display_order,
    };
    if (!rowChanged(before, values)) return asGoalMembership(before);

    getDb()
      .prepare(
        `UPDATE goal_kpis SET
           is_required = ?, weight = ?, display_order = ?,
           updated_by = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(...Object.values(values), actorId, patch.id);
    const after = rawGoalMembership(patch.id);
    recordStrategicAuditEvent({
      entity_type: "goal_membership",
      entity_id: patch.id,
      event_type: "update",
      entity_display_name: `${String(after.kpi_name)} membership`,
      parent_priority_name: String(after.priority_name),
      parent_goal_name: String(after.goal_name),
      previous_value: stableSnapshot(before, GOAL_MEMBERSHIP_SETTING_FIELDS),
      new_value: stableSnapshot(after, GOAL_MEMBERSHIP_SETTING_FIELDS),
      actor_id: actorId,
      source_reference:
        String(after.goal_source_reference ?? "") || null,
    });
    return asGoalMembership(after);
  });
}

function targetSubject(
  kpiId: number | null | undefined,
  componentId: number | null | undefined,
): TargetSubject {
  if (kpiId != null) {
    const kpi = getDb()
      .prepare("SELECT id, archived_at FROM kpis WHERE id = ?")
      .get(kpiId) as { id: number; archived_at: string | null } | undefined;
    if (!kpi) throw new StrategyEditNotFoundError("kpi", kpiId);
    const config = getDb()
      .prepare(
        `SELECT measurement_type, archived_at
         FROM kpi_measurement_configs
         WHERE kpi_id = ? AND archived_at IS NULL
         ORDER BY effective_from_year DESC, id DESC LIMIT 1`,
      )
      .get(kpiId) as
      | { measurement_type: MeasurementType | null; archived_at: string | null }
      | undefined;
    if (!config?.measurement_type) {
      throw new StrategyEditConflictError(
        "Create a measurement configuration before adding targets.",
        "missing_measurement_configuration",
      );
    }
    return {
      kpi_id: kpiId,
      component_id: null,
      effective_kpi_id: kpiId,
      measurement_type: config.measurement_type,
      archived: kpi.archived_at != null || config.archived_at != null,
    };
  }
  const component = rawComponent(Number(componentId));
  const configuration = rawConfiguration(Number(component.configuration_id));
  return {
    kpi_id: null,
    component_id: Number(component.id),
    effective_kpi_id: Number(component.kpi_id),
    measurement_type: String(component.measurement_type) as MeasurementType,
    archived: component.archived_at != null || configuration.archived_at != null,
  };
}

function validateTargetMeasurement(
  target: ValidatedStrategicTargetCreate,
  subject: TargetSubject,
): void {
  if (subject.archived) {
    throw new StrategyEditConflictError(
      "Restore the target subject before editing its targets.",
      "archived_target_subject",
    );
  }
  if (
    subject.measurement_type === "percentage" &&
    target.target_value !== null &&
    (target.target_value < 0 || target.target_value > 100)
  ) {
    throw new StrategyEditValidationError("Invalid strategic target.", [
      { path: "target_value", message: "Percentage targets must be between 0 and 100." },
    ]);
  }
  if (
    (target.configuration_status === "ready" ||
      target.configuration_status === "active") &&
    target.target_value === null &&
    target.structured_target === null &&
    !(subject.measurement_type === "binary" && target.target_description !== null)
  ) {
    throw new StrategyEditValidationError("Invalid strategic target.", [
      {
        path: "target_value",
        message: "Ready and active targets require a numeric or structured value.",
      },
    ]);
  }
}

function ensureNoTargetConflict(
  target: ValidatedStrategicTargetCreate,
  excludingId: number | null,
): void {
  const subjectColumn = target.kpi_id == null ? "component_id" : "kpi_id";
  const subjectId = target.kpi_id ?? target.component_id!;
  const conflict = getDb()
    .prepare(
      `SELECT id FROM kpi_targets
       WHERE ${subjectColumn} = ?
         AND target_scope = ?
         AND COALESCE(reporting_year, -1) = COALESCE(?, -1)
         AND target_year = ?
         AND (? IS NULL OR id <> ?)
       LIMIT 1`,
    )
    .get(
      subjectId,
      target.target_scope,
      target.reporting_year,
      target.target_year,
      excludingId,
      excludingId,
    ) as { id: number } | undefined;
  if (conflict) {
    throw new StrategyEditConflictError(
      `A target already exists for that subject, scope, and year (${conflict.id}).`,
      "duplicate_target",
    );
  }
}

const TARGET_FIELDS = [
  "target_scope",
  "reporting_year",
  "target_year",
  "external_target_year",
  "target_value",
  "structured_target_json",
  "target_description",
  "baseline_year",
  "baseline_value",
  "configuration_status",
  "source_reference",
  "last_reviewed_date",
] as const;

function targetValues(
  target: ValidatedStrategicTargetCreate,
): Record<(typeof TARGET_FIELDS)[number], unknown> {
  return {
    target_scope: target.target_scope,
    reporting_year: target.reporting_year,
    target_year: target.target_year,
    external_target_year: target.external_target_year ? 1 : 0,
    target_value: target.target_value,
    structured_target_json:
      target.structured_target === null
        ? null
        : JSON.stringify(target.structured_target),
    target_description: target.target_description,
    baseline_year: target.baseline_year,
    baseline_value: target.baseline_value,
    configuration_status: target.configuration_status,
    source_reference: target.source_reference,
    last_reviewed_date: target.last_reviewed_date,
  };
}

export function createStrategicTarget(
  input: unknown,
  actorId: number | null = null,
): PersistedTarget {
  const parsed = parse(
    StrategicTargetCreateSchema,
    input,
    "Invalid strategic target.",
  );
  return transaction(() => {
    const subject = targetSubject(parsed.kpi_id, parsed.component_id);
    validateTargetMeasurement(parsed, subject);
    ensureNoTargetConflict(parsed, null);
    const values = targetValues(parsed);
    const result = getDb()
      .prepare(
        `INSERT INTO kpi_targets (
           kpi_id, component_id, ${TARGET_FIELDS.join(", ")}, created_by, updated_by
         ) VALUES (?, ?, ${TARGET_FIELDS.map(() => "?").join(", ")}, ?, ?)`,
      )
      .run(
        subject.kpi_id,
        subject.component_id,
        ...Object.values(values),
        actorId,
        actorId,
      );
    const row = rawTarget(Number(result.lastInsertRowid));
    const context = auditContextForKpi(subject.effective_kpi_id);
    recordStrategicAuditEvent({
      entity_type: "target",
      entity_id: Number(row.id),
      event_type: "create",
      entity_display_name: String(row.target_description ?? `${context.kpi_name} target`),
      parent_priority_name: context.priority_name,
      parent_goal_name: context.goal_name,
      previous_value: null,
      new_value: stableSnapshot(row, TARGET_FIELDS),
      actor_id: actorId,
      source_reference: parsed.source_reference,
    });
    return asTarget(row);
  });
}

function parseStructured(value: unknown): Record<string, StrategyJsonValue> | null {
  if (value == null || value === "") return null;
  try {
    return JSON.parse(String(value)) as Record<string, StrategyJsonValue>;
  } catch {
    return null;
  }
}

function mergedTarget(
  row: RawRow,
  patch: ValidatedStrategicTargetUpdate,
): ValidatedStrategicTargetCreate {
  return parse(
    StrategicTargetCreateSchema,
    {
      kpi_id: row.kpi_id == null ? null : Number(row.kpi_id),
      component_id: row.component_id == null ? null : Number(row.component_id),
      target_scope: patch.target_scope ?? row.target_scope,
      reporting_year:
        patch.reporting_year === undefined
          ? row.reporting_year == null
            ? null
            : Number(row.reporting_year)
          : patch.reporting_year,
      target_year: patch.target_year ?? Number(row.target_year),
      external_target_year:
        patch.external_target_year ?? Number(row.external_target_year) === 1,
      target_value:
        patch.target_value === undefined
          ? row.target_value == null
            ? null
            : Number(row.target_value)
          : patch.target_value,
      structured_target:
        patch.structured_target === undefined
          ? parseStructured(row.structured_target_json)
          : patch.structured_target,
      target_description:
        patch.target_description === undefined
          ? row.target_description ?? null
          : patch.target_description,
      baseline_year:
        patch.baseline_year === undefined
          ? row.baseline_year == null
            ? null
            : Number(row.baseline_year)
          : patch.baseline_year,
      baseline_value:
        patch.baseline_value === undefined
          ? row.baseline_value == null
            ? null
            : Number(row.baseline_value)
          : patch.baseline_value,
      configuration_status:
        patch.configuration_status ?? row.configuration_status,
      source_reference:
        patch.source_reference === undefined
          ? row.source_reference ?? null
          : patch.source_reference,
      last_reviewed_date:
        patch.last_reviewed_date === undefined
          ? row.last_reviewed_date ?? null
          : patch.last_reviewed_date,
    },
    "Invalid strategic target.",
  );
}

export function updateStrategicTarget(
  input: unknown,
  actorId: number | null = null,
): PersistedTarget {
  const patch = parse(
    StrategicTargetUpdateSchema,
    input,
    "Invalid strategic target update.",
  );
  return transaction(() => {
    const before = rawTarget(patch.id);
    requireEditable(before, "target");
    const merged = mergedTarget(before, patch);
    const subject = targetSubject(merged.kpi_id, merged.component_id);
    validateTargetMeasurement(merged, subject);
    ensureNoTargetConflict(merged, patch.id);
    const values = targetValues(merged);
    if (!rowChanged(before, values)) return asTarget(before);
    getDb()
      .prepare(
        `UPDATE kpi_targets SET
           ${TARGET_FIELDS.map((field) => `${field} = ?`).join(", ")},
           updated_by = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(...Object.values(values), actorId, patch.id);
    const after = rawTarget(patch.id);
    const context = auditContextForKpi(subject.effective_kpi_id);
    const onlyStatus = Object.keys(patch).every((key) =>
      ["id", "configuration_status", "source_reference", "last_reviewed_date"].includes(key),
    );
    recordStrategicAuditEvent({
      entity_type: "target",
      entity_id: patch.id,
      event_type: onlyStatus ? "status_change" : "update",
      entity_display_name: String(after.target_description ?? `${context.kpi_name} target`),
      parent_priority_name: context.priority_name,
      parent_goal_name: context.goal_name,
      previous_value: stableSnapshot(before, TARGET_FIELDS),
      new_value: stableSnapshot(after, TARGET_FIELDS),
      actor_id: actorId,
      source_reference: String(after.source_reference ?? "") || null,
    });
    return asTarget(after);
  });
}

const COMPONENT_FIELDS = [
  "label",
  "measurement_type",
  "unit",
  "numerator_label",
  "denominator_label",
  "fixed_denominator",
  "baseline_value",
  "previous_period_value",
  "weight",
  "display_order",
  "configuration_status",
  "unresolved_question",
] as const;

function configurationForComponent(id: number): RawRow {
  const config = rawConfiguration(id);
  requireEditable(config, "measurement configuration");
  if (config.measurement_type !== "multi_component") {
    throw new StrategyEditConflictError(
      "Components require a multi-component measurement configuration.",
      "not_multi_component",
    );
  }
  return config;
}

function ensureComponentOrderAvailable(
  configurationId: number,
  order: number,
  excludingId: number | null,
): void {
  const conflict = getDb()
    .prepare(
      `SELECT id FROM kpi_components
       WHERE configuration_id = ? AND display_order = ? AND archived_at IS NULL
         AND (? IS NULL OR id <> ?)
       LIMIT 1`,
    )
    .get(configurationId, order, excludingId, excludingId) as
    | { id: number }
    | undefined;
  if (conflict) {
    throw new StrategyEditConflictError(
      `Display order is already used by component ${conflict.id}; use reorder instead.`,
      "component_order_conflict",
    );
  }
}

function validateComponentDefinition(
  component: Record<string, unknown>,
  config: RawRow,
  target: RawRow | null,
): void {
  if (
    (component.configuration_status === "needs_definition" ||
      component.configuration_status === "needs_target") &&
    component.unresolved_question == null
  ) {
    throw new StrategyEditValidationError("Invalid strategy component.", [
      {
        path: "unresolved_question",
        message: "An unresolved question is required for unresolved configuration.",
      },
    ]);
  }
  parse(
    ComponentInputSchema,
    {
      parent_kpi_id: Number(config.kpi_id),
      slug: String(component.slug),
      label: String(component.label),
      measurement_type: component.measurement_type,
      unit: component.unit ?? null,
      numerator_label: component.numerator_label ?? null,
      denominator_label: component.denominator_label ?? null,
      fixed_denominator: component.fixed_denominator ?? null,
      value: null,
      baseline_value: component.baseline_value ?? null,
      previous_period_value: component.previous_period_value ?? null,
      target_value: target?.target_value ?? null,
      annual_target_value:
        target?.target_scope === "annual" ? target.target_value ?? null : null,
      target_year: target?.target_year ?? null,
      target_description: target?.target_description ?? null,
      weight: component.weight ?? 1,
      display_order: Number(component.display_order),
      configuration_status: component.configuration_status,
      effective_start_year: Number(config.effective_from_year),
      effective_end_year:
        config.effective_to_year == null ? null : Number(config.effective_to_year),
    },
    "Invalid strategy component.",
  );
}

function componentTarget(componentId: number): RawRow | null {
  return (
    (getDb()
      .prepare(
        `SELECT * FROM kpi_targets
         WHERE component_id = ? AND archived_at IS NULL
         ORDER BY target_year DESC, id DESC LIMIT 1`,
      )
      .get(componentId) as RawRow | undefined) ?? null
  );
}

export function createStrategyComponent(
  input: unknown,
  actorId: number | null = null,
): PersistedComponent {
  const parsed = parse(
    StrategyComponentCreateSchema,
    input,
    "Invalid strategy component.",
  );
  return transaction(() => {
    const config = configurationForComponent(parsed.configuration_id);
    const duplicate = getDb()
      .prepare("SELECT id FROM kpi_components WHERE kpi_id = ? AND slug = ?")
      .get(Number(config.kpi_id), parsed.slug) as { id: number } | undefined;
    if (duplicate) {
      throw new StrategyEditConflictError(
        `Component slug already exists (${duplicate.id}).`,
        "duplicate_component_slug",
      );
    }
    ensureComponentOrderAvailable(parsed.configuration_id, parsed.display_order, null);
    const values = {
      label: parsed.label,
      measurement_type: parsed.measurement_type,
      unit: parsed.unit,
      numerator_label: parsed.numerator_label,
      denominator_label: parsed.denominator_label,
      fixed_denominator: parsed.fixed_denominator,
      baseline_value: parsed.baseline_value,
      previous_period_value: parsed.previous_period_value,
      weight: parsed.weight,
      display_order: parsed.display_order,
      configuration_status: parsed.configuration_status,
      unresolved_question: parsed.unresolved_question,
    };
    validateComponentDefinition({ ...parsed, ...values }, config, null);
    const result = getDb()
      .prepare(
        `INSERT INTO kpi_components (
           kpi_id, configuration_id, slug, ${COMPONENT_FIELDS.join(", ")},
           created_by, updated_by
         ) VALUES (?, ?, ?, ${COMPONENT_FIELDS.map(() => "?").join(", ")}, ?, ?)`,
      )
      .run(
        Number(config.kpi_id),
        parsed.configuration_id,
        parsed.slug,
        ...Object.values(values),
        actorId,
        actorId,
      );
    const row = rawComponent(Number(result.lastInsertRowid));
    const context = auditContextForKpi(Number(config.kpi_id));
    recordStrategicAuditEvent({
      entity_type: "component",
      entity_id: Number(row.id),
      event_type: "create",
      entity_display_name: parsed.label,
      parent_priority_name: context.priority_name,
      parent_goal_name: context.goal_name,
      previous_value: null,
      new_value: stableSnapshot(row, ["slug", ...COMPONENT_FIELDS]),
      actor_id: actorId,
      source_reference: String(config.source_reference ?? "") || null,
    });
    return asComponent(row);
  });
}

function mergedComponent(
  row: RawRow,
  patch: ValidatedStrategyComponentUpdate,
): Record<string, unknown> {
  const value = (key: keyof ValidatedStrategyComponentUpdate) =>
    patch[key] === undefined ? row[key] ?? null : patch[key];
  return {
    id: Number(row.id),
    kpi_id: Number(row.kpi_id),
    configuration_id: Number(row.configuration_id),
    slug: String(row.slug),
    label: value("label"),
    measurement_type: value("measurement_type"),
    unit: value("unit"),
    numerator_label: value("numerator_label"),
    denominator_label: value("denominator_label"),
    fixed_denominator: value("fixed_denominator"),
    baseline_value: value("baseline_value"),
    previous_period_value: value("previous_period_value"),
    weight: value("weight"),
    display_order: value("display_order"),
    configuration_status: value("configuration_status"),
    unresolved_question: value("unresolved_question"),
  };
}

export function updateStrategyComponent(
  input: unknown,
  actorId: number | null = null,
): PersistedComponent {
  const patch = parse(
    StrategyComponentUpdateSchema,
    input,
    "Invalid strategy component update.",
  );
  return transaction(() => {
    const before = rawComponent(patch.id);
    requireEditable(before, "component");
    const config = configurationForComponent(Number(before.configuration_id));
    const merged = mergedComponent(before, patch);
    if (
      patch.measurement_type !== undefined &&
      patch.measurement_type !== before.measurement_type
    ) {
      const count = Number(
        (
          getDb()
            .prepare(
              `SELECT
                 (SELECT COUNT(*) FROM kpi_component_entries WHERE component_id = ?) +
                 (SELECT COUNT(*) FROM kpi_targets WHERE component_id = ?) AS count`,
            )
            .get(patch.id, patch.id) as { count: number }
        ).count,
      );
      if (count > 0) {
        throw new StrategyEditConflictError(
          "Component measurement type cannot change after values or targets exist.",
          "component_history_conflict",
        );
      }
    }
    ensureComponentOrderAvailable(
      Number(before.configuration_id),
      Number(merged.display_order),
      patch.id,
    );
    validateComponentDefinition(merged, config, componentTarget(patch.id));
    const values = Object.fromEntries(
      COMPONENT_FIELDS.map((field) => [field, merged[field]]),
    );
    if (!rowChanged(before, values)) return asComponent(before);
    getDb()
      .prepare(
        `UPDATE kpi_components SET
           ${COMPONENT_FIELDS.map((field) => `${field} = ?`).join(", ")},
           updated_by = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(...Object.values(values), actorId, patch.id);
    const after = rawComponent(patch.id);
    const context = auditContextForKpi(Number(before.kpi_id));
    const onlyStatus = Object.keys(patch).every((key) =>
      ["id", "configuration_status", "unresolved_question"].includes(key),
    );
    recordStrategicAuditEvent({
      entity_type: "component",
      entity_id: patch.id,
      event_type: onlyStatus ? "status_change" : "update",
      entity_display_name: String(after.label),
      parent_priority_name: context.priority_name,
      parent_goal_name: context.goal_name,
      previous_value: stableSnapshot(before, COMPONENT_FIELDS),
      new_value: stableSnapshot(after, COMPONENT_FIELDS),
      actor_id: actorId,
      source_reference: String(config.source_reference ?? "") || null,
    });
    return asComponent(after);
  });
}

export function reorderStrategyComponents(
  input: unknown,
  actorId: number | null = null,
): PersistedComponent[] {
  const parsed = parse(
    StrategyComponentReorderSchema,
    input,
    "Invalid component reorder.",
  );
  return transaction(() => {
    const config = configurationForComponent(parsed.configuration_id);
    const rows = getDb()
      .prepare(
        `SELECT * FROM kpi_components
         WHERE configuration_id = ? AND archived_at IS NULL
         ORDER BY display_order, id`,
      )
      .all(parsed.configuration_id) as RawRow[];
    const activeIds = rows.map((row) => Number(row.id)).sort((a, b) => a - b);
    const requestedIds = [...parsed.ordered_component_ids].sort((a, b) => a - b);
    if (
      activeIds.length !== requestedIds.length ||
      activeIds.some((id, index) => id !== requestedIds[index])
    ) {
      throw new StrategyEditConflictError(
        "Reorder must contain every active component exactly once.",
        "component_set_mismatch",
      );
    }
    const byId = new Map(rows.map((row) => [Number(row.id), row]));
    const context = auditContextForKpi(Number(config.kpi_id));
    for (const [displayOrder, id] of parsed.ordered_component_ids.entries()) {
      const before = byId.get(id)!;
      if (Number(before.display_order) === displayOrder) continue;
      getDb()
        .prepare(
          `UPDATE kpi_components SET display_order = ?, updated_by = ?,
             updated_at = datetime('now') WHERE id = ?`,
        )
        .run(displayOrder, actorId, id);
      const after = rawComponent(id);
      recordStrategicAuditEvent({
        entity_type: "component",
        entity_id: id,
        event_type: "update",
        entity_display_name: String(after.label),
        parent_priority_name: context.priority_name,
        parent_goal_name: context.goal_name,
        previous_value: stableSnapshot(before, ["display_order"]),
        new_value: stableSnapshot(after, ["display_order"]),
        actor_id: actorId,
        source_reference: String(config.source_reference ?? "") || null,
      });
    }
    return parsed.ordered_component_ids.map((id) => asComponent(rawComponent(id)));
  });
}
