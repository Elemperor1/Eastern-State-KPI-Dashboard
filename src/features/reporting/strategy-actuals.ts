import {
  calculateMeasurement,
  resolveConfiguredTargetValue,
  type AtomicMeasurementInput,
  type MeasurementResult,
  type PersistedMeasurementConfig,
  type StrategyComponentWithTargets,
} from "@/features/strategy";
import type {
  StrategyComponentEntryRecord,
  StrategyDistributionRecord,
  StrategyObservationRecord,
} from "@/features/strategy/server";

type ObservationRecord =
  | StrategyObservationRecord
  | StrategyComponentEntryRecord;

export interface StrategicCalculatedActual {
  kpiId: number;
  year: number;
  periodType: "monthly" | "quarterly" | "annual" | "cumulative" | "one_time";
  periodIndex: number;
  value: number | null;
  calculation: MeasurementResult;
}

export interface StrategicObservationDefinition {
  measurementType: ObservationRecord["measurement_type"];
  precision: number;
  fixedDenominator?: number | null;
  allowOverMaximum?: boolean;
}

/**
 * Recalculate one normalized observation from its retained raw inputs.
 * Persisted percentage and average rows never become opaque calculated values;
 * every dashboard and export consumer reaches the same calculation kernel.
 */
export function calculateStrategyObservation(
  record: ObservationRecord,
  definition: StrategicObservationDefinition,
  previousPeriodValue: number | null = null,
): MeasurementResult {
  return calculateMeasurement(
    observationMeasurementInput(record, definition, previousPeriodValue),
  );
}

export function calculateStrategyDistribution(
  record: StrategyDistributionRecord,
  precision: number,
): MeasurementResult {
  return calculateMeasurement(distributionMeasurementInput(record, precision));
}

export function calculateStrategyMultiComponent({
  configuration,
  components,
}: {
  configuration: PersistedMeasurementConfig;
  components: Array<{
    definition: StrategyComponentWithTargets;
    record: StrategyComponentEntryRecord | null;
    distribution?: StrategyDistributionRecord | null;
    previousPeriodValue?: number | null;
  }>;
}): MeasurementResult {
  return calculateMeasurement({
    measurementType: "multi_component",
    precision: configuration.calculation_precision,
    aggregationMethod: configuration.aggregation_method ?? "none",
    components: components.map(({
      definition,
      record,
      distribution,
      previousPeriodValue,
    }) => {
      const target = selectComponentTarget(
        definition,
        distribution?.year ?? record?.year ?? null,
      );
      const resolvedTarget = target
        ? resolveConfiguredTargetValue({
            measurementType: definition.measurement_type,
            targetValue: target.target_value,
            structuredTarget: target.structured_target,
            targetDescription: target.target_description,
            configurationStatus: target.configuration_status,
          })
        : null;
      const targetStatus = target
        ? componentTargetCalculationStatus(
            target.configuration_status,
            resolvedTarget,
          )
        : definition.configuration_status;
      return {
        id: String(definition.id),
        label: definition.label,
        input:
          definition.measurement_type === "distribution" && distribution
            ? distributionMeasurementInput(
                distribution,
                configuration.calculation_precision,
              )
            : observationMeasurementInput(
                record,
                {
                  measurementType: definition.measurement_type ?? "count",
                  precision: configuration.calculation_precision,
                  fixedDenominator: definition.fixed_denominator,
                  allowOverMaximum: configuration.allow_score_over_max,
                },
                previousPeriodValue ?? definition.previous_period_value,
              ),
        unit: definition.unit ?? undefined,
        weight: definition.weight,
        required: true,
        ...(target
          ? {
              targetValue: resolvedTarget,
              baselineValue:
                target.baseline_value ?? definition.baseline_value,
              configurationStatus: targetStatus,
            }
          : {}),
      };
    }),
  });
}

function distributionMeasurementInput(
  record: StrategyDistributionRecord,
  precision: number,
) {
  return {
    measurementType: "distribution" as const,
    precision,
    respondentTotal: record.respondent_count,
    allowNonExclusive: !record.mutually_exclusive,
    categories: record.bands.map((band) => ({
      id: String(band.band_id),
      label: band.label_snapshot,
      count: band.count,
      derivedGroup: band.derived_group,
    })),
  };
}

export function toStrategicCalculatedActual(
  record: Pick<
    ObservationRecord | StrategyDistributionRecord,
    "kpi_id" | "year" | "period_type" | "period_index"
  >,
  calculation: MeasurementResult,
): StrategicCalculatedActual {
  return {
    kpiId: record.kpi_id,
    year: record.year,
    periodType: record.period_type,
    periodIndex: record.period_index,
    value: calculation.value,
    calculation,
  };
}

function observationMeasurementInput(
  record: ObservationRecord | null,
  definition: StrategicObservationDefinition,
  previousPeriodValue: number | null,
): AtomicMeasurementInput {
  const precision = definition.precision;
  switch (definition.measurementType) {
    case "binary":
      return {
        measurementType: "binary",
        precision,
        completed: record?.boolean_value ?? null,
      };
    case "milestone":
      return {
        measurementType: "milestone",
        precision,
        completedMilestones: record?.milestone_value ?? null,
        totalMilestones: 100,
      };
    case "percentage":
      return {
        measurementType: "percentage",
        precision,
        numerator: record?.numerator ?? null,
        denominator: record?.denominator ?? null,
        fixedDenominator: definition.fixedDenominator ?? null,
      };
    case "ratio":
      return {
        measurementType: "ratio",
        precision,
        numerator: record?.numerator ?? null,
        denominator: record?.denominator ?? null,
        fixedDenominator: definition.fixedDenominator ?? null,
      };
    case "average": {
      const method = record?.average_method ?? "total_score";
      return {
        measurementType: "average",
        precision,
        method,
        respondentCount: record?.respondent_count ?? null,
        totalScore: record?.total_score ?? null,
        averageScore: record?.average_score ?? null,
        maxScorePerRespondent:
          record?.max_score_per_respondent ?? null,
        maxScaleValue: record?.max_score_per_respondent ?? null,
        totalPossibleScore: record?.total_possible_score ?? null,
        positiveResponseCount:
          record?.positive_response_count ?? null,
        totalResponseCount: record?.total_response_count ?? null,
        allowOverMaximum: definition.allowOverMaximum ?? false,
      };
    }
    case "year_over_year":
      return {
        measurementType: "year_over_year",
        precision,
        currentValue: record?.scalar_value ?? null,
        previousPeriodValue,
      };
    case "count":
    case "cumulative":
    case "currency":
      return {
        measurementType: definition.measurementType,
        precision,
        value: record?.scalar_value ?? null,
      };
    case "distribution":
      return {
        measurementType: "distribution",
        precision,
        respondentTotal: null,
        categories: [],
      };
    case "multi_component":
      // A multi-component parent never stores a scalar observation. Returning a
      // missing atomic input keeps a corrupt record intentional and finite.
      return {
        measurementType: "count",
        precision,
        value: null,
      };
  }
}

function selectComponentTarget(
  component: StrategyComponentWithTargets,
  year: number | null,
) {
  if (year !== null) {
    const annual = component.targets.find(
      (target) =>
        target.target_scope === "annual" && target.reporting_year === year,
    );
    if (annual) return annual;
  }
  const fullPlan = [...component.targets]
    .filter((target) => target.target_scope === "full_plan")
    .sort((a, b) => a.target_year - b.target_year || a.id - b.id);
  return (year === null
    ? fullPlan[0]
    : fullPlan.find((target) => target.target_year >= year) ?? fullPlan.at(-1)) ?? null;
}

function componentTargetCalculationStatus(
  status: StrategyComponentWithTargets["configuration_status"],
  resolvedValue: number | null,
) {
  if (status === "needs_definition") return "needs_definition" as const;
  if (status !== "ready" && status !== "active") return "needs_target" as const;
  return resolvedValue === null ? "needs_definition" as const : status;
}
