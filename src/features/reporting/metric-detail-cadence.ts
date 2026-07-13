import type {
  BoardMeasurementType,
  BoardReportingFrequency,
} from "./strategic-board-report";

export type MetricDetailCadenceKind = BoardReportingFrequency | "unknown";
export type LegacyHistoryKind = "monthly" | "annual";

export interface MetricDetailCadence {
  /** The cadence that controls metric-detail presentation semantics. */
  kind: MetricDetailCadenceKind;
  /** Human-facing cadence label; never leaks storage tokens such as one_time. */
  label: string;
  allowMonth: boolean;
  /**
   * Legacy history is a fallback only. It is safe when its storage cadence
   * matches the effective strategic cadence and no first-class history exists.
   */
  legacyHistoryKind: LegacyHistoryKind | null;
}

export function resolveMetricDetailCadence({
  legacyIsAnnual,
  strategicMeasurementType,
  strategicReportingFrequency,
  hasStrategicHistory,
}: {
  legacyIsAnnual: boolean;
  strategicMeasurementType: BoardMeasurementType | "unknown" | null;
  strategicReportingFrequency: BoardReportingFrequency | "unknown" | null;
  hasStrategicHistory: boolean;
}): MetricDetailCadence {
  const hasStrategicDefinition = strategicMeasurementType !== null ||
    strategicReportingFrequency !== null;
  const kind = effectiveCadence({
    legacyIsAnnual,
    strategicMeasurementType,
    strategicReportingFrequency,
  });

  return {
    kind,
    label: cadenceLabel(kind),
    allowMonth: kind === "monthly",
    legacyHistoryKind: legacyHistoryKind({
      kind,
      legacyIsAnnual,
      hasStrategicDefinition,
      hasResolvedStrategicDefinition:
        strategicMeasurementType !== "unknown" &&
        strategicReportingFrequency !== "unknown",
      hasStrategicHistory,
    }),
  };
}

function effectiveCadence({
  legacyIsAnnual,
  strategicMeasurementType,
  strategicReportingFrequency,
}: {
  legacyIsAnnual: boolean;
  strategicMeasurementType: BoardMeasurementType | "unknown" | null;
  strategicReportingFrequency: BoardReportingFrequency | "unknown" | null;
}): MetricDetailCadenceKind {
  // A cumulative result remains cumulative even when it is collected once per
  // year. Treating that configuration as annual would imply discrete annual
  // values and year-over-year history that do not exist.
  if (strategicMeasurementType === "cumulative") return "cumulative";

  if (strategicReportingFrequency !== null) {
    return strategicReportingFrequency;
  }

  if (strategicMeasurementType !== null) return "unknown";
  return legacyIsAnnual ? "annual" : "monthly";
}

function legacyHistoryKind({
  kind,
  legacyIsAnnual,
  hasStrategicDefinition,
  hasResolvedStrategicDefinition,
  hasStrategicHistory,
}: {
  kind: MetricDetailCadenceKind;
  legacyIsAnnual: boolean;
  hasStrategicDefinition: boolean;
  hasResolvedStrategicDefinition: boolean;
  hasStrategicHistory: boolean;
}): LegacyHistoryKind | null {
  if (hasStrategicHistory) return null;

  if (!hasStrategicDefinition) {
    return legacyIsAnnual ? "annual" : "monthly";
  }

  if (!hasResolvedStrategicDefinition) return null;
  if (kind === "monthly" && !legacyIsAnnual) return "monthly";
  if (kind === "annual" && legacyIsAnnual) return "annual";
  return null;
}

function cadenceLabel(kind: MetricDetailCadenceKind): string {
  switch (kind) {
    case "monthly":
      return "Monthly";
    case "quarterly":
      return "Quarterly";
    case "annual":
      return "Annual";
    case "cumulative":
      return "Cumulative";
    case "one_time":
      return "One-time";
    case "flexible":
      return "Flexible";
    case "unknown":
      return "Reporting frequency not finalized";
  }
}
