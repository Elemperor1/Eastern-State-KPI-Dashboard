import { STRATEGIC_PLAN_START_YEAR } from "@/features/strategy";
import type { MonthlyEntryWithMeta } from "@/lib/types";
import {
  listComponentsForConfiguration,
  listEffectiveMeasurementConfigs,
  listStrategyComponentEntries,
  listStrategyDistributions,
  listStrategyObservations,
  type StrategyComponentEntryRecord,
  type StrategyDistributionRecord,
} from "@/features/strategy/server";
import {
  calculateStrategyDistribution,
  calculateStrategyMultiComponent,
  calculateStrategyObservation,
  toStrategicCalculatedActual,
  type StrategicCalculatedActual,
} from "./strategy-actuals";

/** Load and recalculate every first-class actual needed for selected-year and plan progress. */
export function listCalculatedStrategyActuals({
  kpiIds,
  throughYear,
  legacyEntries = [],
}: {
  kpiIds: number[];
  throughYear: number;
  /** Legacy raw rows used only for an explicit first-class YOY transition. */
  legacyEntries?: MonthlyEntryWithMeta[];
}): StrategicCalculatedActual[] {
  if (kpiIds.length === 0 || throughYear < STRATEGIC_PLAN_START_YEAR) return [];
  const wanted = new Set(kpiIds);
  const actuals: StrategicCalculatedActual[] = [];
  const kpiValuesByReportingPeriod = new Map<string, number>();
  const componentValuesByReportingPeriod = new Map<string, number>();

  for (let year = STRATEGIC_PLAN_START_YEAR; year <= throughYear; year += 1) {
    const configurations = listEffectiveMeasurementConfigs(year).filter(
      (configuration) => wanted.has(configuration.kpi_id),
    );
    for (const configuration of configurations) {
      if (configuration.measurement_type === null) continue;
      seedLegacyYearOverYearPriorValues({
        configuration,
        reportingYear: year,
        legacyEntries,
        values: kpiValuesByReportingPeriod,
      });
      if (configuration.measurement_type === "distribution") {
        for (const record of listStrategyDistributions({
          kpi_id: configuration.kpi_id,
          reporting_year: year,
        })) {
          const result = calculateStrategyDistribution(
            record,
            configuration.calculation_precision,
          );
          actuals.push(toStrategicCalculatedActual(record, result));
        }
        continue;
      }

      if (configuration.measurement_type === "multi_component") {
        actuals.push(
          ...calculateMultiComponentPeriods({
            configuration,
            year,
            previousValues: componentValuesByReportingPeriod,
          }),
        );
        continue;
      }

      const records = listStrategyObservations({
        kpi_id: configuration.kpi_id,
        reporting_year: year,
      });
      for (const record of records) {
        const previous = kpiValuesByReportingPeriod.get(
          reportingPeriodValueKey(configuration.kpi_id, year - 1, record),
        ) ?? configuration.baseline_value;
        const result = calculateStrategyObservation(
          record,
          {
            measurementType: configuration.measurement_type,
            precision: configuration.calculation_precision,
            unit: configuration.unit,
            fixedDenominator: configuration.fixed_denominator,
            allowOverMaximum: configuration.allow_score_over_max,
          },
          previous,
        );
        actuals.push(toStrategicCalculatedActual(record, result));
        if (Number.isFinite(record.scalar_value)) {
          kpiValuesByReportingPeriod.set(
            reportingPeriodValueKey(configuration.kpi_id, year, record),
            record.scalar_value as number,
          );
        }
      }
    }
  }

  return actuals.sort(
    (a, b) =>
      a.kpiId - b.kpiId ||
      a.year - b.year ||
      periodRank(a.periodType) - periodRank(b.periodType) ||
      a.periodIndex - b.periodIndex,
  );
}

function seedLegacyYearOverYearPriorValues({
  configuration,
  reportingYear,
  legacyEntries,
  values,
}: {
  configuration: ReturnType<typeof listEffectiveMeasurementConfigs>[number];
  reportingYear: number;
  legacyEntries: MonthlyEntryWithMeta[];
  values: Map<string, number>;
}): void {
  const resolvedUnit = configuration.unit ?? legacyEntries.find(
    (entry) => entry.kpi_id === configuration.kpi_id,
  )?.kpi_unit ?? null;
  if (
    configuration.measurement_type !== "year_over_year" ||
    resolvedUnit === null ||
    resolvedUnit.trim() === "" ||
    resolvedUnit.trim() === "%"
  ) {
    return;
  }
  const priorYear = reportingYear - 1;
  const priorRows = legacyEntries.filter(
    (entry) =>
      entry.kpi_id === configuration.kpi_id && entry.year === priorYear,
  );
  if (configuration.reporting_frequency === "annual") {
    const annual = priorRows.findLast((entry) => entry.month === 0);
    if (!annual) return;
    const key = reportingPeriodValueKey(configuration.kpi_id, priorYear, {
      period_type: "annual",
      period_index: 0,
    });
    if (!values.has(key)) values.set(key, annual.value);
    return;
  }
  if (configuration.reporting_frequency === "monthly") {
    for (const entry of priorRows) {
      if (entry.month < 1 || entry.month > 12) continue;
      const key = reportingPeriodValueKey(configuration.kpi_id, priorYear, {
        period_type: "monthly",
        period_index: entry.month,
      });
      if (!values.has(key)) values.set(key, entry.value);
    }
  }
}

function calculateMultiComponentPeriods({
  configuration,
  year,
  previousValues,
}: {
  configuration: ReturnType<typeof listEffectiveMeasurementConfigs>[number];
  year: number;
  previousValues: Map<string, number>;
}): StrategicCalculatedActual[] {
  const definitions = listComponentsForConfiguration(configuration.id, year);
  const entries = new Map<
    number,
    Map<string, StrategyComponentEntryRecord | StrategyDistributionRecord>
  >();
  const periods = new Map<
    string,
    Pick<StrategyComponentEntryRecord, "period_type" | "period_index">
  >();

  for (const definition of definitions) {
    const records: Array<StrategyComponentEntryRecord | StrategyDistributionRecord> =
      definition.measurement_type === "distribution"
        ? listStrategyDistributions({
            kpi_id: configuration.kpi_id,
            component_id: definition.id,
            reporting_year: year,
          })
        : listStrategyComponentEntries({
            component_id: definition.id,
            reporting_year: year,
          });
    const byPeriod = new Map<string, (typeof records)[number]>();
    for (const record of records) {
      const key = periodKey(record);
      byPeriod.set(key, record);
      periods.set(key, record);
    }
    entries.set(definition.id, byPeriod);
  }

  return [...periods.entries()]
    .sort(([, a], [, b]) =>
      periodRank(a.period_type) - periodRank(b.period_type) ||
      a.period_index - b.period_index
    )
    .map(([key, period]) => {
      const calculation = calculateStrategyMultiComponent({
        configuration,
        reportingYear: year,
        components: definitions.map((definition) => {
          const record = entries.get(definition.id)?.get(key) ?? null;
          const previousPeriodValue =
            previousValues.get(
              reportingPeriodValueKey(definition.id, year - 1, period),
            ) ?? definition.previous_period_value;
          if (record && "scalar_value" in record && Number.isFinite(record.scalar_value)) {
            previousValues.set(
              reportingPeriodValueKey(definition.id, year, period),
              record.scalar_value as number,
            );
          }
          return {
            definition,
            record:
              record && "scalar_value" in record ? record : null,
            distribution:
              record && "bands" in record ? record : null,
            previousPeriodValue,
          };
        }),
      });
      return {
        kpiId: configuration.kpi_id,
        year,
        periodType: period.period_type,
        periodIndex: period.period_index,
        value: calculation.value,
        calculation,
      };
    });
}

function periodKey(
  record: Pick<StrategyComponentEntryRecord, "period_type" | "period_index">,
): string {
  return `${record.period_type}:${record.period_index}`;
}

function reportingPeriodValueKey(
  subjectId: number,
  year: number,
  period: Pick<StrategyComponentEntryRecord, "period_type" | "period_index">,
): string {
  return `${subjectId}:${year}:${periodKey(period)}`;
}

function periodRank(
  period: StrategicCalculatedActual["periodType"],
): number {
  return {
    monthly: 1,
    quarterly: 2,
    annual: 3,
    cumulative: 4,
    one_time: 5,
  }[period];
}
