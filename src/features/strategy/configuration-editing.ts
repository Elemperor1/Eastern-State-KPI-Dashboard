import { z } from "@/lib/zod";
import { getDb, transaction } from "@/lib/db";
import { resolveConfiguredTargetValue } from "./calculations";
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
import {
  STRATEGIC_PLAN_END_YEAR,
  STRATEGIC_PLAN_START_YEAR,
  type ConfigurationStatus,
  type MeasurementType,
  type StrategyJsonValue,
} from "./types";
import {
  ComponentInputSchema,
  ComponentSetInputSchema,
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

function parse<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
  message: string,
): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new StrategyEditValidationError(message, issues(result.error));
  }
  return result.data as z.output<Schema>;
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
              goal.plan_start_year AS goal_plan_start_year,
              goal.plan_end_year AS goal_plan_end_year,
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
  const configuration = rawConfiguration(id);
  const normalized = getDb()
    .prepare(
      `SELECT MIN(year) AS min_year, MAX(year) AS max_year
       FROM (
         SELECT year
         FROM kpi_observations
         WHERE configuration_id = ?

         UNION ALL

         SELECT entry.year
         FROM kpi_component_entries entry
         JOIN kpi_components component ON component.id = entry.component_id
         WHERE component.configuration_id = ?

         UNION ALL

         SELECT year
         FROM distribution_observations
         WHERE configuration_id = ?
       ) historical_values`,
    )
    .get(id, id, id) as {
    min_year: number | null;
    max_year: number | null;
  };
  const oldStart = Number(configuration.effective_from_year);
  const oldEnd =
    configuration.effective_to_year == null
      ? null
      : Number(configuration.effective_to_year);
  const kpiId = Number(configuration.kpi_id);
  const legacyWithinOldRange = getDb()
    .prepare(
      `SELECT MIN(year) AS min_year, MAX(year) AS max_year
       FROM (
         SELECT year FROM monthly_entries
         WHERE kpi_id = ? AND year >= ?
           AND (? IS NULL OR year <= ?)
         UNION ALL
         SELECT year FROM breakdown_entries
         WHERE kpi_id = ? AND year >= ?
           AND (? IS NULL OR year <= ?)
       ) legacy_values`,
    )
    .get(
      kpiId,
      oldStart,
      oldEnd,
      oldEnd,
      kpiId,
      oldStart,
      oldEnd,
      oldEnd,
    ) as { min_year: number | null; max_year: number | null };
  const newlyAdoptedLegacy = getDb()
    .prepare(
      `SELECT 1 AS present
       FROM (
         SELECT year FROM monthly_entries WHERE kpi_id = ?
         UNION ALL
         SELECT year FROM breakdown_entries WHERE kpi_id = ?
       ) legacy_values
       WHERE year >= ? AND (? IS NULL OR year <= ?)
         AND (year < ? OR (? IS NOT NULL AND year > ?))
       LIMIT 1`,
    )
    .get(
      kpiId,
      kpiId,
      startYear,
      endYear,
      endYear,
      oldStart,
      oldEnd,
      oldEnd,
    );
  if (newlyAdoptedLegacy) {
    throw new StrategyEditConflictError(
      "The effective-year expansion would adopt legacy values that were not interpreted by this definition. Create an explicit successor or backfill instead.",
      "legacy_range_adoption_conflict",
    );
  }
  const historyFallsOutside = (range: {
    min_year: number | null;
    max_year: number | null;
  }) =>
    range.min_year !== null &&
    (range.min_year < startYear ||
      (endYear !== null && range.max_year! > endYear));
  if (
    historyFallsOutside(normalized) ||
    historyFallsOutside(legacyWithinOldRange)
  ) {
    throw new StrategyEditConflictError(
      "The effective-year change would orphan historical values.",
      "observation_year_conflict",
    );
  }
}

function configurationHasHistoricalValuesInRange(
  id: number,
  startYear: number,
  endYear: number | null,
): boolean {
  const configuration = rawConfiguration(id);
  return Boolean(
    getDb()
      .prepare(
        `SELECT 1 AS present FROM kpi_observations
         WHERE configuration_id = ?
         UNION ALL
         SELECT 1 AS present
         FROM kpi_component_entries entry
         JOIN kpi_components component ON component.id = entry.component_id
         WHERE component.configuration_id = ?
         UNION ALL
         SELECT 1 AS present FROM distribution_observations
         WHERE configuration_id = ?
         UNION ALL
         SELECT 1 AS present
         FROM monthly_entries entry
         WHERE entry.kpi_id = ? AND entry.year >= ?
           AND (? IS NULL OR entry.year <= ?)
         UNION ALL
         SELECT 1 AS present
         FROM breakdown_entries entry
         WHERE entry.kpi_id = ? AND entry.year >= ?
           AND (? IS NULL OR entry.year <= ?)
         LIMIT 1`,
      )
      .get(
        id,
        id,
        id,
        Number(configuration.kpi_id),
        startYear,
        endYear,
        endYear,
        Number(configuration.kpi_id),
        startYear,
        endYear,
        endYear,
      ),
  );
}

function kpiHasHistoricalValuesInRange(
  kpiId: number,
  startYear: number,
  endYear: number | null,
): boolean {
  return Boolean(
    getDb()
      .prepare(
        `WITH bounds(kpi_id, start_year, end_year) AS (VALUES (?, ?, ?))
         SELECT 1 AS present
         FROM kpi_observations observation, bounds
         WHERE observation.kpi_id = bounds.kpi_id
           AND observation.year >= bounds.start_year
           AND (bounds.end_year IS NULL OR observation.year <= bounds.end_year)
         UNION ALL
         SELECT 1 AS present
         FROM kpi_component_entries entry
         JOIN kpi_components component ON component.id = entry.component_id
         JOIN bounds ON component.kpi_id = bounds.kpi_id
         WHERE entry.year >= bounds.start_year
           AND (bounds.end_year IS NULL OR entry.year <= bounds.end_year)
         UNION ALL
         SELECT 1 AS present
         FROM distribution_observations observation, bounds
         WHERE observation.kpi_id = bounds.kpi_id
           AND observation.year >= bounds.start_year
           AND (bounds.end_year IS NULL OR observation.year <= bounds.end_year)
         UNION ALL
         SELECT 1 AS present
         FROM monthly_entries entry, bounds
         WHERE entry.kpi_id = bounds.kpi_id
           AND entry.year >= bounds.start_year
           AND (bounds.end_year IS NULL OR entry.year <= bounds.end_year)
         UNION ALL
         SELECT 1 AS present
         FROM breakdown_entries entry, bounds
         WHERE entry.kpi_id = bounds.kpi_id
           AND entry.year >= bounds.start_year
           AND (bounds.end_year IS NULL OR entry.year <= bounds.end_year)
         LIMIT 1`,
      )
      .get(kpiId, startYear, endYear),
  );
}

function fieldsChanged(
  before: RawRow,
  values: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  return fields.some((field) => !same(before[field], values[field]));
}

function calculationStatusMeaning(value: unknown): string {
  return value === "ready" || value === "active"
    ? "calculation_ready"
    : String(value ?? "");
}

function calculationStatusMeaningChanged(
  before: RawRow,
  values: Record<string, unknown>,
): boolean {
  return (
    calculationStatusMeaning(before.configuration_status) !==
    calculationStatusMeaning(values.configuration_status)
  );
}

function rejectHistoricalSemanticEdit(
  message: string,
): never {
  throw new StrategyEditConflictError(
    message,
    "historical_semantics_conflict",
  );
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

const CONFIG_CALCULATION_SEMANTIC_FIELDS = [
  "measurement_type",
  "unit",
  "numerator_label",
  "denominator_label",
  "fixed_denominator",
  "baseline_value",
  "reporting_frequency",
  "aggregation_method",
  "calculation_precision",
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
    assertFullPlanTargetConfigurationIntegrity({
      kpiId: parsed.kpi_id,
      configurations: [
        ...activeConfigurationRows(parsed.kpi_id),
        {
          id: Number.MAX_SAFE_INTEGER,
          kpi_id: parsed.kpi_id,
          archived_at: null,
          ...values,
        },
      ],
    });
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

const SuccessorMeasurementConfigurationSchema = z
  .object({
    predecessor_id: z.number().int().positive(),
    successor: MeasurementConfigurationCreateSchema,
  })
  .strict();

export interface SuccessorMeasurementConfigurationResult {
  predecessor: PersistedMeasurementConfig;
  successor: PersistedMeasurementConfig;
}

function successorTargetApplies(
  row: RawRow,
  targets: RawRow[],
  startYear: number,
  endYear: number,
): boolean {
  if (row.target_scope === "annual") {
    const reportingYear = Number(row.reporting_year);
    return reportingYear >= startYear && reportingYear <= endYear;
  }
  for (let year = startYear; year <= endYear; year += 1) {
    if (Number(selectedFullPlanTarget(targets, year)?.id) === Number(row.id)) {
      return true;
    }
  }
  return false;
}

function targetIncompatibility(
  row: RawRow,
  measurementType: MeasurementType,
): string | null {
  let structuredTarget: Record<string, unknown> | null = null;
  const rawStructured = row.structured_target ?? row.structured_target_json;
  if (rawStructured && typeof rawStructured === "object") {
    structuredTarget = rawStructured as Record<string, unknown>;
  } else if (typeof rawStructured === "string") {
    try {
      const parsed = JSON.parse(rawStructured) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        structuredTarget = parsed as Record<string, unknown>;
      }
    } catch {
      return "The structured target is not valid JSON.";
    }
  }
  const targetValue = row.target_value == null ? null : Number(row.target_value);
  const targetDescription =
    row.target_description == null ? null : String(row.target_description);
  const value = resolveConfiguredTargetValue({
    measurementType,
    targetValue,
    structuredTarget,
    targetDescription,
    configurationStatus: "active",
  });
  if (
    measurementType === "percentage" &&
    value !== null &&
    (!Number.isFinite(value) || value < 0 || value > 100)
  ) {
    return "Percentage targets must remain between 0 and 100.";
  }
  if (
    measurementType === "binary" &&
    value !== null &&
    value !== 0 &&
    value !== 1
  ) {
    return "Binary targets must be 0 or 1 when they are numeric.";
  }
  const status = String(row.configuration_status ?? "draft");
  if (
    (status === "ready" || status === "active") &&
    resolveConfiguredTargetValue({
      measurementType,
      targetValue,
      structuredTarget,
      targetDescription,
      configurationStatus: status,
    }) === null
  ) {
    return "Ready and active targets must remain calculable under the measurement definition.";
  }
  return null;
}

function activeConfigurationRows(kpiId: number): RawRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM kpi_measurement_configs
       WHERE kpi_id = ? AND archived_at IS NULL
       ORDER BY effective_from_year, id`,
    )
    .all(kpiId) as RawRow[];
}

function activeParentTargetRows(kpiId: number): RawRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM kpi_targets
       WHERE kpi_id = ? AND component_id IS NULL AND archived_at IS NULL
       ORDER BY target_scope, reporting_year, target_year, id`,
    )
    .all(kpiId) as RawRow[];
}

function effectiveConfigurationFromRows(
  configurations: RawRow[],
  year: number,
): RawRow | null {
  return configurations
    .filter(
      (configuration) =>
        Number(configuration.effective_from_year) <= year &&
        (configuration.effective_to_year == null ||
          Number(configuration.effective_to_year) >= year),
    )
    .sort(
      (left, right) =>
        Number(right.effective_from_year) - Number(left.effective_from_year) ||
        Number(right.id) - Number(left.id),
    )[0] ?? null;
}

function selectedFullPlanTarget(
  targets: RawRow[],
  year: number,
): RawRow | null {
  const fullPlanTargets = targets.filter(
    (target) => target.target_scope === "full_plan",
  );
  const future = fullPlanTargets
    .filter((target) => Number(target.target_year) >= year)
    .sort(
      (left, right) =>
        Number(left.target_year) - Number(right.target_year) ||
        Number(left.id) - Number(right.id),
    )[0];
  if (future) return future;
  return fullPlanTargets
    .filter((target) => Number(target.target_year) < year)
    .sort(
      (left, right) =>
        Number(right.target_year) - Number(left.target_year) ||
        Number(left.id) - Number(right.id),
    )[0] ?? null;
}

function configurationSemanticSignature(configuration: RawRow): string {
  const componentSemantics =
    configuration.measurement_type === "multi_component"
      ? activeComponentsForConfiguration(Number(configuration.id)).map(
          (component) => [
            component.slug ?? null,
            component.label ?? null,
            component.measurement_type ?? null,
            component.unit ?? null,
            component.numerator_label ?? null,
            component.denominator_label ?? null,
            component.fixed_denominator ?? null,
            component.baseline_value ?? null,
            component.previous_period_value ?? null,
            component.aggregation_role ?? null,
            component.weight ?? null,
            calculationStatusMeaning(component.configuration_status),
          ],
        )
      : null;
  return JSON.stringify(
    [
      ...CONFIG_CALCULATION_SEMANTIC_FIELDS.map(
        (field) => configuration[field] ?? null,
      ),
      componentSemantics,
    ],
  );
}

function targetCarriesDefinedSemantics(target: RawRow): boolean {
  return (
    target.target_value != null ||
    target.structured_target_json != null ||
    ((target.configuration_status === "ready" ||
      target.configuration_status === "active") &&
      target.target_description != null)
  );
}

/**
 * Parent Full-Plan Targets are KPI-scoped, so the nearest-future/latest-past
 * policy can make one row visible in several Reporting Years. A defined Target
 * must never cross a semantic measurement boundary. An unresolved, valueless
 * placeholder may cross temporarily so editors can establish target-year
 * boundaries one row at a time before finalizing either side.
 */
function assertFullPlanTargetConfigurationIntegrity({
  kpiId,
  configurations = activeConfigurationRows(kpiId),
  targets = activeParentTargetRows(kpiId),
}: {
  kpiId: number;
  configurations?: RawRow[];
  targets?: RawRow[];
}): void {
  const signatures = new Map<number, string>();
  for (
    let year = STRATEGIC_PLAN_START_YEAR;
    year <= STRATEGIC_PLAN_END_YEAR;
    year += 1
  ) {
    const target = selectedFullPlanTarget(targets, year);
    const configuration = effectiveConfigurationFromRows(configurations, year);
    if (!target) {
      continue;
    }
    if (!configuration || configuration.measurement_type == null) {
      if (targetCarriesDefinedSemantics(target)) {
        throw new StrategyEditConflictError(
          `Full-plan target ${String(target.id)} has no measurement configuration for reporting year ${year}.`,
          "target_configuration_coverage_conflict",
        );
      }
      continue;
    }
    const issue = targetIncompatibility(
      target,
      String(configuration.measurement_type) as MeasurementType,
    );
    if (issue) {
      throw new StrategyEditConflictError(
        `Full-plan target ${String(target.id)} is incompatible with the measurement configuration for ${year}. ${issue}`,
        "target_measurement_incompatible",
      );
    }
    if (!targetCarriesDefinedSemantics(target)) continue;
    const id = Number(target.id);
    const signature = configurationSemanticSignature(configuration);
    const previous = signatures.get(id);
    if (previous !== undefined && previous !== signature) {
      throw new StrategyEditConflictError(
        `Full-plan target ${String(target.id)} would be interpreted by different measurement definitions across reporting years. Add unresolved boundary targets first, then finalize one target per compatible definition range.`,
        "target_configuration_semantics_conflict",
      );
    }
    signatures.set(id, signature);
  }

  for (const target of targets.filter(
    (candidate) => candidate.target_scope === "annual",
  )) {
    if (!targetCarriesDefinedSemantics(target)) continue;
    const targetYear = Number(target.reporting_year ?? target.target_year);
    const configurationYear = Math.min(
      Math.max(targetYear, STRATEGIC_PLAN_START_YEAR),
      STRATEGIC_PLAN_END_YEAR,
    );
    const configuration = effectiveConfigurationFromRows(
      configurations,
      configurationYear,
    );
    if (!configuration || configuration.measurement_type == null) {
      throw new StrategyEditConflictError(
        `Annual target ${String(target.id)} has no measurement configuration for reporting year ${targetYear}.`,
        "target_configuration_coverage_conflict",
      );
    }
    const issue = targetIncompatibility(
      target,
      String(configuration.measurement_type) as MeasurementType,
    );
    if (issue) {
      throw new StrategyEditConflictError(
        `Annual target ${String(target.id)} is incompatible with the measurement configuration for ${targetYear}. ${issue}`,
        "target_measurement_incompatible",
      );
    }
  }
}

function configurationHasDefinedTarget(
  kpiId: number,
  startYear: number,
  endYear: number | null,
): boolean {
  const targets = activeParentTargetRows(kpiId);
  const lastYear = Math.min(endYear ?? STRATEGIC_PLAN_END_YEAR, STRATEGIC_PLAN_END_YEAR);
  for (
    let year = Math.max(startYear, STRATEGIC_PLAN_START_YEAR);
    year <= lastYear;
    year += 1
  ) {
    const annual = targets.find(
      (target) =>
        target.target_scope === "annual" &&
        Number(target.reporting_year) === year &&
        targetCarriesDefinedSemantics(target),
    );
    const fullPlan = selectedFullPlanTarget(targets, year);
    if (annual || (fullPlan && targetCarriesDefinedSemantics(fullPlan))) {
      return true;
    }
  }
  return false;
}

function activeComponentsForConfiguration(configurationId: number): RawRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM kpi_components
       WHERE configuration_id = ? AND archived_at IS NULL
         AND configuration_status <> 'archived'
       ORDER BY display_order, id`,
    )
    .all(configurationId) as RawRow[];
}

function assertSuccessorConfigurationCompatibility(
  predecessor: RawRow,
  successor: ValidatedMeasurementConfigurationCreate,
): RawRow[] {
  const endYear = successor.effective_end_year;
  if (
    successor.effective_start_year < STRATEGIC_PLAN_START_YEAR ||
    successor.effective_start_year > STRATEGIC_PLAN_END_YEAR ||
    endYear === null ||
    endYear > STRATEGIC_PLAN_END_YEAR
  ) {
    throw new StrategyEditConflictError(
      "Successor definitions in this strategic-plan workflow must stay within 2025–2029.",
      "successor_outside_plan",
    );
  }

  const kpiTargets = getDb()
    .prepare(
      `SELECT * FROM kpi_targets
       WHERE kpi_id = ? AND component_id IS NULL AND archived_at IS NULL
         AND configuration_status <> 'archived'`,
    )
    .all(Number(predecessor.kpi_id)) as RawRow[];
  for (const target of kpiTargets) {
    if (
      successorTargetApplies(
        target,
        kpiTargets,
        successor.effective_start_year,
        endYear,
      )
    ) {
      const issue = targetIncompatibility(target, successor.measurement_type);
      if (issue) {
        throw new StrategyEditConflictError(
          `Target ${String(target.id)} is incompatible with the successor measurement type. ${issue}`,
          "successor_target_incompatible",
        );
      }
    }
  }

  const parentBands = getDb()
    .prepare(
      `SELECT id FROM distribution_bands
       WHERE kpi_id = ? AND component_id IS NULL AND archived_at IS NULL
         AND effective_from_year <= ?
         AND (effective_to_year IS NULL OR effective_to_year >= ?)
       LIMIT 1`,
    )
    .get(
      Number(predecessor.kpi_id),
      endYear,
      successor.effective_start_year,
    ) as { id: number } | undefined;
  if (parentBands && successor.measurement_type !== "distribution") {
    throw new StrategyEditConflictError(
      `Distribution band ${parentBands.id} overlaps the successor range and cannot be interpreted by ${successor.measurement_type}.`,
      "successor_distribution_bands_incompatible",
    );
  }

  const components = activeComponentsForConfiguration(Number(predecessor.id));
  if (successor.measurement_type === "multi_component") {
    if (
      predecessor.measurement_type !== "multi_component" ||
      components.length === 0
    ) {
      if (
        successor.configuration_status === "ready" ||
        successor.configuration_status === "active"
      ) {
        throw new StrategyEditConflictError(
          "An active multi-component successor requires reusable component definitions. Save it as draft or needs definition first.",
          "successor_components_required",
        );
      }
      return [];
    }
    for (const component of components) {
      const targets = getDb()
        .prepare(
          `SELECT * FROM kpi_targets
           WHERE component_id = ? AND kpi_id IS NULL AND archived_at IS NULL
             AND configuration_status <> 'archived'`,
        )
        .all(Number(component.id)) as RawRow[];
      for (const target of targets) {
        if (
          successorTargetApplies(
            target,
            targets,
            successor.effective_start_year,
            endYear,
          )
        ) {
          const issue = targetIncompatibility(
            target,
            String(component.measurement_type) as MeasurementType,
          );
          if (issue) {
            throw new StrategyEditConflictError(
              `Component target ${String(target.id)} cannot be cloned. ${issue}`,
              "successor_component_target_incompatible",
            );
          }
        }
      }
      const incompatibleBand = getDb()
        .prepare(
          `SELECT id FROM distribution_bands
           WHERE component_id = ? AND archived_at IS NULL
             AND effective_from_year <= ?
             AND (effective_to_year IS NULL OR effective_to_year >= ?)
           LIMIT 1`,
        )
        .get(
          Number(component.id),
          endYear,
          successor.effective_start_year,
        ) as { id: number } | undefined;
      if (
        incompatibleBand &&
        component.measurement_type !== "distribution"
      ) {
        throw new StrategyEditConflictError(
          `Distribution band ${incompatibleBand.id} belongs to a non-distribution component and cannot be cloned safely.`,
          "successor_component_bands_incompatible",
        );
      }
    }
    validateSuccessorComponentSet(components, successor);
    return components;
  }

  if (predecessor.measurement_type === "multi_component") {
    for (const component of components) {
      const componentTargets = getDb()
        .prepare(
          `SELECT * FROM kpi_targets
           WHERE component_id = ? AND kpi_id IS NULL AND archived_at IS NULL
             AND configuration_status <> 'archived'`,
        )
        .all(Number(component.id)) as RawRow[];
      const futureTarget = componentTargets.find((target) =>
        successorTargetApplies(
          target,
          componentTargets,
          successor.effective_start_year,
          endYear,
        ),
      );
      const futureBand = getDb()
        .prepare(
          `SELECT id FROM distribution_bands
           WHERE component_id = ? AND archived_at IS NULL
             AND effective_from_year <= ?
             AND (effective_to_year IS NULL OR effective_to_year >= ?)
           LIMIT 1`,
        )
        .get(
          Number(component.id),
          endYear,
          successor.effective_start_year,
        ) as { id: number } | undefined;
      if (futureTarget || futureBand) {
        throw new StrategyEditConflictError(
          "Future component targets or distribution bands must be archived or bounded before changing away from a multi-component definition.",
          "successor_component_artifacts_incompatible",
        );
      }
    }
  }
  return [];
}

const SUCCESSOR_COMPONENT_CLONE_FIELDS = [
  "label",
  "measurement_type",
  "unit",
  "numerator_label",
  "denominator_label",
  "fixed_denominator",
  "baseline_value",
  "previous_period_value",
  "aggregation_role",
  "weight",
  "display_order",
  "configuration_status",
  "unresolved_question",
] as const;

const SUCCESSOR_TARGET_CLONE_FIELDS = [
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

function cloneSuccessorComponents(
  components: RawRow[],
  successor: PersistedMeasurementConfig,
  actorId: number | null,
): void {
  if (components.length === 0) return;
  const db = getDb();
  const context = auditContextForKpi(successor.kpi_id);
  const endYear = successor.effective_to_year!;
  for (const before of components) {
    const componentResult = db
      .prepare(
        `INSERT INTO kpi_components (
           kpi_id, configuration_id, slug,
           ${SUCCESSOR_COMPONENT_CLONE_FIELDS.join(", ")},
           created_by, updated_by
         ) VALUES (?, ?, ?, ${SUCCESSOR_COMPONENT_CLONE_FIELDS.map(() => "?").join(", ")}, ?, ?)`,
      )
      .run(
        successor.kpi_id,
        successor.id,
        String(before.slug),
        ...SUCCESSOR_COMPONENT_CLONE_FIELDS.map((field) => before[field] ?? null),
        actorId,
        actorId,
      );
    const cloned = rawComponent(Number(componentResult.lastInsertRowid));
    recordStrategicAuditEvent({
      entity_type: "component",
      entity_id: Number(cloned.id),
      event_type: "create",
      entity_display_name: String(cloned.label),
      parent_priority_name: context.priority_name,
      parent_goal_name: context.goal_name,
      previous_value: null,
      new_value: {
        ...stableSnapshot(cloned, ["slug", ...SUCCESSOR_COMPONENT_CLONE_FIELDS]),
        predecessor_component_id: Number(before.id),
      },
      actor_id: actorId,
      source_reference: successor.source_reference,
    });

    const allTargets = db
      .prepare(
        `SELECT * FROM kpi_targets
         WHERE component_id = ? AND kpi_id IS NULL AND archived_at IS NULL
           AND configuration_status <> 'archived'
         ORDER BY target_scope, reporting_year, target_year, id`,
      )
      .all(Number(before.id)) as RawRow[];
    const targets = allTargets.filter((target) =>
      successorTargetApplies(
        target,
        allTargets,
        successor.effective_from_year,
        endYear,
      ),
    );
    for (const target of targets) {
      const targetResult = db
        .prepare(
          `INSERT INTO kpi_targets (
             kpi_id, component_id, ${SUCCESSOR_TARGET_CLONE_FIELDS.join(", ")},
             created_by, updated_by
           ) VALUES (NULL, ?, ${SUCCESSOR_TARGET_CLONE_FIELDS.map(() => "?").join(", ")}, ?, ?)`,
        )
        .run(
          Number(cloned.id),
          ...SUCCESSOR_TARGET_CLONE_FIELDS.map((field) => target[field] ?? null),
          actorId,
          actorId,
        );
      const clonedTarget = rawTarget(Number(targetResult.lastInsertRowid));
      recordStrategicAuditEvent({
        entity_type: "target",
        entity_id: Number(clonedTarget.id),
        event_type: "create",
        entity_display_name: String(
          clonedTarget.target_description ?? `${String(cloned.label)} target`,
        ),
        parent_priority_name: context.priority_name,
        parent_goal_name: context.goal_name,
        previous_value: null,
        new_value: {
          ...stableSnapshot(clonedTarget, SUCCESSOR_TARGET_CLONE_FIELDS),
          predecessor_target_id: Number(target.id),
          predecessor_component_id: Number(before.id),
        },
        actor_id: actorId,
        source_reference:
          String(clonedTarget.source_reference ?? "") || null,
      });
    }

    const bands = db
      .prepare(
        `SELECT * FROM distribution_bands
         WHERE component_id = ? AND archived_at IS NULL
           AND effective_from_year <= ?
           AND (effective_to_year IS NULL OR effective_to_year >= ?)
         ORDER BY display_order, id`,
      )
      .all(
        Number(before.id),
        endYear,
        successor.effective_from_year,
      ) as RawRow[];
    for (const band of bands) {
      const clonedStart = Math.max(
        successor.effective_from_year,
        Number(band.effective_from_year),
      );
      const clonedEnd = Math.min(
        endYear,
        band.effective_to_year == null
          ? endYear
          : Number(band.effective_to_year),
      );
      const bandResult = db
        .prepare(
          `INSERT INTO distribution_bands (
             kpi_id, component_id, slug, label, effective_from_year,
             effective_to_year, display_order, is_unknown, is_declined,
             derived_group, created_by, updated_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          successor.kpi_id,
          Number(cloned.id),
          String(band.slug),
          String(band.label),
          clonedStart,
          clonedEnd,
          Number(band.display_order),
          Number(band.is_unknown),
          Number(band.is_declined),
          band.derived_group ?? null,
          actorId,
          actorId,
        );
      const clonedBand = db
        .prepare("SELECT * FROM distribution_bands WHERE id = ?")
        .get(Number(bandResult.lastInsertRowid)) as RawRow;
      recordStrategicAuditEvent({
        entity_type: "distribution_band",
        entity_id: Number(clonedBand.id),
        event_type: "create",
        entity_display_name: String(clonedBand.label),
        parent_priority_name: context.priority_name,
        parent_goal_name: context.goal_name,
        previous_value: null,
        new_value: {
          ...stableSnapshot(clonedBand, [
            "slug",
            "label",
            "effective_from_year",
            "effective_to_year",
            "display_order",
            "is_unknown",
            "is_declined",
            "derived_group",
          ]),
          predecessor_band_id: Number(band.id),
          predecessor_component_id: Number(before.id),
        },
        actor_id: actorId,
      });
    }
  }
}

/**
 * Split an effective-dated definition at a future boundary without rewriting
 * values already interpreted by the predecessor. The predecessor truncation,
 * successor insert, and both audit events commit or roll back together.
 */
export function createSuccessorMeasurementConfiguration(
  input: unknown,
  actorId: number | null = null,
): SuccessorMeasurementConfigurationResult {
  const parsed = parse(
    SuccessorMeasurementConfigurationSchema,
    input,
    "Invalid successor measurement configuration.",
  );
  return transaction(() => {
    const before = rawConfiguration(parsed.predecessor_id);
    requireEditable(before, "measurement configuration");
    const kpiId = Number(before.kpi_id);
    if (parsed.successor.kpi_id !== kpiId) {
      throw new StrategyEditConflictError(
        "The successor must belong to the predecessor KPI.",
        "successor_kpi_mismatch",
      );
    }

    const predecessorStart = Number(before.effective_from_year);
    const predecessorEnd =
      before.effective_to_year == null
        ? null
        : Number(before.effective_to_year);
    const successorStart = parsed.successor.effective_start_year;
    if (successorStart <= predecessorStart) {
      throw new StrategyEditConflictError(
        "A successor must start after the predecessor's first effective year.",
        "invalid_successor_start",
      );
    }
    if (predecessorEnd !== null && successorStart > predecessorEnd + 1) {
      throw new StrategyEditConflictError(
        "A successor must begin during or immediately after the predecessor range.",
        "successor_effective_gap",
      );
    }
    const reusableComponents = assertSuccessorConfigurationCompatibility(
      before,
      parsed.successor,
    );
    const requiredSuccessorEnd =
      predecessorEnd !== null && successorStart <= predecessorEnd
        ? predecessorEnd
        : STRATEGIC_PLAN_END_YEAR;
    if (parsed.successor.effective_end_year !== requiredSuccessorEnd) {
      throw new StrategyEditConflictError(
        `The successor must preserve continuous measurement coverage through ${requiredSuccessorEnd}.`,
        "successor_effective_coverage",
      );
    }

    const truncatedEnd = successorStart - 1;
    ensureConfigurationHistoryFits(
      parsed.predecessor_id,
      predecessorStart,
      truncatedEnd,
    );
    ensureNoConfigurationOverlap(
      kpiId,
      successorStart,
      parsed.successor.effective_end_year,
      parsed.predecessor_id,
    );

    if (predecessorEnd === null || predecessorEnd >= successorStart) {
      getDb()
        .prepare(
          `UPDATE kpi_measurement_configs
           SET effective_to_year = ?, updated_by = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .run(truncatedEnd, actorId, parsed.predecessor_id);
      const after = rawConfiguration(parsed.predecessor_id);
      const context = auditContextForKpi(kpiId);
      recordStrategicAuditEvent({
        entity_type: "measurement_config",
        entity_id: parsed.predecessor_id,
        event_type: "update",
        entity_display_name: `${context.kpi_name} measurement configuration`,
        parent_priority_name: context.priority_name,
        parent_goal_name: context.goal_name,
        previous_value: stableSnapshot(before, CONFIG_FIELDS),
        new_value: stableSnapshot(after, CONFIG_FIELDS),
        actor_id: actorId,
        source_reference: String(after.source_reference ?? "") || null,
      });
    }

    const successor = createMeasurementConfiguration(parsed.successor, actorId);
    cloneSuccessorComponents(reusableComponents, successor, actorId);
    return {
      predecessor: asMeasurementConfig(
        rawConfiguration(parsed.predecessor_id),
      ),
      successor,
    };
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
    const values = configurationValues(merged);
    const semanticFieldsChanged = fieldsChanged(
      before,
      values,
      CONFIG_CALCULATION_SEMANTIC_FIELDS,
    );
    if (
      (semanticFieldsChanged ||
        calculationStatusMeaningChanged(before, values)) &&
      configurationHasHistoricalValuesInRange(
        patch.id,
        merged.effective_start_year,
        merged.effective_end_year,
      )
    ) {
      rejectHistoricalSemanticEdit(
        "Historical values already use this calculation definition. Create a new effective-dated measurement configuration instead of editing it in place.",
      );
    }
    if (
      semanticFieldsChanged &&
      configurationHasDefinedTarget(
        Number(before.kpi_id),
        Math.min(Number(before.effective_from_year), merged.effective_start_year),
        Math.max(
          before.effective_to_year == null
            ? STRATEGIC_PLAN_END_YEAR
            : Number(before.effective_to_year),
          merged.effective_end_year ?? STRATEGIC_PLAN_END_YEAR,
        ),
      )
    ) {
      rejectHistoricalSemanticEdit(
        "Configured targets already use this calculation definition. Create an effective-dated successor and boundary targets instead of reinterpreting them in place.",
      );
    }
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
    assertFullPlanTargetConfigurationIntegrity({
      kpiId: Number(before.kpi_id),
      configurations: activeConfigurationRows(Number(before.kpi_id)).map(
        (configuration) =>
          Number(configuration.id) === patch.id
            ? { ...configuration, ...values }
            : configuration,
      ),
    });
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

const GOAL_COMPLETION_SEMANTIC_FIELDS = [
  "completion_rule",
  "threshold_count",
  "threshold_percentage",
] as const;

function goalHasHistoricalValuesInRange(
  goal: RawRow,
  requestedStart: number,
  requestedEnd: number,
): boolean {
  const memberships = getDb()
    .prepare(
      `SELECT kpi_id, effective_from_year, effective_to_year
       FROM goal_kpis
       WHERE goal_id = ? AND is_required = 1`,
    )
    .all(Number(goal.id)) as Array<{
    kpi_id: number;
    effective_from_year: number;
    effective_to_year: number | null;
  }>;
  const goalStart = Math.max(Number(goal.plan_start_year), requestedStart);
  const goalEnd = Math.min(Number(goal.plan_end_year), requestedEnd);
  return memberships.some((membership) => {
    const startYear = Math.max(goalStart, membership.effective_from_year);
    const endYear = Math.min(
      goalEnd,
      membership.effective_to_year ?? goalEnd,
    );
    return (
      startYear <= endYear &&
      kpiHasHistoricalValuesInRange(membership.kpi_id, startYear, endYear)
    );
  });
}

function goalHasHistoricalValues(goal: RawRow): boolean {
  return goalHasHistoricalValuesInRange(
    goal,
    Number(goal.plan_start_year),
    Number(goal.plan_end_year),
  );
}

function snapshotContainsManualGoalResult(value: string | null): boolean {
  if (!value) return false;
  try {
    const snapshot = JSON.parse(value) as Record<string, unknown>;
    return (
      snapshot.completion_rule === "manual_status" &&
      snapshot.manual_status !== null &&
      snapshot.manual_status !== undefined
    );
  } catch {
    return false;
  }
}

/**
 * A populated manual status proves that the manual completion rule has been
 * used historically. The status value remains operational and editable; this
 * guard exists to prevent the rule itself from being reinterpreted in place.
 */
function goalHasRecordedManualResult(goal: RawRow): boolean {
  if (
    goal.completion_rule === "manual_status" &&
    goal.manual_status !== null &&
    goal.manual_status !== undefined
  ) {
    return true;
  }
  const events = getDb()
    .prepare(
      `SELECT previous_value_json, new_value_json
       FROM strategic_audit_events
       WHERE entity_type = 'strategic_goal' AND entity_id = ?
       ORDER BY id DESC`,
    )
    .all(Number(goal.id)) as Array<{
    previous_value_json: string | null;
    new_value_json: string | null;
  }>;
  return events.some(
    (event) =>
      snapshotContainsManualGoalResult(event.previous_value_json) ||
      snapshotContainsManualGoalResult(event.new_value_json),
  );
}

function mergedStrategicGoal(
  before: RawRow,
  patch: z.output<typeof StrategicGoalSettingsUpdateSchema>,
) {
  return parse(
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
}

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
    const merged = mergedStrategicGoal(before, patch);
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
    if (
      (fieldsChanged(before, values, GOAL_COMPLETION_SEMANTIC_FIELDS) ||
        calculationStatusMeaningChanged(before, values)) &&
      (goalHasHistoricalValues(before) || goalHasRecordedManualResult(before))
    ) {
      rejectHistoricalSemanticEdit(
        "Historical values already use this goal's completion semantics. In-place rule and threshold changes are not allowed.",
      );
    }
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

const SuccessorStrategicGoalSchema = z
  .object({
    predecessor_id: z.number().int().positive(),
    effective_start_year: z.number().int().min(1900).max(2100),
    update: StrategicGoalSettingsUpdateSchema,
  })
  .strict();

export interface SuccessorStrategicGoalResult {
  predecessor: PersistedStrategicGoal;
  successor: PersistedStrategicGoal;
}

const GOAL_VERSION_FIELDS = [
  "plan_start_year",
  "plan_end_year",
  ...GOAL_SETTING_FIELDS,
] as const;

function availableSuccessorGoalSlug(baseSlug: string, startYear: number): string {
  const stem = `${baseSlug.slice(0, 80)}-from-${startYear}`;
  let candidate = stem;
  let suffix = 2;
  while (
    getDb()
      .prepare("SELECT 1 FROM strategic_goals WHERE slug = ?")
      .get(candidate)
  ) {
    candidate = `${stem}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/** Version a goal rule while retaining one effective goal for each plan year. */
export function createSuccessorStrategicGoal(
  input: unknown,
  actorId: number | null = null,
): SuccessorStrategicGoalResult {
  const parsed = parse(
    SuccessorStrategicGoalSchema,
    input,
    "Invalid successor strategic goal.",
  );
  return transaction(() => {
    const before = rawGoal(parsed.predecessor_id);
    requireEditable(before, "strategic goal");
    if (parsed.update.id !== parsed.predecessor_id) {
      throw new StrategyEditConflictError(
        "The successor update must reference its predecessor goal.",
        "successor_goal_mismatch",
      );
    }
    const predecessorStart = Number(before.plan_start_year);
    const predecessorEnd = Number(before.plan_end_year);
    const successorStart = parsed.effective_start_year;
    if (successorStart > STRATEGIC_PLAN_END_YEAR) {
      throw new StrategyEditConflictError(
        "Successor goals in this strategic-plan workflow must start by 2029.",
        "successor_outside_plan",
      );
    }
    if (successorStart <= predecessorStart || successorStart > predecessorEnd) {
      throw new StrategyEditConflictError(
        "The successor goal must start after the predecessor begins and within its plan range.",
        "invalid_successor_start",
      );
    }
    if (
      goalHasHistoricalValuesInRange(
        before,
        successorStart,
        predecessorEnd,
      )
    ) {
      rejectHistoricalSemanticEdit(
        "Historical values already use the predecessor goal during the requested successor range. Choose a later start year.",
      );
    }

    const merged = mergedStrategicGoal(before, parsed.update);
    const successorSlug = availableSuccessorGoalSlug(
      String(before.slug),
      successorStart,
    );
    getDb()
      .prepare(
        `UPDATE strategic_goals
         SET plan_end_year = ?, updated_by = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(successorStart - 1, actorId, parsed.predecessor_id);

    const successorResult = getDb()
      .prepare(
        `INSERT INTO strategic_goals (
           priority_id, slug, name, description, plan_start_year, plan_end_year,
           completion_rule, threshold_count, threshold_percentage, manual_status,
           board_level_status, configuration_status, unresolved_question,
           owner, due_date, resolution_notes, source_reference,
           last_reviewed_date, sort_order, created_by, updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        Number(before.priority_id),
        successorSlug,
        String(before.name),
        before.description ?? null,
        successorStart,
        predecessorEnd,
        merged.completion_rule,
        merged.threshold_count,
        merged.threshold_percentage,
        merged.manual_status,
        merged.board_level_status,
        merged.configuration_status,
        merged.unresolved_question,
        merged.owner,
        merged.due_date,
        merged.resolution_notes,
        merged.source_reference,
        merged.last_reviewed_date,
        Number(before.sort_order),
        actorId,
        actorId,
      );
    const successorId = Number(successorResult.lastInsertRowid);

    const membershipIds = getDb()
      .prepare(
        `SELECT id FROM goal_kpis
         WHERE goal_id = ? AND archived_at IS NULL
           AND effective_from_year <= ?
           AND (effective_to_year IS NULL OR effective_to_year >= ?)
         ORDER BY display_order, id`,
      )
      .all(parsed.predecessor_id, predecessorEnd, successorStart) as Array<{
      id: number;
    }>;
    for (const { id } of membershipIds) {
      const membershipBefore = rawGoalMembership(id);
      const memberStart = Number(membershipBefore.effective_from_year);
      const memberEnd =
        membershipBefore.effective_to_year == null
          ? null
          : Number(membershipBefore.effective_to_year);
      const successorMemberStart = Math.max(successorStart, memberStart);
      const successorMemberEnd =
        memberEnd === null ? null : Math.min(predecessorEnd, memberEnd);

      if (memberStart < successorStart) {
        getDb()
          .prepare(
            `UPDATE goal_kpis
             SET effective_to_year = ?, updated_by = ?, updated_at = datetime('now')
             WHERE id = ?`,
          )
          .run(successorStart - 1, actorId, id);
        const membershipAfter = rawGoalMembership(id);
        recordStrategicAuditEvent({
          entity_type: "goal_membership",
          entity_id: id,
          event_type: "update",
          entity_display_name: `${String(membershipAfter.kpi_name)} membership`,
          parent_priority_name: String(membershipAfter.priority_name),
          parent_goal_name: String(membershipAfter.goal_name),
          previous_value: stableSnapshot(membershipBefore, [
            "is_required",
            "weight",
            "display_order",
            "effective_from_year",
            "effective_to_year",
          ]),
          new_value: {
            ...stableSnapshot(membershipAfter, [
              "is_required",
              "weight",
              "display_order",
              "effective_from_year",
              "effective_to_year",
            ]),
            successor_goal_id: successorId,
          },
          actor_id: actorId,
          source_reference:
            String(membershipAfter.goal_source_reference ?? "") || null,
        });
      }

      const inserted = getDb()
        .prepare(
          `INSERT INTO goal_kpis (
             goal_id, kpi_id, is_required, weight, display_order,
             effective_from_year, effective_to_year, created_by, updated_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          successorId,
          Number(membershipBefore.kpi_id),
          Number(membershipBefore.is_required),
          Number(membershipBefore.weight),
          Number(membershipBefore.display_order),
          successorMemberStart,
          successorMemberEnd,
          actorId,
          actorId,
        );
      const successorMembership = rawGoalMembership(
        Number(inserted.lastInsertRowid),
      );
      recordStrategicAuditEvent({
        entity_type: "goal_membership",
        entity_id: Number(successorMembership.id),
        event_type: "create",
        entity_display_name: `${String(successorMembership.kpi_name)} membership`,
        parent_priority_name: String(successorMembership.priority_name),
        parent_goal_name: String(successorMembership.goal_name),
        previous_value: {
          predecessor_membership_id: id,
          predecessor_goal_id: parsed.predecessor_id,
        },
        new_value: stableSnapshot(successorMembership, [
          "is_required",
          "weight",
          "display_order",
          "effective_from_year",
          "effective_to_year",
        ]),
        actor_id: actorId,
        source_reference:
          String(successorMembership.goal_source_reference ?? "") || null,
      });
    }

    const predecessor = rawGoal(parsed.predecessor_id);
    const successor = rawGoal(successorId);
    recordStrategicAuditEvent({
      entity_type: "strategic_goal",
      entity_id: parsed.predecessor_id,
      event_type: "update",
      entity_display_name: String(predecessor.name),
      parent_priority_name: String(predecessor.priority_name),
      parent_goal_name: String(predecessor.name),
      previous_value: stableSnapshot(before, GOAL_VERSION_FIELDS),
      new_value: {
        ...stableSnapshot(predecessor, GOAL_VERSION_FIELDS),
        successor_goal_id: successorId,
      },
      actor_id: actorId,
      source_reference: String(predecessor.source_reference ?? "") || null,
    });
    recordStrategicAuditEvent({
      entity_type: "strategic_goal",
      entity_id: successorId,
      event_type: "create",
      entity_display_name: String(successor.name),
      parent_priority_name: String(successor.priority_name),
      parent_goal_name: String(successor.name),
      previous_value: { predecessor_goal_id: parsed.predecessor_id },
      new_value: stableSnapshot(successor, GOAL_VERSION_FIELDS),
      actor_id: actorId,
      source_reference: String(successor.source_reference ?? "") || null,
    });
    return {
      predecessor: asStrategicGoal(predecessor),
      successor: asStrategicGoal(successor),
    };
  });
}

const GOAL_MEMBERSHIP_SETTING_FIELDS = [
  "is_required",
  "weight",
  "display_order",
] as const;

const GOAL_MEMBERSHIP_SEMANTIC_FIELDS = ["is_required", "weight"] as const;

export interface AppendStrategicGoalMembershipInput {
  goal_id: number;
  role: "required" | "informational";
  weight?: number | null;
  effective_start_year: number;
  effective_end_year?: number | null;
}

export interface StrategicGoalMembershipCatalogContext {
  kpi_id: number;
  priority_id: number;
  kpi_archived_at: string | null;
  priority_archived_at: string | null;
}

/**
 * Append a catalog-owned KPI identity to a strategic goal. The catalog caller
 * supplies its current lifecycle context; this feature owns membership order,
 * effective dates, persistence, and audit history.
 */
export function appendStrategicGoalMembership(
  input: AppendStrategicGoalMembershipInput,
  catalog: StrategicGoalMembershipCatalogContext,
  actorId: number | null = null,
): PersistedGoalMembership {
  return transaction(() => {
    const goal = rawGoal(input.goal_id);
    const displayOrder = Number(
      (
        getDb()
          .prepare(
            `SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order
             FROM goal_kpis
             WHERE goal_id = ? AND archived_at IS NULL`,
          )
          .get(input.goal_id) as { next_order: number }
      ).next_order,
    );
    const parsed = parse(
      StrategicGoalMembershipInputSchema,
      {
        ...input,
        kpi_id: catalog.kpi_id,
        display_order: displayOrder,
      },
      "Invalid strategic goal membership.",
    );
    if (
      goal.archived_at != null ||
      catalog.kpi_archived_at != null ||
      catalog.priority_archived_at != null
    ) {
      throw new StrategyEditConflictError(
        "Restore the measure, goal, and Strategic Priority before assigning the measure.",
        "archived_membership_context",
      );
    }
    if (Number(goal.priority_id) !== catalog.priority_id) {
      throw new StrategyEditConflictError(
        "The measure and goal must belong to the same Strategic Priority.",
        "membership_priority_mismatch",
      );
    }
    const effectiveEnd = parsed.effective_end_year ?? Number(goal.plan_end_year);
    if (
      parsed.effective_start_year < Number(goal.plan_start_year) ||
      effectiveEnd > Number(goal.plan_end_year)
    ) {
      throw new StrategyEditConflictError(
        "The measure assignment must stay within the goal's plan years.",
        "membership_outside_goal_range",
      );
    }
    const overlap = getDb()
      .prepare(
        `SELECT id FROM goal_kpis
         WHERE goal_id = ? AND kpi_id = ?
           AND effective_from_year <= ?
           AND (effective_to_year IS NULL OR effective_to_year >= ?)
         LIMIT 1`,
      )
      .get(
        parsed.goal_id,
        parsed.kpi_id,
        effectiveEnd,
        parsed.effective_start_year,
      ) as { id: number } | undefined;
    if (overlap) {
      throw new StrategyEditConflictError(
        `The measure is already assigned to this goal during membership ${overlap.id}.`,
        "effective_range_overlap",
      );
    }

    const inserted = getDb()
      .prepare(
        `INSERT INTO goal_kpis (
           goal_id, kpi_id, is_required, weight, display_order,
           effective_from_year, effective_to_year, created_by, updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        parsed.goal_id,
        parsed.kpi_id,
        parsed.role === "required" ? 1 : 0,
        parsed.weight ?? 1,
        parsed.display_order,
        parsed.effective_start_year,
        effectiveEnd,
        actorId,
        actorId,
      );
    const after = rawGoalMembership(Number(inserted.lastInsertRowid));
    const fields = [
      ...GOAL_MEMBERSHIP_SETTING_FIELDS,
      "effective_from_year",
      "effective_to_year",
    ] as const;
    recordStrategicAuditEvent({
      entity_type: "goal_membership",
      entity_id: Number(after.id),
      event_type: "create",
      entity_display_name: `${String(after.kpi_name)} membership`,
      parent_priority_name: String(after.priority_name),
      parent_goal_name: String(after.goal_name),
      previous_value: null,
      new_value: stableSnapshot(after, fields),
      actor_id: actorId,
      source_reference: String(after.goal_source_reference ?? "") || null,
    });
    return asGoalMembership(after);
  });
}

function membershipHasHistoricalValues(membership: RawRow): boolean {
  const startYear = Math.max(
    Number(membership.effective_from_year),
    Number(membership.goal_plan_start_year),
  );
  const endYear = Math.min(
    membership.effective_to_year == null
      ? Number(membership.goal_plan_end_year)
      : Number(membership.effective_to_year),
    Number(membership.goal_plan_end_year),
  );
  return (
    startYear <= endYear &&
    kpiHasHistoricalValuesInRange(
      Number(membership.kpi_id),
      startYear,
      endYear,
    )
  );
}

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
    if (
      fieldsChanged(before, values, GOAL_MEMBERSHIP_SEMANTIC_FIELDS) &&
      membershipHasHistoricalValues(before)
    ) {
      rejectHistoricalSemanticEdit(
        "Historical values already use this goal membership. In-place role and weight changes are not allowed.",
      );
    }
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

const SuccessorStrategicGoalMembershipSchema = z
  .object({
    predecessor_id: z.number().int().positive(),
    effective_start_year: z.number().int().min(1900).max(2100),
    role: z.enum(["required", "informational"]),
    weight: z.number().finite().positive(),
    display_order: z.number().int().nonnegative(),
  })
  .strict();

export interface SuccessorStrategicGoalMembershipResult {
  predecessor: PersistedGoalMembership;
  successor: PersistedGoalMembership;
}

export function createSuccessorStrategicGoalMembership(
  input: unknown,
  actorId: number | null = null,
): SuccessorStrategicGoalMembershipResult {
  const parsed = parse(
    SuccessorStrategicGoalMembershipSchema,
    input,
    "Invalid successor strategic goal membership.",
  );
  return transaction(() => {
    const before = rawGoalMembership(parsed.predecessor_id);
    if (
      before.archived_at != null ||
      before.goal_archived_at != null ||
      before.kpi_archived_at != null ||
      before.priority_archived_at != null
    ) {
      throw new StrategyEditConflictError(
        "Restore the membership and its strategic-plan parents before versioning it.",
        "archived_membership_context",
      );
    }

    const predecessorStart = Number(before.effective_from_year);
    const predecessorEnd =
      before.effective_to_year == null
        ? null
        : Number(before.effective_to_year);
    const goalEnd = Number(before.goal_plan_end_year);
    const successorStart = parsed.effective_start_year;
    const effectiveEnd = predecessorEnd ?? goalEnd;
    if (successorStart > STRATEGIC_PLAN_END_YEAR) {
      throw new StrategyEditConflictError(
        "Successor memberships in this strategic-plan workflow must start by 2029.",
        "successor_outside_plan",
      );
    }
    if (
      successorStart <= predecessorStart ||
      successorStart > effectiveEnd ||
      successorStart > goalEnd
    ) {
      throw new StrategyEditConflictError(
        "The successor membership must start after the predecessor begins and within its effective goal range.",
        "invalid_successor_start",
      );
    }
    if (
      kpiHasHistoricalValuesInRange(
        Number(before.kpi_id),
        successorStart,
        Math.min(effectiveEnd, goalEnd),
      )
    ) {
      rejectHistoricalSemanticEdit(
        "Historical values already use this membership during the requested successor range. Choose a later start year.",
      );
    }

    const overlap = getDb()
      .prepare(
        `SELECT id FROM goal_kpis
         WHERE goal_id = ? AND kpi_id = ? AND id <> ?
           AND effective_from_year <= ?
           AND (effective_to_year IS NULL OR effective_to_year >= ?)
         LIMIT 1`,
      )
      .get(
        Number(before.goal_id),
        Number(before.kpi_id),
        parsed.predecessor_id,
        predecessorEnd ?? 2100,
        successorStart,
      ) as { id: number } | undefined;
    if (overlap) {
      throw new StrategyEditConflictError(
        `Successor membership overlaps membership ${overlap.id}.`,
        "effective_range_overlap",
      );
    }

    getDb()
      .prepare(
        `UPDATE goal_kpis
         SET effective_to_year = ?, updated_by = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(successorStart - 1, actorId, parsed.predecessor_id);
    const inserted = getDb()
      .prepare(
        `INSERT INTO goal_kpis (
           goal_id, kpi_id, is_required, weight, display_order,
           effective_from_year, effective_to_year, created_by, updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        Number(before.goal_id),
        Number(before.kpi_id),
        parsed.role === "required" ? 1 : 0,
        parsed.weight,
        parsed.display_order,
        successorStart,
        predecessorEnd,
        actorId,
        actorId,
      );
    const predecessor = rawGoalMembership(parsed.predecessor_id);
    const successor = rawGoalMembership(Number(inserted.lastInsertRowid));
    const fields = [
      ...GOAL_MEMBERSHIP_SETTING_FIELDS,
      "effective_from_year",
      "effective_to_year",
    ] as const;
    recordStrategicAuditEvent({
      entity_type: "goal_membership",
      entity_id: parsed.predecessor_id,
      event_type: "update",
      entity_display_name: `${String(predecessor.kpi_name)} membership`,
      parent_priority_name: String(predecessor.priority_name),
      parent_goal_name: String(predecessor.goal_name),
      previous_value: stableSnapshot(before, fields),
      new_value: {
        ...stableSnapshot(predecessor, fields),
        successor_membership_id: Number(successor.id),
      },
      actor_id: actorId,
      source_reference:
        String(predecessor.goal_source_reference ?? "") || null,
    });
    recordStrategicAuditEvent({
      entity_type: "goal_membership",
      entity_id: Number(successor.id),
      event_type: "create",
      entity_display_name: `${String(successor.kpi_name)} membership`,
      parent_priority_name: String(successor.priority_name),
      parent_goal_name: String(successor.goal_name),
      previous_value: {
        predecessor_membership_id: parsed.predecessor_id,
      },
      new_value: stableSnapshot(successor, fields),
      actor_id: actorId,
      source_reference: String(successor.goal_source_reference ?? "") || null,
    });
    return {
      predecessor: asGoalMembership(predecessor),
      successor: asGoalMembership(successor),
    };
  });
}

function targetSubject(
  target: Pick<
    ValidatedStrategicTargetCreate,
    "kpi_id" | "component_id" | "target_scope" | "reporting_year" | "target_year"
  >,
): TargetSubject {
  const { kpi_id: kpiId, component_id: componentId } = target;
  if (kpiId != null) {
    const kpi = getDb()
      .prepare("SELECT id, archived_at FROM kpis WHERE id = ?")
      .get(kpiId) as { id: number; archived_at: string | null } | undefined;
    if (!kpi) throw new StrategyEditNotFoundError("kpi", kpiId);
    const applicableConfigurationYear =
      target.target_scope === "annual"
        ? target.reporting_year ?? target.target_year
        : target.target_year;
    const configurationYear = Math.min(
      Math.max(applicableConfigurationYear, STRATEGIC_PLAN_START_YEAR),
      STRATEGIC_PLAN_END_YEAR,
    );
    const config = getDb()
      .prepare(
        `SELECT measurement_type, archived_at
         FROM kpi_measurement_configs
         WHERE kpi_id = ?
           AND effective_from_year <= ?
           AND (effective_to_year IS NULL OR effective_to_year >= ?)
           AND archived_at IS NULL
         ORDER BY effective_from_year DESC, id DESC LIMIT 1`,
      )
      .get(kpiId, configurationYear, configurationYear) as
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
  const domainValue = resolveConfiguredTargetValue({
    measurementType: subject.measurement_type,
    targetValue: target.target_value,
    structuredTarget: target.structured_target,
    targetDescription: target.target_description,
    // Domain constraints apply even while a Target is still a draft.
    configurationStatus: "active",
  });
  if (
    subject.measurement_type === "percentage" &&
    domainValue !== null &&
    (domainValue < 0 || domainValue > 100)
  ) {
    throw new StrategyEditValidationError("Invalid strategic target.", [
      { path: "target_value", message: "Percentage targets must be between 0 and 100." },
    ]);
  }
  if (
    subject.measurement_type === "binary" &&
    domainValue !== null &&
    domainValue !== 0 &&
    domainValue !== 1
  ) {
    throw new StrategyEditValidationError("Invalid strategic target.", [
      { path: "target_value", message: "Binary targets must resolve to 0 or 1." },
    ]);
  }
  if (
    (target.configuration_status === "ready" ||
      target.configuration_status === "active") &&
    domainValue === null
  ) {
    throw new StrategyEditValidationError("Invalid strategic target.", [
      {
        path: "target_value",
        message:
          "Ready and active targets require a calculable numeric or supported structured value.",
      },
    ]);
  }
}

/** Removing a boundary Target must not make another KPI-scoped target cross definitions. */
export function assertStrategyEntityArchiveIntegrity(
  kind: "component" | "target",
  id: number,
): void {
  if (kind === "component") {
    assertComponentTargetSemanticsMutable(rawComponent(id));
    return;
  }
  const target = rawTarget(id);
  if (
    target.kpi_id == null ||
    target.component_id != null ||
    target.target_scope !== "full_plan"
  ) {
    return;
  }
  const kpiId = Number(target.kpi_id);
  assertFullPlanTargetConfigurationIntegrity({
    kpiId,
    targets: activeParentTargetRows(kpiId).filter(
      (candidate) => Number(candidate.id) !== id,
    ),
  });
}

/**
 * Re-run temporal invariants before a generic archive lifecycle operation
 * makes a configuration or Target effective again. Archived rows can be
 * edited around by active rows, so restoration must be held to the same
 * semantic-boundary rules as create and update.
 */
export function assertStrategyEntityRestoreIntegrity(
  kind: "measurement_config" | "component" | "target",
  id: number,
  restoredStatus: ConfigurationStatus,
): void {
  if (kind === "measurement_config") {
    const configuration = rawConfiguration(id);
    const kpiId = Number(configuration.kpi_id);
    ensureNoConfigurationOverlap(
      kpiId,
      Number(configuration.effective_from_year),
      configuration.effective_to_year == null
        ? null
        : Number(configuration.effective_to_year),
      id,
    );
    assertFullPlanTargetConfigurationIntegrity({
      kpiId,
      configurations: [
        ...activeConfigurationRows(kpiId).filter(
          (candidate) => Number(candidate.id) !== id,
        ),
        {
          ...configuration,
          archived_at: null,
          configuration_status: restoredStatus,
        },
      ],
    });
    return;
  }

  if (kind === "component") {
    assertComponentTargetSemanticsMutable(rawComponent(id));
    return;
  }

  const target = rawTarget(id);
  const candidate: RawRow = {
    ...target,
    archived_at: null,
    configuration_status: restoredStatus,
  };
  const subject = targetSubject({
    kpi_id: target.kpi_id == null ? null : Number(target.kpi_id),
    component_id:
      target.component_id == null ? null : Number(target.component_id),
    target_scope: String(target.target_scope) as "annual" | "full_plan",
    reporting_year:
      target.reporting_year == null ? null : Number(target.reporting_year),
    target_year: Number(target.target_year),
  });
  if (subject.archived) {
    throw new StrategyEditConflictError(
      "Restore the target subject before restoring its target.",
      "archived_target_subject",
    );
  }
  try {
    validateTargetMeasurement(
      mergedTarget(candidate, { id }),
      subject,
    );
  } catch (error) {
    if (error instanceof StrategyEditValidationError) {
      throw new StrategyEditConflictError(
        `Target ${id} is incompatible with its current measurement definition. ${error.issues.map((issue) => issue.message).join(" ")}`,
        "target_measurement_incompatible",
      );
    }
    throw error;
  }
  if (
    subject.kpi_id !== null &&
    candidate.target_scope === "full_plan"
  ) {
    assertFullPlanTargetConfigurationIntegrity({
      kpiId: subject.kpi_id,
      targets: [
        ...activeParentTargetRows(subject.kpi_id).filter(
          (active) => Number(active.id) !== id,
        ),
        candidate,
      ],
    });
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
    const subject = targetSubject(parsed);
    validateTargetMeasurement(parsed, subject);
    ensureNoTargetConflict(parsed, null);
    const values = targetValues(parsed);
    if (subject.kpi_id !== null && parsed.target_scope === "full_plan") {
      assertFullPlanTargetConfigurationIntegrity({
        kpiId: subject.kpi_id,
        targets: [
          ...activeParentTargetRows(subject.kpi_id),
          {
            id: Number.MAX_SAFE_INTEGER,
            kpi_id: subject.kpi_id,
            component_id: null,
            archived_at: null,
            ...values,
          },
        ],
      });
    }
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
    const subject = targetSubject(merged);
    validateTargetMeasurement(merged, subject);
    ensureNoTargetConflict(merged, patch.id);
    const values = targetValues(merged);
    if (subject.kpi_id !== null) {
      const targets = activeParentTargetRows(subject.kpi_id).filter(
        (target) => Number(target.id) !== patch.id,
      );
      if (merged.target_scope === "full_plan") {
        targets.push({
          ...before,
          ...values,
          id: patch.id,
          kpi_id: subject.kpi_id,
          component_id: null,
        });
      }
      assertFullPlanTargetConfigurationIntegrity({
        kpiId: subject.kpi_id,
        targets,
      });
    }
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
  "aggregation_role",
  "weight",
  "display_order",
  "configuration_status",
  "unresolved_question",
] as const;

const COMPONENT_CALCULATION_SEMANTIC_FIELDS = [
  "label",
  "measurement_type",
  "unit",
  "numerator_label",
  "denominator_label",
  "fixed_denominator",
  "baseline_value",
  "previous_period_value",
  "aggregation_role",
  "weight",
] as const;

function componentHasHistoricalValues(id: number): boolean {
  return Boolean(
    getDb()
      .prepare(
        `SELECT 1 AS present FROM kpi_component_entries
         WHERE component_id = ?
         UNION ALL
         SELECT 1 AS present FROM distribution_observations
         WHERE component_id = ?
         UNION ALL
         SELECT 1 AS present
         FROM kpi_components component
         JOIN kpi_measurement_configs config
           ON config.id = component.configuration_id
         JOIN monthly_entries entry ON entry.kpi_id = component.kpi_id
         WHERE component.id = ?
           AND entry.year >= config.effective_from_year
           AND (config.effective_to_year IS NULL OR entry.year <= config.effective_to_year)
         UNION ALL
         SELECT 1 AS present
         FROM kpi_components component
         JOIN kpi_measurement_configs config
           ON config.id = component.configuration_id
         JOIN breakdown_entries entry ON entry.kpi_id = component.kpi_id
         WHERE component.id = ?
           AND entry.year >= config.effective_from_year
           AND (config.effective_to_year IS NULL OR entry.year <= config.effective_to_year)
         LIMIT 1`,
      )
      .get(id, id, id, id),
  );
}

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
    componentDefinitionInput(component, config, target),
    "Invalid strategy component.",
  );
}

function componentDefinitionInput(
  component: Record<string, unknown>,
  config: RawRow,
  target: RawRow | null,
) {
  return {
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
    aggregation_role: component.aggregation_role ?? "value",
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
  };
}

function validateSuccessorComponentSet(
  components: RawRow[],
  successor: ValidatedMeasurementConfigurationCreate,
): void {
  const proposedConfig: RawRow = {
    id: Number.MAX_SAFE_INTEGER,
    kpi_id: successor.kpi_id,
    ...configurationValues(successor),
  };
  const inputs = components.map((component) => {
    const targets = getDb()
      .prepare(
        `SELECT * FROM kpi_targets
         WHERE component_id = ? AND kpi_id IS NULL AND archived_at IS NULL
           AND configuration_status <> 'archived'
         ORDER BY target_scope, reporting_year, target_year, id`,
      )
      .all(Number(component.id)) as RawRow[];
    const applicableTarget = targets.find((target) =>
      successorTargetApplies(
        target,
        targets,
        successor.effective_start_year,
        successor.effective_end_year!,
      ),
    ) ?? null;
    const validationTarget = applicableTarget === null
      ? null
      : {
          ...applicableTarget,
          target_year: Math.min(
            Math.max(Number(applicableTarget.target_year), STRATEGIC_PLAN_START_YEAR),
            STRATEGIC_PLAN_END_YEAR,
          ),
        };
    return componentDefinitionInput(component, proposedConfig, validationTarget);
  });
  const result = ComponentSetInputSchema.safeParse({
    parent_kpi_id: successor.kpi_id,
    aggregation_method: successor.aggregation_method,
    components: inputs,
  });
  if (!result.success) {
    throw new StrategyEditConflictError(
      `The cloned component set is incompatible with the successor aggregation: ${result.error.issues.map((issue) => issue.message).join(" ")}`,
      "successor_component_set_incompatible",
    );
  }
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

function configurationHasAnyDefinedComponentTarget(
  configurationId: number,
): boolean {
  return (getDb()
    .prepare(
      `SELECT target.*
       FROM kpi_targets target
       JOIN kpi_components component ON component.id = target.component_id
       WHERE component.configuration_id = ?
         AND target.kpi_id IS NULL AND target.archived_at IS NULL`,
    )
    .all(configurationId) as RawRow[]).some(targetCarriesDefinedSemantics);
}

function componentParentHasDefinedTarget(component: RawRow): boolean {
  const config = rawConfiguration(Number(component.configuration_id));
  return configurationHasDefinedTarget(
    Number(component.kpi_id),
    Number(config.effective_from_year),
    config.effective_to_year == null
      ? null
      : Number(config.effective_to_year),
  );
}

function assertComponentTargetSemanticsMutable(component: RawRow): void {
  if (
    componentParentHasDefinedTarget(component) ||
    configurationHasAnyDefinedComponentTarget(
      Number(component.configuration_id),
    )
  ) {
    throw new StrategyEditConflictError(
      "Configured targets already use this component definition. Create an effective-dated successor or archive the affected targets before changing the component set.",
      "target_component_semantics_conflict",
    );
  }
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
    if (
      configurationHasHistoricalValuesInRange(
        parsed.configuration_id,
        Number(config.effective_from_year),
        config.effective_to_year == null
          ? null
          : Number(config.effective_to_year),
      )
    ) {
      rejectHistoricalSemanticEdit(
        "Historical values already use this component set. Create an effective-dated successor before adding a component.",
      );
    }
    if (
      configurationHasDefinedTarget(
        Number(config.kpi_id),
        Number(config.effective_from_year),
        config.effective_to_year == null
          ? null
          : Number(config.effective_to_year),
      ) ||
      configurationHasAnyDefinedComponentTarget(parsed.configuration_id)
    ) {
      throw new StrategyEditConflictError(
        "Configured parent targets already use this component set. Create an effective-dated successor before adding a component.",
        "target_component_semantics_conflict",
      );
    }
    const duplicate = getDb()
      .prepare(
        "SELECT id FROM kpi_components WHERE configuration_id = ? AND slug = ?",
      )
      .get(parsed.configuration_id, parsed.slug) as { id: number } | undefined;
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
      aggregation_role: parsed.aggregation_role,
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
    aggregation_role: value("aggregation_role"),
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
    const values = Object.fromEntries(
      COMPONENT_FIELDS.map((field) => [field, merged[field]]),
    );
    const componentSemanticsChanged =
      fieldsChanged(before, values, COMPONENT_CALCULATION_SEMANTIC_FIELDS) ||
      calculationStatusMeaningChanged(before, values);
    const targetValueSemanticsChanged = fieldsChanged(
      before,
      values,
      COMPONENT_CALCULATION_SEMANTIC_FIELDS.filter(
        (field) => field !== "label",
      ),
    );
    if (
      (componentSemanticsChanged && componentParentHasDefinedTarget(before)) ||
      (targetValueSemanticsChanged &&
        configurationHasAnyDefinedComponentTarget(
          Number(before.configuration_id),
        ))
    ) {
      throw new StrategyEditConflictError(
        "Configured targets already use this component definition. Create an effective-dated successor before changing its calculation semantics.",
        "target_component_semantics_conflict",
      );
    }
    if (
      componentSemanticsChanged &&
      componentHasHistoricalValues(patch.id)
    ) {
      rejectHistoricalSemanticEdit(
        "Historical values already use this component calculation definition. Create a new effective-dated measurement configuration instead of editing it in place.",
      );
    }
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
