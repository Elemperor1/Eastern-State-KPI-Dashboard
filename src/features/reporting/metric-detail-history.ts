import { calculateMeasurement, type MeasurementResult } from "@/features/strategy";
import type { MonthlyEntryWithMeta } from "@/lib/types";
import type {
  BoardMeasurementType,
  BoardReportingFrequency,
} from "./strategic-board-report";
import type { StrategicCalculatedActual } from "./strategy-actuals";

export interface MetricDetailStrategicHistoryInput {
  kpiId: number;
  throughYear: number;
  firstClassHistory: StrategicCalculatedActual[];
  legacyEntries: MonthlyEntryWithMeta[];
  measurementType: BoardMeasurementType | "unknown" | null;
  reportingFrequency: BoardReportingFrequency | "unknown" | null;
  /** Unit attached to the retained input row, not the board result unit. */
  legacyUnit: string | null;
}

export type MetricDetailStrategicHistoryRow = StrategicCalculatedActual & {
  /** Distinguishes recalculated legacy inputs from retained compatibility values. */
  historySource?: "legacy_recalculated" | "legacy_retained";
};

/**
 * Build the typed history shown on a KPI detail page.
 *
 * First-class observations are authoritative. The compatibility path is
 * intentionally narrow: it only adapts legacy rows when the effective
 * strategic definition proves how those rows must be interpreted.
 */
export function buildMetricDetailStrategicHistory({
  kpiId,
  throughYear,
  firstClassHistory,
  legacyEntries,
  measurementType,
  reportingFrequency,
  legacyUnit,
}: MetricDetailStrategicHistoryInput): MetricDetailStrategicHistoryRow[] {
  const authoritative = firstClassHistory.filter(
    (actual) => actual.kpiId === kpiId && actual.year <= throughYear,
  );
  if (authoritative.length > 0) return authoritative;

  const rows = legacyEntries
    .filter((entry) =>
      entry.kpi_id === kpiId &&
      entry.year <= throughYear &&
      Number.isFinite(entry.value)
    )
    .map((entry) => ({ entry, periodType: legacyPeriodType(entry, reportingFrequency) }))
    .filter((row): row is LegacyHistoryRow => row.periodType !== null)
    .sort((left, right) =>
      left.entry.year - right.entry.year || left.entry.month - right.entry.month
    );
  if (rows.length === 0) return [];

  if (measurementType === "year_over_year") {
    if (legacyUnit?.trim() === "%") {
      const precision = inferredPrecision(rows.map(({ entry }) => entry.value), 1);
      return rows.map(({ entry, periodType }) => toActual(
        entry,
        periodType,
        retainedLegacyResult({
          measurementType,
          value: entry.value,
          precision,
          calculationProvenance: "legacy_direct_percentage",
          normalizedPercentage: entry.value,
        }),
        "legacy_retained",
      ));
    }
    if (!legacyUnit?.trim()) return [];

    return rows.flatMap(({ entry, periodType }) => {
      const previous = rows.find(({ entry: candidate }) =>
        candidate.year === entry.year - 1 && candidate.month === entry.month
      )?.entry.value;
      if (previous === undefined) return [];
      const calculation = calculateMeasurement({
        measurementType,
        currentValue: entry.value,
        previousPeriodValue: previous,
        precision: 1,
      });
      return [toActual(entry, periodType, calculation, "legacy_recalculated")];
    });
  }

  if (measurementType === "cumulative") {
    const precision = inferredPrecision(rows.map(({ entry }) => entry.value), 0);
    return rows.map(({ entry, periodType }) => {
      const calculation = calculateMeasurement({
        measurementType,
        value: entry.value,
        precision,
      });
      return toActual(
        entry,
        periodType,
        { ...calculation, calculationProvenance: "legacy_direct_value" },
        "legacy_retained",
      );
    });
  }

  if (measurementType === "binary" && reportingFrequency === "one_time") {
    return rows.map(({ entry, periodType }) => {
      const calculation = calculateMeasurement({
        measurementType,
        completed: entry.value !== 0,
        precision: 0,
      });
      return toActual(
        entry,
        periodType,
        { ...calculation, calculationProvenance: "legacy_direct_value" },
        "legacy_retained",
      );
    });
  }

  return [];
}

type HistoryPeriodType = StrategicCalculatedActual["periodType"];

interface LegacyHistoryRow {
  entry: MonthlyEntryWithMeta;
  periodType: HistoryPeriodType;
}

function legacyPeriodType(
  entry: MonthlyEntryWithMeta,
  reportingFrequency: MetricDetailStrategicHistoryInput["reportingFrequency"],
): HistoryPeriodType | null {
  if (reportingFrequency === "monthly" && entry.month >= 1 && entry.month <= 12) {
    return "monthly";
  }
  if (entry.month !== 0) return null;
  if (reportingFrequency === "annual") return "annual";
  if (reportingFrequency === "cumulative") return "cumulative";
  if (reportingFrequency === "one_time") return "one_time";
  return null;
}

function toActual(
  entry: MonthlyEntryWithMeta,
  periodType: HistoryPeriodType,
  calculation: MeasurementResult,
  historySource: NonNullable<MetricDetailStrategicHistoryRow["historySource"]>,
): MetricDetailStrategicHistoryRow {
  return {
    kpiId: entry.kpi_id,
    year: entry.year,
    periodType,
    periodIndex: entry.month,
    value: calculation.value,
    calculation,
    historySource,
  };
}

function retainedLegacyResult({
  measurementType,
  value,
  precision,
  calculationProvenance,
  normalizedPercentage,
}: {
  measurementType: BoardMeasurementType;
  value: number;
  precision: number;
  calculationProvenance: NonNullable<MeasurementResult["calculationProvenance"]>;
  normalizedPercentage: number | null;
}): MeasurementResult {
  return {
    state: "ok",
    measurementType,
    value,
    normalizedPercentage,
    numerator: null,
    denominator: null,
    respondentCount: null,
    precision,
    issues: [],
    calculationProvenance,
  };
}

function inferredPrecision(values: number[], fallback: number): number {
  return Math.max(
    fallback,
    ...values.map((value) => {
      const text = String(value);
      const decimal = text.indexOf(".");
      return decimal < 0 ? 0 : Math.min(6, text.length - decimal - 1);
    }),
  );
}
