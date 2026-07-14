import {
  STRATEGY_MONTH_LABELS,
  STRATEGY_QUARTER_LABELS,
  type ConcreteStrategyReportingFrequency,
} from "./periods";
import type { MeasurementType, StrategyReportingFrequency } from "./types";
import {
  STRATEGIC_PLAN_END_YEAR,
  STRATEGIC_PLAN_REPORTING_YEARS,
  STRATEGIC_PLAN_START_YEAR,
} from "./types";

export type ReportingCyclePeriodType = ConcreteStrategyReportingFrequency;

export interface ReportingCycleOption {
  value: string;
  label: string;
  periodType: ReportingCyclePeriodType;
  periodIndex: number;
}

export interface ReportingCycleRecord {
  period_type: ReportingCyclePeriodType;
  period_index: number;
}

const FREQUENCY_ORDER: ReportingCyclePeriodType[] = [
  "monthly",
  "quarterly",
  "annual",
  "cumulative",
  "one_time",
];

export function resolveStrategicReportingYear(
  requested: string | number | null | undefined,
  currentYear = new Date().getFullYear(),
): number {
  const parsed = Number(requested);
  if (
    STRATEGIC_PLAN_REPORTING_YEARS.includes(
      parsed as (typeof STRATEGIC_PLAN_REPORTING_YEARS)[number],
    )
  ) {
    return parsed;
  }
  return Math.max(
    STRATEGIC_PLAN_START_YEAR,
    Math.min(currentYear, STRATEGIC_PLAN_END_YEAR),
  );
}

function option(
  periodType: ReportingCyclePeriodType,
  periodIndex: number,
  label: string,
): ReportingCycleOption {
  return {
    value: `${periodType}:${periodIndex}`,
    label,
    periodType,
    periodIndex,
  };
}

/** Build the single Reporting Period selector from configured measure cadences. */
export function buildReportingCycleOptions(
  frequencies: Array<StrategyReportingFrequency | null>,
  reportingYear: number,
): ReportingCycleOption[] {
  const available = new Set<ReportingCyclePeriodType>();
  for (const frequency of frequencies) {
    if (frequency === "flexible") {
      available.add("monthly");
      available.add("annual");
    } else if (frequency) {
      available.add(frequency);
    }
  }

  return FREQUENCY_ORDER.flatMap((frequency) => {
    if (!available.has(frequency)) return [];
    if (frequency === "monthly") {
      return STRATEGY_MONTH_LABELS.map((label, index) =>
        option(frequency, index + 1, label),
      );
    }
    if (frequency === "quarterly") {
      return STRATEGY_QUARTER_LABELS.map((label, index) =>
        option(frequency, index + 1, label),
      );
    }
    if (frequency === "annual") return [option(frequency, 0, "Full year")];
    if (frequency === "cumulative") {
      return [option(frequency, 0, `Cumulative through ${reportingYear}`)];
    }
    return [option(frequency, 0, `One-time result (${reportingYear})`)];
  });
}

export function reportingCycleForSelection(
  selection: string | null | undefined,
  options: ReportingCycleOption[],
): ReportingCycleOption {
  const requested = options.find((candidate) => candidate.value === selection);
  if (requested) return requested;
  return options.find((candidate) => candidate.periodType === "annual") ??
    options[0] ??
    option("annual", 0, "Full year");
}

export function reportingCycleMatchesFrequency(
  frequency: StrategyReportingFrequency | null,
  cycleType: ReportingCyclePeriodType,
): boolean {
  if (frequency === null) return true;
  if (frequency === "flexible") {
    return cycleType === "monthly" || cycleType === "annual";
  }
  return frequency === cycleType;
}

export function reportingRecordMatchesCycle(
  record: ReportingCycleRecord,
  cycle: ReportingCycleOption,
): boolean {
  return record.period_type === cycle.periodType &&
    record.period_index === cycle.periodIndex;
}

export function isReportingItemComplete({
  measurementType,
  cycle,
  records,
  components,
}: {
  measurementType: MeasurementType;
  cycle: ReportingCycleOption;
  records: ReportingCycleRecord[];
  components: Array<{ id: number; records: ReportingCycleRecord[] }>;
}): boolean {
  if (measurementType === "multi_component") {
    return components.length > 0 && components.every((component) =>
      component.records.some((record) => reportingRecordMatchesCycle(record, cycle)),
    );
  }
  return records.some((record) => reportingRecordMatchesCycle(record, cycle));
}
