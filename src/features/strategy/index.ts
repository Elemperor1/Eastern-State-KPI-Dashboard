/** Client-safe strategic-plan domain facade. */
export {
  AGGREGATION_METHODS,
  BOARD_STATUSES,
  COMPONENT_AGGREGATION_ROLES,
  CONFIGURATION_STATUSES,
  EXPLICIT_STRATEGY_REPORTING_FREQUENCIES,
  GOAL_COMPLETION_RULES,
  GOAL_MANUAL_STATUSES,
  GOAL_MEMBERSHIP_ROLES,
  MEASUREMENT_TYPES,
  STRATEGIC_PLAN_END_YEAR,
  STRATEGIC_PLAN_REPORTING_YEARS,
  STRATEGIC_PLAN_START_YEAR,
  STRATEGY_REPORTING_FREQUENCIES,
  type AggregationMethod,
  type AverageInputMethod,
  type BoardStatus,
  type ComponentAggregationRole,
  type ConfigurationStatus,
  type DistributionDerivedGroup,
  type ExplicitStrategyReportingFrequency,
  type GoalCompletionRule as GoalCompletionRuleName,
  type GoalManualStatus,
  type GoalMembershipRole,
  type MeasurementType,
  type StrategyReportingFrequency,
  type TargetScope,
} from "./types";
export * from "./records";
export * from "./goal-completion";
export * from "./validation";
export * from "./target-policy";
export {
  calculateAnnualAndPlanProgress,
  calculateMeasurement,
  calculateProgress,
  calculateStrategyRollups,
  roundFinite,
  type AtomicMeasurementInput,
  type AverageMethod,
  type GoalCompletionResult,
  type MeasurementResult,
  type ProgressResult,
  type StrategyRollups,
} from "./calculations";

// Namespaces remain convenient for callers that prefer an explicit domain.
export * as strategyCalculations from "./calculations";
export * as strategyPeriods from "./periods";
export {
  type StrategicDataEntryPageData,
} from "./data-entry-model";
export {
  buildReportingCycleOptions,
  reportingCycleForSelection,
  resolveStrategicReportingYear,
  type ReportingCycleOption,
} from "./reporting-cycle";
