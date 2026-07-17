/**
 * First-class strategic-plan domain types.
 *
 * These types intentionally do not depend on the legacy KPI storage model. They
 * describe the normalized records an additive migration can introduce without
 * changing or deleting existing KPI, entry, goal, or audit rows.
 */

export const STRATEGIC_PLAN_START_YEAR = 2025;
export const STRATEGIC_PLAN_END_YEAR = 2029;
export const STRATEGIC_PLAN_REPORTING_YEARS = [2025, 2026, 2027, 2028, 2029] as const;

export const MEASUREMENT_TYPES = [
  "binary",
  "milestone",
  "count",
  "percentage",
  "average",
  "cumulative",
  "year_over_year",
  "distribution",
  "currency",
  "ratio",
  "multi_component",
] as const;
export type MeasurementType = (typeof MEASUREMENT_TYPES)[number];

export const EXPLICIT_STRATEGY_REPORTING_FREQUENCIES = [
  "monthly",
  "quarterly",
  "annual",
  "cumulative",
  "one_time",
] as const;
export type ExplicitStrategyReportingFrequency =
  (typeof EXPLICIT_STRATEGY_REPORTING_FREQUENCIES)[number];

export const STRATEGY_REPORTING_FREQUENCIES = [
  ...EXPLICIT_STRATEGY_REPORTING_FREQUENCIES,
  // Compatibility value for legacy KPIs. New configurations should select an
  // explicit frequency before moving to ready/active.
  "flexible",
] as const;
export type StrategyReportingFrequency =
  (typeof STRATEGY_REPORTING_FREQUENCIES)[number];

export const CONFIGURATION_STATUSES = [
  "draft",
  "needs_definition",
  "needs_target",
  "ready",
  "active",
  "archived",
] as const;
export type ConfigurationStatus = (typeof CONFIGURATION_STATUSES)[number];

export const BOARD_STATUSES = [
  "not_reported",
  "not_started",
  "on_track",
  "at_risk",
  "off_track",
  "complete",
  "exceeded",
  "not_applicable",
] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];

export const AGGREGATION_METHODS = [
  "none",
  "average",
  "weighted_average",
  "sum",
  "ratio",
  "all_complete",
] as const;
export type AggregationMethod = (typeof AGGREGATION_METHODS)[number];

export const COMPONENT_AGGREGATION_ROLES = [
  "value",
  "numerator",
  "denominator",
] as const;
export type ComponentAggregationRole =
  (typeof COMPONENT_AGGREGATION_ROLES)[number];

export const GOAL_COMPLETION_RULES = [
  "all_required_kpis",
  "weighted_average",
  "threshold_count",
  "manual_status",
] as const;
export type GoalCompletionRule = (typeof GOAL_COMPLETION_RULES)[number];

export const GOAL_MANUAL_STATUSES = [
  "not_started",
  "in_progress",
  "complete",
] as const;
export type GoalManualStatus = (typeof GOAL_MANUAL_STATUSES)[number];

export const GOAL_MEMBERSHIP_ROLES = ["required", "informational"] as const;
export type GoalMembershipRole = (typeof GOAL_MEMBERSHIP_ROLES)[number];

export const TARGET_SCOPES = ["annual", "full_plan"] as const;
export type TargetScope = (typeof TARGET_SCOPES)[number];

export const PROGRESS_STATES = [
  "not_started",
  "in_progress",
  "complete",
  "exceeded",
  "target_not_finalized",
  "needs_definition",
] as const;
export type ProgressState = (typeof PROGRESS_STATES)[number];

export const AVERAGE_INPUT_METHODS = [
  "total_score",
  "average_score",
  "percent_positive",
] as const;
export type AverageInputMethod = (typeof AVERAGE_INPUT_METHODS)[number];

export const STRATEGY_AUDIT_ENTITY_TYPES = [
  "strategic_priority",
  "strategic_goal",
  "goal_membership",
  "kpi",
  "measurement_config",
  "observation",
  "target",
  "component",
  "distribution",
  "distribution_category",
  "distribution_value",
  // Legacy aliases retained because schema-10 audit rows may already use them.
  "priority",
  "goal",
  "goal_kpi",
  "kpi_config",
  "kpi_observation",
  "kpi_component",
  "kpi_component_entry",
  "kpi_target",
  // Current first-class value-entry entity names.
  "distribution_band",
  "distribution_observation",
] as const;
export type StrategyAuditEntityType =
  (typeof STRATEGY_AUDIT_ENTITY_TYPES)[number];

export const STRATEGY_AUDIT_ACTIONS = [
  "create",
  "update",
  "archive",
  "restore",
  "delete",
  "status_change",
] as const;
export type StrategyAuditAction = (typeof STRATEGY_AUDIT_ACTIONS)[number];

type StrategyJsonPrimitive = string | number | boolean | null;
export type StrategyJsonValue =
  | StrategyJsonPrimitive
  | StrategyJsonValue[]
  | { [key: string]: StrategyJsonValue };

interface ConfigurationGapFields {
  configuration_status: ConfigurationStatus;
  unresolved_question: string | null;
  owner: string | null;
  due_date: string | null;
  resolution_notes: string | null;
  source_reference: string | null;
  last_reviewed_date: string | null;
}

interface EffectiveYearRange {
  effective_start_year: number;
  effective_end_year: number | null;
}

export interface StrategicGoalInput
  extends ConfigurationGapFields,
    EffectiveYearRange {
  priority_id: number;
  slug: string;
  name: string;
  description: string | null;
  completion_rule: GoalCompletionRule;
  threshold_count: number | null;
  threshold_percentage: number | null;
  manual_status: GoalManualStatus | null;
  board_level_status: BoardStatus;
  display_order: number;
}

export interface MeasurementConfigInput
  extends ConfigurationGapFields,
    EffectiveYearRange {
  kpi_id: number;
  measurement_type: MeasurementType;
  unit: string | null;
  numerator_label: string | null;
  denominator_label: string | null;
  fixed_denominator: number | null;
  baseline_value?: number | null;
  reporting_frequency: StrategyReportingFrequency;
  aggregation_method: AggregationMethod;
  board_level_status: BoardStatus;
  calculation_precision: number;
  allow_score_over_max?: boolean;
}

export interface TargetInput extends EffectiveYearRange {
  kpi_id: number;
  component_id: number | null;
  measurement_type: MeasurementType;
  scope: TargetScope;
  target_value: number | null;
  target_description: string | null;
  target_year: number;
  is_external_target: boolean;
}

export interface ComponentInput extends EffectiveYearRange {
  parent_kpi_id: number;
  slug: string;
  label: string;
  measurement_type: MeasurementType;
  unit: string | null;
  numerator_label: string | null;
  denominator_label: string | null;
  fixed_denominator: number | null;
  value: number | null;
  baseline_value: number | null;
  previous_period_value: number | null;
  aggregation_role: ComponentAggregationRole;
  target_value: number | null;
  annual_target_value: number | null;
  target_year: number | null;
  target_description: string | null;
  weight: number | null;
  display_order: number;
  configuration_status: ConfigurationStatus;
}

export const DISTRIBUTION_DERIVED_GROUPS = ["white", "non_white"] as const;
export type DistributionDerivedGroup =
  (typeof DISTRIBUTION_DERIVED_GROUPS)[number];

interface DistributionCategoryInput {
  key: string;
  label: string;
  count: number;
  display_order: number;
  derived_group: DistributionDerivedGroup | null;
  is_archived: boolean;
}

export interface DistributionInput {
  kpi_id: number;
  component_id: number | null;
  reporting_year: number;
  reporting_month: number | null;
  respondent_count: number;
  mutually_exclusive: boolean;
  categories: DistributionCategoryInput[];
  notes: string | null;
  source_reference: string | null;
}
