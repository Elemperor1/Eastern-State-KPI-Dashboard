import { describe, expect, it } from "vitest";
import {
  buildPeriodTrendSeries,
  periodTrendSeriesHasValues,
} from "./period-trend";
import type { StrategicCalculatedActual } from "./strategy-actuals";

/** Builds a calculated actual with only the fields the chart builder reads. */
function actual(
  year: number,
  periodType: StrategicCalculatedActual["periodType"],
  periodIndex: number,
  value: number | null,
): StrategicCalculatedActual {
  return {
    kpiId: 1,
    year,
    periodType,
    periodIndex,
    value,
    calculation: { value } as StrategicCalculatedActual["calculation"],
  };
}

describe("period trend series", () => {
  it("emits every calendar month with one key per reporting year", () => {
    const series = buildPeriodTrendSeries(
      [
        actual(2025, "monthly", 1, 10),
        actual(2025, "monthly", 2, 12),
        actual(2026, "monthly", 1, 14),
      ],
      { selectedYear: 2026 },
    );

    expect(series).not.toBeNull();
    expect(series!.granularity).toBe("monthly");
    expect(series!.years).toEqual([2025, 2026]);
    expect(series!.points).toHaveLength(12);
    expect(series!.points[0]).toEqual({
      label: "January",
      "2025": 10,
      "2026": 14,
    });
    // February 2026 was never reported, so the line breaks rather than
    // carrying January forward.
    expect(series!.points[1]).toEqual({
      label: "February",
      "2025": 12,
      "2026": null,
    });
    expect(series!.points[11]).toEqual({
      label: "December",
      "2025": null,
      "2026": null,
    });
  });

  it("falls back to quarters and drops years after the selected year", () => {
    const series = buildPeriodTrendSeries(
      [
        actual(2025, "quarterly", 1, 4),
        actual(2026, "quarterly", 2, 6),
        actual(2027, "quarterly", 1, 99),
      ],
      { selectedYear: 2026 },
    );

    expect(series!.granularity).toBe("quarterly");
    expect(series!.years).toEqual([2025, 2026]);
    expect(series!.points.map((point) => point.label)).toEqual([
      "Q1",
      "Q2",
      "Q3",
      "Q4",
    ]);
    expect(series!.points[1]).toEqual({ label: "Q2", "2025": null, "2026": 6 });
  });

  it("prefers monthly detail when a measure holds both granularities", () => {
    const series = buildPeriodTrendSeries(
      [actual(2026, "monthly", 3, 7), actual(2026, "quarterly", 1, 21)],
      { selectedYear: 2026 },
    );

    expect(series!.granularity).toBe("monthly");
    expect(series!.points[2]).toEqual({ label: "March", "2026": 7 });
  });

  it("keeps only the four most recent reporting years", () => {
    const series = buildPeriodTrendSeries(
      [2021, 2022, 2023, 2024, 2025].map((year) =>
        actual(year, "monthly", 1, year),
      ),
      { selectedYear: 2025 },
    );

    expect(series!.years).toEqual([2022, 2023, 2024, 2025]);
    expect(series!.points[0]).not.toHaveProperty("2021");
  });

  it("returns null when no result carries within-year detail", () => {
    expect(
      buildPeriodTrendSeries(
        [actual(2026, "annual", 0, 5), actual(2025, "one_time", 0, 3)],
        { selectedYear: 2026 },
      ),
    ).toBeNull();
    expect(buildPeriodTrendSeries([], { selectedYear: 2026 })).toBeNull();
  });

  it("returns null when every monthly row predates the selected year window", () => {
    expect(
      buildPeriodTrendSeries([actual(2027, "monthly", 1, 5)], {
        selectedYear: 2026,
      }),
    ).toBeNull();
  });

  it("reports an all-null series as having nothing to plot", () => {
    const empty = buildPeriodTrendSeries(
      [actual(2026, "monthly", 1, null), actual(2026, "monthly", 2, null)],
      { selectedYear: 2026 },
    );
    const populated = buildPeriodTrendSeries(
      [actual(2026, "monthly", 1, null), actual(2026, "monthly", 2, 9)],
      { selectedYear: 2026 },
    );

    expect(periodTrendSeriesHasValues(empty!)).toBe(false);
    expect(periodTrendSeriesHasValues(populated!)).toBe(true);
  });
});
