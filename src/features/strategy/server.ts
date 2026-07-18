/**
 * Server-only strategic-plan persistence facade.
 *
 * App routes and server components should import persistence operations from
 * this module rather than reaching into the database-facing implementation
 * files. Pure domain types and validators remain available from the feature
 * root (`@/features/strategy`).
 */
export {
  listStrategicAuditEvents,
  recordStrategicAuditEvent,
} from "./audit";

export {
  archiveComponent,
  archiveMeasurementConfig,
  archiveStrategicGoal,
  archiveTarget,
  restoreComponent,
  restoreMeasurementConfig,
  restoreStrategicGoal,
  restoreTarget,
  StrategyConfigurationError,
  StrategyEntityNotFoundError,
  updateMeasurementConfigurationStatus,
} from "./mutations";

export {
  getComponentRecord,
  getMeasurementConfigRecord,
  getStrategicGoalBySlug,
  getStrategicGoalRecord,
  getTargetRecord,
  listStrategicAuditIdentitiesForKpi,
  listComponentsForConfiguration,
  listConfigurationGaps,
  listEffectiveMeasurementConfigs,
  listEffectiveTargetsForKpi,
  listStrategicGoals,
} from "./queries";

export {
  archiveStrategyDistributionBand,
  createStrategyDistributionBand,
  deleteStrategyComponentEntry,
  deleteStrategyDistribution,
  deleteStrategyObservation,
  listEffectiveDistributionBands,
  listStrategyComponentEntries,
  listStrategyDistributions,
  listStrategyObservations,
  reorderStrategyDistributionBands,
  restoreStrategyDistributionBand,
  StrategyObservationWriteSchema,
  StrategyObservationSubmissionSchema,
  StrategyValueEntryNotFoundError,
  StrategyValueEntryValidationError,
  upsertStrategyComponentEntry,
  upsertStrategyMultiComponentBatch,
  upsertStrategyDistribution,
  upsertStrategyObservation,
  updateStrategyDistributionBand,
  type StrategyComponentEntryRecord,
  type StrategyDistributionRecord,
  type StrategyObservationRecord,
} from "./value-entry";

export {
  createMeasurementConfiguration,
  appendStrategicGoalMembership,
  createSuccessorMeasurementConfiguration,
  createSuccessorStrategicGoal,
  createSuccessorStrategicGoalMembership,
  createStrategicTarget,
  createStrategyComponent,
  reorderStrategyComponents,
  StrategyEditConflictError,
  StrategyEditNotFoundError,
  StrategyEditValidationError,
  updateMeasurementConfiguration,
  updateStrategicGoalMembership,
  updateStrategicGoalSettings,
  updateStrategicTarget,
  updateStrategyComponent,
} from "./configuration-editing";
