import type {
  AggregationMethod,
  BoardStatus,
  ConfigurationStatus,
  GoalCompletionRule,
  GoalManualStatus,
  GoalMembershipRole,
  MeasurementType,
  StrategyAuditAction,
  StrategyAuditEntityType,
  StrategyJsonValue,
  StrategyReportingFrequency,
  TargetScope,
} from "./types";

export interface PersistedStrategicGoal {
  id: number;
  priority_id: number;
  priority_slug: string;
  priority_name: string;
  slug: string;
  name: string;
  description: string | null;
  plan_start_year: number;
  plan_end_year: number;
  completion_rule: GoalCompletionRule;
  threshold_count: number | null;
  threshold_percentage: number | null;
  manual_status: GoalManualStatus | null;
  board_level_status: BoardStatus;
  configuration_status: ConfigurationStatus;
  unresolved_question: string | null;
  owner: string | null;
  due_date: string | null;
  resolution_notes: string | null;
  source_reference: string | null;
  last_reviewed_date: string | null;
  sort_order: number;
  archived_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_by: number | null;
  updated_at: string;
}

export interface PersistedGoalMembership {
  id: number;
  goal_id: number;
  kpi_id: number;
  role: GoalMembershipRole;
  weight: number;
  display_order: number;
  effective_from_year: number;
  effective_to_year: number | null;
  archived_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_by: number | null;
  updated_at: string;
}

export interface PersistedMeasurementConfig {
  id: number;
  kpi_id: number;
  effective_from_year: number;
  effective_to_year: number | null;
  measurement_type: MeasurementType | null;
  unit: string | null;
  numerator_label: string | null;
  denominator_label: string | null;
  fixed_denominator: number | null;
  baseline_value: number | null;
  reporting_frequency: StrategyReportingFrequency | null;
  aggregation_method: AggregationMethod | null;
  board_level_status: BoardStatus | null;
  calculation_precision: number;
  configuration_status: ConfigurationStatus;
  unresolved_question: string | null;
  owner: string | null;
  due_date: string | null;
  resolution_notes: string | null;
  source_reference: string | null;
  last_reviewed_date: string | null;
  allow_score_over_max: boolean;
  archived_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_by: number | null;
  updated_at: string;
}

export interface PersistedComponent {
  id: number;
  kpi_id: number;
  configuration_id: number;
  slug: string;
  label: string;
  measurement_type: MeasurementType | null;
  unit: string | null;
  numerator_label: string | null;
  denominator_label: string | null;
  fixed_denominator: number | null;
  baseline_value: number | null;
  previous_period_value: number | null;
  weight: number;
  display_order: number;
  configuration_status: ConfigurationStatus;
  unresolved_question: string | null;
  archived_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_by: number | null;
  updated_at: string;
}

export interface PersistedTarget {
  id: number;
  kpi_id: number | null;
  component_id: number | null;
  target_scope: TargetScope;
  reporting_year: number | null;
  target_year: number;
  external_target_year: boolean;
  target_value: number | null;
  structured_target: Record<string, StrategyJsonValue> | null;
  target_description: string | null;
  baseline_year: number | null;
  baseline_value: number | null;
  configuration_status: ConfigurationStatus;
  source_reference: string | null;
  last_reviewed_date: string | null;
  archived_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_by: number | null;
  updated_at: string;
}

export interface StrategyKpiIdentity {
  id: number;
  slug: string;
  name: string;
  unit: string;
  category_id: number;
  category_slug: string;
  category_name: string;
}

export interface StrategyComponentWithTargets extends PersistedComponent {
  targets: PersistedTarget[];
}

export interface StrategicGoalMemberReadModel extends PersistedGoalMembership {
  kpi: StrategyKpiIdentity;
  configuration: PersistedMeasurementConfig | null;
  targets: PersistedTarget[];
  components: StrategyComponentWithTargets[];
}

export interface StrategicGoalReadModel extends PersistedStrategicGoal {
  members: StrategicGoalMemberReadModel[];
}

export interface ConfigurationGapRow {
  kpi: StrategyKpiIdentity;
  goal_id: number;
  goal_slug: string;
  goal_name: string;
  priority_id: number;
  priority_slug: string;
  priority_name: string;
  configuration: PersistedMeasurementConfig;
  target_years: number[];
  missing_measurement_type: boolean;
  missing_formula: boolean;
  missing_components: boolean;
  missing_target: boolean;
  missing_denominator: boolean;
  missing_target_year: boolean;
  exclusion_reasons: string[];
}

export interface ConfigurationGapCounts {
  ready_kpis: number;
  active_kpis: number;
  kpis_needing_targets: number;
  kpis_needing_definitions: number;
  goals_excluded_from_completion: number;
  archived_kpis: number;
}

export interface StrategicAuditEvent {
  id: number;
  entity_type: StrategyAuditEntityType;
  entity_id: number;
  event_type: StrategyAuditAction;
  entity_display_name: string;
  parent_priority_name: string | null;
  parent_goal_name: string | null;
  previous_value: StrategyJsonValue | null;
  new_value: StrategyJsonValue | null;
  actor_id: number | null;
  actor_email_snapshot: string | null;
  source_reference: string | null;
  occurred_at: string;
}

function numberOrNull(value: unknown): number | null {
  return value == null ? null : Number(value);
}

function stringOrNull(value: unknown): string | null {
  return value == null ? null : String(value);
}

function parseJsonObject(value: unknown): Record<string, StrategyJsonValue> | null {
  if (value == null || value === "") return null;
  try {
    const parsed = JSON.parse(String(value)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, StrategyJsonValue>)
      : null;
  } catch {
    return null;
  }
}

function parseJsonValue(value: unknown): StrategyJsonValue | null {
  if (value == null || value === "") return null;
  try {
    return JSON.parse(String(value)) as StrategyJsonValue;
  } catch {
    return null;
  }
}

export function asStrategicGoal(row: Record<string, unknown>): PersistedStrategicGoal {
  return {
    id: Number(row.id),
    priority_id: Number(row.priority_id),
    priority_slug: String(row.priority_slug ?? ""),
    priority_name: String(row.priority_name ?? ""),
    slug: String(row.slug),
    name: String(row.name),
    description: stringOrNull(row.description),
    plan_start_year: Number(row.plan_start_year),
    plan_end_year: Number(row.plan_end_year),
    completion_rule: String(row.completion_rule) as GoalCompletionRule,
    threshold_count: numberOrNull(row.threshold_count),
    threshold_percentage: numberOrNull(row.threshold_percentage),
    manual_status: stringOrNull(row.manual_status) as GoalManualStatus | null,
    board_level_status: String(row.board_level_status) as BoardStatus,
    configuration_status: String(row.configuration_status) as ConfigurationStatus,
    unresolved_question: stringOrNull(row.unresolved_question),
    owner: stringOrNull(row.owner),
    due_date: stringOrNull(row.due_date),
    resolution_notes: stringOrNull(row.resolution_notes),
    source_reference: stringOrNull(row.source_reference),
    last_reviewed_date: stringOrNull(row.last_reviewed_date),
    sort_order: Number(row.sort_order ?? 0),
    archived_at: stringOrNull(row.archived_at),
    created_by: numberOrNull(row.created_by),
    created_at: String(row.created_at),
    updated_by: numberOrNull(row.updated_by),
    updated_at: String(row.updated_at),
  };
}

export function asGoalMembership(
  row: Record<string, unknown>,
): PersistedGoalMembership {
  return {
    id: Number(row.id),
    goal_id: Number(row.goal_id),
    kpi_id: Number(row.kpi_id),
    role: Number(row.is_required) === 1 ? "required" : "informational",
    weight: Number(row.weight),
    display_order: Number(row.display_order),
    effective_from_year: Number(row.effective_from_year),
    effective_to_year: numberOrNull(row.effective_to_year),
    archived_at: stringOrNull(row.archived_at),
    created_by: numberOrNull(row.created_by),
    created_at: String(row.created_at),
    updated_by: numberOrNull(row.updated_by),
    updated_at: String(row.updated_at),
  };
}

export function asMeasurementConfig(
  row: Record<string, unknown>,
): PersistedMeasurementConfig {
  return {
    id: Number(row.id),
    kpi_id: Number(row.kpi_id),
    effective_from_year: Number(row.effective_from_year),
    effective_to_year: numberOrNull(row.effective_to_year),
    measurement_type: stringOrNull(row.measurement_type) as MeasurementType | null,
    unit: stringOrNull(row.unit),
    numerator_label: stringOrNull(row.numerator_label),
    denominator_label: stringOrNull(row.denominator_label),
    fixed_denominator: numberOrNull(row.fixed_denominator),
    baseline_value: numberOrNull(row.baseline_value),
    reporting_frequency: stringOrNull(
      row.reporting_frequency,
    ) as StrategyReportingFrequency | null,
    aggregation_method: stringOrNull(row.aggregation_method) as AggregationMethod | null,
    board_level_status: stringOrNull(row.board_level_status) as BoardStatus | null,
    calculation_precision: Number(row.calculation_precision),
    configuration_status: String(row.configuration_status) as ConfigurationStatus,
    unresolved_question: stringOrNull(row.unresolved_question),
    owner: stringOrNull(row.owner),
    due_date: stringOrNull(row.due_date),
    resolution_notes: stringOrNull(row.resolution_notes),
    source_reference: stringOrNull(row.source_reference),
    last_reviewed_date: stringOrNull(row.last_reviewed_date),
    allow_score_over_max: Number(row.allow_score_over_max) === 1,
    archived_at: stringOrNull(row.archived_at),
    created_by: numberOrNull(row.created_by),
    created_at: String(row.created_at),
    updated_by: numberOrNull(row.updated_by),
    updated_at: String(row.updated_at),
  };
}

export function asComponent(row: Record<string, unknown>): PersistedComponent {
  return {
    id: Number(row.id),
    kpi_id: Number(row.kpi_id),
    configuration_id: Number(row.configuration_id),
    slug: String(row.slug),
    label: String(row.label),
    measurement_type: stringOrNull(row.measurement_type) as MeasurementType | null,
    unit: stringOrNull(row.unit),
    numerator_label: stringOrNull(row.numerator_label),
    denominator_label: stringOrNull(row.denominator_label),
    fixed_denominator: numberOrNull(row.fixed_denominator),
    baseline_value: numberOrNull(row.baseline_value),
    previous_period_value: numberOrNull(row.previous_period_value),
    weight: Number(row.weight),
    display_order: Number(row.display_order),
    configuration_status: String(row.configuration_status) as ConfigurationStatus,
    unresolved_question: stringOrNull(row.unresolved_question),
    archived_at: stringOrNull(row.archived_at),
    created_by: numberOrNull(row.created_by),
    created_at: String(row.created_at),
    updated_by: numberOrNull(row.updated_by),
    updated_at: String(row.updated_at),
  };
}

export function asTarget(row: Record<string, unknown>): PersistedTarget {
  return {
    id: Number(row.id),
    kpi_id: numberOrNull(row.kpi_id),
    component_id: numberOrNull(row.component_id),
    target_scope: String(row.target_scope) as TargetScope,
    reporting_year: numberOrNull(row.reporting_year),
    target_year: Number(row.target_year),
    external_target_year: Number(row.external_target_year) === 1,
    target_value: numberOrNull(row.target_value),
    structured_target: parseJsonObject(row.structured_target_json),
    target_description: stringOrNull(row.target_description),
    baseline_year: numberOrNull(row.baseline_year),
    baseline_value: numberOrNull(row.baseline_value),
    configuration_status: String(row.configuration_status) as ConfigurationStatus,
    source_reference: stringOrNull(row.source_reference),
    last_reviewed_date: stringOrNull(row.last_reviewed_date),
    archived_at: stringOrNull(row.archived_at),
    created_by: numberOrNull(row.created_by),
    created_at: String(row.created_at),
    updated_by: numberOrNull(row.updated_by),
    updated_at: String(row.updated_at),
  };
}

export function asKpiIdentity(row: Record<string, unknown>): StrategyKpiIdentity {
  return {
    id: Number(row.kpi_id ?? row.id),
    slug: String(row.kpi_slug ?? row.slug),
    name: String(row.kpi_name ?? row.name),
    unit: String(row.kpi_unit ?? row.unit ?? ""),
    category_id: Number(row.category_id),
    category_slug: String(row.category_slug),
    category_name: String(row.category_name),
  };
}

export function asStrategicAuditEvent(
  row: Record<string, unknown>,
): StrategicAuditEvent {
  return {
    id: Number(row.id),
    entity_type: String(row.entity_type) as StrategyAuditEntityType,
    entity_id: Number(row.entity_id),
    event_type: String(row.event_type) as StrategicAuditEvent["event_type"],
    entity_display_name: String(row.entity_display_name),
    parent_priority_name: stringOrNull(row.parent_priority_name),
    parent_goal_name: stringOrNull(row.parent_goal_name),
    previous_value: parseJsonValue(row.previous_value_json),
    new_value: parseJsonValue(row.new_value_json),
    actor_id: numberOrNull(row.actor_id),
    actor_email_snapshot: stringOrNull(row.actor_email_snapshot),
    source_reference: stringOrNull(row.source_reference),
    occurred_at: String(row.occurred_at),
  };
}

export function stableSnapshot(
  value: Record<string, unknown>,
  fields: readonly string[],
): Record<string, StrategyJsonValue> {
  const snapshot: Record<string, StrategyJsonValue> = {};
  for (const field of fields) {
    const candidate = value[field];
    if (
      candidate == null ||
      typeof candidate === "string" ||
      typeof candidate === "number" ||
      typeof candidate === "boolean"
    ) {
      snapshot[field] = candidate as StrategyJsonValue;
    }
  }
  return snapshot;
}
