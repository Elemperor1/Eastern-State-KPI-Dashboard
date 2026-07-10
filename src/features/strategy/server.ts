/**
 * Server-only strategic-plan persistence facade.
 *
 * App routes and server components should import persistence operations from
 * this module rather than reaching into the database-facing implementation
 * files. Pure domain types and validators remain available from the feature
 * root (`@/features/strategy`).
 */
export {
  configurationStatusBeforeArchive,
  listStrategicAuditEvents,
  recordStrategicAuditEvent,
  type StrategicAuditEventType,
  type StrategicAuditFilter,
  type StrategicAuditWriteInput,
} from "./audit";

export {
  archiveComponent,
  archiveMeasurementConfig,
  archiveStrategicGoal,
  archiveTarget,
  ensureStrategicPlanConfiguration,
  restoreComponent,
  restoreMeasurementConfig,
  restoreStrategicGoal,
  restoreTarget,
  StrategyConfigurationError,
  StrategyEntityNotFoundError,
  updateComponentConfigurationStatus,
  updateGoalConfigurationStatus,
  updateMeasurementConfigurationStatus,
  updateTargetConfigurationStatus,
  type ChangeCounts,
  type StrategicConfigurationEnsureResult,
} from "./mutations";

export {
  getComponentRecord,
  getConfigurationGapCounts,
  getEffectiveMeasurementConfig,
  getMeasurementConfigRecord,
  getStrategicGoal,
  getStrategicGoalBySlug,
  getStrategicGoalRecord,
  getStrategicGoalRecordBySlug,
  getTargetRecord,
  listComponentsForConfiguration,
  listConfigurationGaps,
  listEffectiveMeasurementConfigs,
  listEffectiveTargetsForComponent,
  listEffectiveTargetsForKpi,
  listStrategicGoals,
  type ConfigurationGapFilter,
  type StrategicGoalListFilter,
  type StrategyReadOptions,
} from "./queries";

export {
  archiveStrategyDistributionBand,
  createStrategyDistributionBand,
  deleteStrategyComponentEntry,
  deleteStrategyDistribution,
  deleteStrategyObservation,
  getStrategyComponentEntry,
  getStrategyDistribution,
  getStrategyObservation,
  listEffectiveDistributionBands,
  listStrategyComponentEntries,
  listStrategyDistributions,
  listStrategyObservations,
  reorderStrategyDistributionBands,
  restoreStrategyDistributionBand,
  StrategyComponentEntryWriteSchema,
  StrategyDistributionBandCreateSchema,
  StrategyDistributionBandReorderSchema,
  StrategyDistributionBandUpdateSchema,
  StrategyDistributionWriteSchema,
  StrategyObservationWriteSchema,
  StrategyValueEntryNotFoundError,
  StrategyValueEntryValidationError,
  upsertStrategyComponentEntry,
  upsertStrategyDistribution,
  upsertStrategyObservation,
  updateStrategyDistributionBand,
  type DistributionBandListOptions,
  type StrategyComponentEntryListOptions,
  type StrategyComponentEntryRecord,
  type StrategyDistributionBandDefinition,
  type StrategyDistributionRecord,
  type StrategyDistributionListOptions,
  type StrategyDistributionValueRecord,
  type StrategyObservationRecord,
  type StrategyObservationListOptions,
  type StrategyValueEntryIssue,
} from "./value-entry";

export {
  createMeasurementConfiguration,
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
  type StrategyEditIssue,
} from "./configuration-editing";
