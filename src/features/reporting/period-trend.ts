import { strategyPeriods } from "@/features/strategy";
import type { StrategicCalculatedActual } from "./strategy-actuals";

/** Within-year reporting granularities that can carry a period-level chart. */
export type PeriodTrendGranularity = "monthly" | "quarterly";

export interface PeriodTrendSeries {
  granularity: PeriodTrendGranularity;
  /** Reporting years holding results at this granularity, oldest first. */
  years: number[];
  /**
   * Wide-format chart rows: `label` names the period on the category axis and
   * each reporting year contributes one numeric key. A year with no result for
   * a period stays `null` so the line breaks instead of inventing a value.
   */
  points: Array<Record<string, string | number | null>>;
}

/**
 * Reporting years drawn at once. Four keeps the year-over-year comparison
 * legible and matches the number of distinct strokes in the chart palette.
 */
const MAX_COMPARISON_YEARS = 4;

/** Ordered period labels for a supported within-year granularity. */
function periodLabels(
  granularity: PeriodTrendGranularity,
): readonly string[] {
  return granularity === "monthly"
    ? strategyPeriods.STRATEGY_MONTH_LABELS
    : strategyPeriods.STRATEGY_QUARTER_LABELS;
}

/**
 * Pick the granularity that carries within-year detail for one measure.
 *
 * Monthly wins when a measure holds both, because it is the finer record of
 * the same year. Annual, cumulative, and one-time results have no shape inside
 * a year, so they yield `null` and no chart is drawn.
 */
function resolveGranularity(
  actuals: StrategicCalculatedActual[],
): PeriodTrendGranularity | null {
  if (actuals.some((actual) => actual.periodType === "monthly")) return "monthly";
  if (actuals.some((actual) => actual.periodType === "quarterly")) return "quarterly";
  return null;
}

/**
 * Build the period-level chart series for a single measure.
 *
 * `actuals` must already be scoped to one measure — the caller owns that
 * filter. Every period of the calendar is emitted even when the tail is
 * unreported, so a partially reported year reads as incomplete rather than as
 * a year that ended early.
 */
export function buildPeriodTrendSeries(
  actuals: StrategicCalculatedActual[],
  { selectedYear }: { selectedYear: number },
): PeriodTrendSeries | null {
  const granularity = resolveGranularity(actuals);
  if (granularity === null) return null;

  const scoped = actuals.filter(
    (actual) => actual.periodType === granularity && actual.year <= selectedYear,
  );
  const years = Array.from(new Set(scoped.map((actual) => actual.year)))
    .sort((left, right) => left - right)
    .slice(-MAX_COMPARISON_YEARS);
  if (years.length === 0) return null;

  const includedYears = new Set(years);
  const valueByPeriod = new Map(
    scoped
      .filter((actual) => includedYears.has(actual.year))
      .map(
        (actual) =>
          [`${actual.year}:${actual.periodIndex}`, actual.value] as const,
      ),
  );

  return {
    granularity,
    years,
    points: periodLabels(granularity).map((label, index) => ({
      label,
      ...Object.fromEntries(
        years.map((year) => [
          String(year),
          valueByPeriod.get(`${year}:${index + 1}`) ?? null,
        ]),
      ),
    })),
  };
}

/**
 * Whether any year in the series actually reported a value.
 *
 * A measure can hold monthly rows whose calculations all resolve to `null`
 * (an unfinished configuration, or a period that collected no responses).
 * Charting that produces an empty grid, so callers fall back to the list.
 */
export function periodTrendSeriesHasValues(series: PeriodTrendSeries): boolean {
  return series.points.some((point) =>
    series.years.some((year) => point[String(year)] !== null),
  );
}
