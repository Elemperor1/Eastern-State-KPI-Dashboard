import type { StrategicCalculatedActual } from "@/features/reporting/strategy-actuals";

export type StrategicHistoryPeriod = Pick<
  StrategicCalculatedActual,
  "year" | "periodType" | "periodIndex"
>;

export function strategicHistoryPeriodLabel(
  actual: StrategicHistoryPeriod,
): string {
  if (actual.periodType === "monthly") {
    if (actual.periodIndex < 1 || actual.periodIndex > 12) {
      return `Invalid monthly period · ${actual.year}`;
    }
    const month = new Intl.DateTimeFormat("en-US", {
      month: "long",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2020, actual.periodIndex - 1, 1)));
    return `${month} ${actual.year}`;
  }
  if (actual.periodType === "quarterly") {
    if (actual.periodIndex < 1 || actual.periodIndex > 4) {
      return `Invalid quarterly period · ${actual.year}`;
    }
    return `Q${actual.periodIndex} ${actual.year}`;
  }
  if (actual.periodType === "cumulative") {
    return `Cumulative through ${actual.year}`;
  }
  if (actual.periodType === "one_time") {
    return `One-time result · ${actual.year}`;
  }
  return `Annual · ${actual.year}`;
}

export function strategicHistoryPeriodRank(
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
