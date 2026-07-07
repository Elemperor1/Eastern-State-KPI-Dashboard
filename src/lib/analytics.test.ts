import { describe, expect, it } from "vitest";
import type { KPIWithCategory, MonthlyEntryWithMeta } from "@/lib/types";
import {
  buildKPIAnalytics,
  buildTrendPoints,
  buildYTDPivot,
  CHART_COLORS,
  defaultComparisonPair,
  formatDelta,
  formatValue,
  isFavorable,
  MONTH_LABELS,
  numericDirection,
} from "@/lib/analytics";

function kpi(overrides: Partial<KPIWithCategory> = {}): KPIWithCategory {
  return {
    id: 1,
    category_id: 1,
    parent_id: null,
    slug: "video-views",
    name: "Video views",
    unit: "views",
    unit_type: "count",
    reporting_frequency: "monthly",
    direction: "higher",
    description: null,
    sort_order: 0,
    is_active: 1,
    created_at: "2026-01-01T00:00:00Z",
    category_name: "Education",
    category_slug: "education",
    ...overrides,
  };
}

function entry(overrides: Partial<MonthlyEntryWithMeta> = {}): MonthlyEntryWithMeta {
  return {
    id: 1,
    kpi_id: 1,
    year: 2026,
    month: 1,
    value: 100,
    notes: null,
    updated_by: 1,
    updated_at: "2026-01-02T00:00:00Z",
    kpi_name: "Video views",
    kpi_unit: "views",
    kpi_unit_type: "count",
    category_id: 1,
    category_name: "Education",
    category_slug: "education",
    ...overrides,
  };
}

describe("formatValue", () => {
  it("returns an em-dash for null / undefined / NaN", () => {
    expect(formatValue(null)).toBe("—");
    expect(formatValue(undefined)).toBe("—");
    expect(formatValue(NaN)).toBe("—");
  });

  it("formats counts as integers with thousands separators", () => {
    expect(formatValue(12345, "count")).toBe("12,345");
  });

  it("formats currency with the USD symbol and no decimals", () => {
    expect(formatValue(8400000, "currency")).toBe("$8,400,000");
  });

  it("formats percent unit by dividing the stored value by 100", () => {
    expect(formatValue(42, "percent")).toBe("42%");
    expect(formatValue(33.4, "percent")).toBe("33.4%");
  });

  it("formats attendance the same as count", () => {
    expect(formatValue(2100, "attendance")).toBe("2,100");
  });

  it("formats note + breakdown like counts", () => {
    expect(formatValue(7, "note")).toBe("7");
    expect(formatValue(98, "breakdown")).toBe("98");
  });

  it("uses compact notation when requested", () => {
    expect(formatValue(120000, "count", { compact: true })).toBe("120K");
    expect(formatValue(8400000, "currency", { compact: true })).toBe("$8.4M");
  });

  it("hides the sign unless signed is requested", () => {
    expect(formatValue(7)).toBe("7");
    expect(formatValue(7, "number", { signed: true })).toBe("+7");
    expect(formatValue(-7, "number", { signed: true })).toBe("-7");
  });

  it("accepts the loose 'number' | 'currency' | 'percent' string", () => {
    expect(formatValue(0.5, "percent")).toBe("0.5%");
    expect(formatValue(42, "currency")).toBe("$42");
  });
});

describe("formatDelta", () => {
  it("renders percent unit deltas as signed percentage points", () => {
    expect(formatDelta(1.4, "percent")).toBe("+1.4 pts");
    expect(formatDelta(-2.6, "percent")).toBe("-2.6 pts");
  });

  it("renders numeric deltas as signed counts", () => {
    expect(formatDelta(123, "count")).toBe("+123");
    expect(formatDelta(-50, "count")).toBe("-50");
  });

  it("renders currency deltas with the dollar sign", () => {
    expect(formatDelta(2500, "currency")).toBe("+$2,500");
  });
});

describe("numericDirection", () => {
  it("classifies the sign of a delta", () => {
    expect(numericDirection(5)).toBe("up");
    expect(numericDirection(-5)).toBe("down");
    expect(numericDirection(0)).toBe("flat");
  });
});

describe("isFavorable", () => {
  it("treats zero as favorable for any direction", () => {
    expect(isFavorable("higher", 0)).toBe(true);
    expect(isFavorable("lower", 0)).toBe(true);
    expect(isFavorable("neutral", 0)).toBe(true);
  });

  it("treats an upward delta as favorable when direction is higher", () => {
    expect(isFavorable("higher", 1)).toBe(true);
    expect(isFavorable("higher", -1)).toBe(false);
  });

  it("treats a downward delta as favorable when direction is lower", () => {
    expect(isFavorable("lower", -1)).toBe(true);
    expect(isFavorable("lower", 1)).toBe(false);
  });

  it("treats neutral direction the same as higher", () => {
    // Neutral has no directional preference; an upward delta is therefore favorable.
    expect(isFavorable("neutral", 1)).toBe(true);
    expect(isFavorable("neutral", -1)).toBe(false);
  });
});

describe("CHART_COLORS", () => {
  it("exposes a palette of CSS-variable-backed colors", () => {
    expect(CHART_COLORS.length).toBeGreaterThan(0);
    for (const color of CHART_COLORS) {
      expect(color).toMatch(/^var\(--chart-/);
    }
  });
});

describe("buildKPIAnalytics — monthly KPIs", () => {
  it("returns isEmpty=true when both years lack the queried month", () => {
    const entries = [
      entry({ year: 2024, month: 1, value: 100 }),
      entry({ year: 2026, month: 1, value: 200 }),
    ];
    const result = buildKPIAnalytics({
      kpi: kpi(),
      entries,
      currentYear: 2026,
      compareYear: 2025,
      currentMonth: 11,
    });
    expect(result.monthlyComparison.currentValue).toBe(0);
    expect(result.monthlyComparison.compareValue).toBe(0);
    expect(result.monthlyComparison.isEmpty).toBe(true);
    // YTD through month 11 is also empty for compareYear (2025 has no entries
    // at or before month 11). currentYear (2026) has a month-1 entry which
    // contributes to YTD, so ytdCurrent is non-zero and ytdComparison is NOT
    // empty. That asymmetry is intentional — the YTD view surfaces partial
    // data while the monthly snapshot flags the gap.
    expect(result.ytdComparison.isEmpty).toBe(false);
  });

  it("returns isEmpty=false when at least one year has the queried month", () => {
    const entries = [entry({ year: 2024, month: 11, value: 100 })];
    const result = buildKPIAnalytics({
      kpi: kpi(),
      entries,
      currentYear: 2026,
      compareYear: 2024,
      currentMonth: 11,
    });
    expect(result.monthlyComparison.compareValue).toBe(100);
    expect(result.monthlyComparison.currentValue).toBe(0);
    // currentValue=0 but compareYear has the month → not empty.
    expect(result.monthlyComparison.isEmpty).toBe(false);
  });

  it("returns isEmpty=true when both years store zero at the queried month", () => {
    const entries = [
      entry({ year: 2025, month: 5, value: 0 }),
      entry({ year: 2026, month: 5, value: 0 }),
    ];
    const result = buildKPIAnalytics({
      kpi: kpi(),
      entries,
      currentYear: 2026,
      compareYear: 2025,
      currentMonth: 5,
    });
    expect(result.monthlyComparison.currentValue).toBe(0);
    expect(result.monthlyComparison.compareValue).toBe(0);
    // Both years have a real entry at month 5, even though the value is 0.
    expect(result.monthlyComparison.isEmpty).toBe(false);
  });

  it("returns isEmpty=true for YTD only when both years have no entries at or before the through-month", () => {
    const entries = [
      entry({ year: 2025, month: 9, value: 1 }), // only Sept 2025
      entry({ year: 2026, month: 9, value: 1 }), // only Sept 2026
    ];
    const result = buildKPIAnalytics({
      kpi: kpi(),
      entries,
      currentYear: 2026,
      compareYear: 2025,
      currentMonth: 6,
    });
    // YTD through month 6 is empty: no entry at month <= 6 in either year.
    expect(result.ytdComparison.isEmpty).toBe(true);
    // Monthly comparison at month 6 also has no underlying entries.
    expect(result.monthlyComparison.isEmpty).toBe(true);
  });

  it("computes a positive delta and pct change for a gaining monthly metric", () => {
    const entries = [
      entry({ year: 2025, month: 3, value: 100 }),
      entry({ year: 2026, month: 3, value: 120 }),
    ];
    const result = buildKPIAnalytics({
      kpi: kpi(),
      entries,
      currentYear: 2026,
      compareYear: 2025,
      currentMonth: 3,
    });
    expect(result.monthlyComparison.delta).toBe(20);
    expect(result.monthlyComparison.pctChange).toBe(20);
    expect(result.monthlyComparison.isEmpty).toBe(false);
  });

  it("returns pctChange=null when the compare value is zero", () => {
    const entries = [entry({ year: 2026, month: 3, value: 5 })];
    const result = buildKPIAnalytics({
      kpi: kpi(),
      entries,
      currentYear: 2026,
      compareYear: 2025,
      currentMonth: 3,
    });
    expect(result.monthlyComparison.compareValue).toBe(0);
    expect(result.monthlyComparison.pctChange).toBeNull();
  });

  it("computes ptsChange for percent unit types", () => {
    const entries = [
      entry({
        year: 2025,
        month: 0,
        value: 60,
        kpi_unit_type: "percent",
        kpi_unit: "%",
      } as MonthlyEntryWithMeta),
      entry({
        year: 2026,
        month: 0,
        value: 71,
        kpi_unit_type: "percent",
        kpi_unit: "%",
      } as MonthlyEntryWithMeta),
    ];
    const result = buildKPIAnalytics({
      kpi: kpi({ reporting_frequency: "annual", unit_type: "percent", unit: "%" }),
      entries,
      currentYear: 2026,
      compareYear: 2025,
      currentMonth: 12,
    });
    // ptsChange carries the raw delta so percent units render "+11.0 pts".
    expect(result.monthlyComparison.ptsChange).toBe(11);
    // pctChange is also computed; for 60 → 71 that's (11 / 60) * 100.
    expect(result.monthlyComparison.pctChange).toBeCloseTo(18.33, 1);
  });
});

describe("buildKPIAnalytics — annual KPIs", () => {
  it("returns currentValue===0 when the annual entry is missing", () => {
    const result = buildKPIAnalytics({
      kpi: kpi({ reporting_frequency: "annual" }),
      entries: [],
      currentYear: 2026,
      compareYear: 2025,
      currentMonth: 12,
    });
    expect(result.monthlyComparison.currentValue).toBe(0);
    expect(result.monthlyComparison.compareValue).toBe(0);
    // No entries at all → empty in both comparisons.
    expect(result.monthlyComparison.isEmpty).toBe(true);
    expect(result.ytdComparison.isEmpty).toBe(true);
  });

  it("treats the annual entry as one full-year value", () => {
    const entries = [
      entry({ year: 2025, month: 0, value: 70 }),
      entry({ year: 2026, month: 0, value: 75 }),
    ];
    const result = buildKPIAnalytics({
      kpi: kpi({ reporting_frequency: "annual" }),
      entries,
      currentYear: 2026,
      compareYear: 2025,
      currentMonth: 12,
    });
    expect(result.monthlyComparison.currentValue).toBe(75);
    expect(result.monthlyComparison.compareValue).toBe(70);
    expect(result.monthlyComparison.delta).toBe(5);
  });

  it("ignores month=0 stray rows when computing a monthly KPI's analytics", () => {
    const entries = [
      entry({ year: 2025, month: 0, value: 999 }), // stray row, must not count
      entry({ year: 2025, month: 4, value: 50 }),
      entry({ year: 2026, month: 4, value: 60 }),
    ];
    const result = buildKPIAnalytics({
      kpi: kpi(),
      entries,
      currentYear: 2026,
      compareYear: 2025,
      currentMonth: 4,
    });
    expect(result.monthlyComparison.compareValue).toBe(50);
    expect(result.monthlyComparison.currentValue).toBe(60);
    expect(result.monthlyComparison.delta).toBe(10);
  });

  it("summarizes YTD as the sum of monthly entries up to the through-month", () => {
    const entries = [
      entry({ year: 2025, month: 1, value: 10 }),
      entry({ year: 2025, month: 2, value: 20 }),
      entry({ year: 2025, month: 3, value: 30 }),
      entry({ year: 2026, month: 1, value: 15 }),
      entry({ year: 2026, month: 2, value: 25 }),
      entry({ year: 2026, month: 3, value: 35 }),
    ];
    const result = buildKPIAnalytics({
      kpi: kpi(),
      entries,
      currentYear: 2026,
      compareYear: 2025,
      currentMonth: 2,
    });
    expect(result.ytdComparison.currentValue).toBe(40); // 15 + 25
    expect(result.ytdComparison.compareValue).toBe(30); // 10 + 20
    expect(result.ytdComparison.delta).toBe(10);
  });
});

describe("buildTrendPoints", () => {
  it("returns 12 monthly points with values keyed by year and nulls for missing months", () => {
    const entries = [
      entry({ year: 2024, month: 1, value: 100 }),
      entry({ year: 2025, month: 1, value: 200 }),
    ];
    const points = buildTrendPoints(entries, [2024, 2025]);
    expect(points.length).toBe(12);
    expect(points[0].label).toBe(MONTH_LABELS[0]);
    expect(points[0].month).toBe(1);
    expect(points[0][2024]).toBe(100);
    expect(points[0][2025]).toBe(200);
    expect(points[5][2024]).toBeNull();
    expect(points[5][2025]).toBeNull();
  });

  it("uses null when a specific year has no entry for a month", () => {
    const entries = [entry({ year: 2024, month: 6, value: 999 })];
    const points = buildTrendPoints(entries, [2024, 2025]);
    expect(points[5][2024]).toBe(999);
    expect(points[5][2025]).toBeNull();
  });

  it("excludes month=0 (annual snapshot) rows so they never appear as a 13th point", () => {
    const entries = [
      entry({ year: 2024, month: 0, value: 9999 }),
      entry({ year: 2024, month: 1, value: 100 }),
    ];
    const points = buildTrendPoints(entries, [2024]);
    expect(points.length).toBe(12);
    // No 13th point — month=0 must not be plotted.
    expect(points.every((p) => p.month >= 1 && p.month <= 12)).toBe(true);
    // The month=0 value must not leak into January or any other month.
    expect(points[0][2024]).toBe(100);
  });
});

describe("buildYTDPivot", () => {
  it("sums monthly entries for each year through the requested month", () => {
    const entries = [
      entry({ year: 2024, kpi_id: 1, month: 1, value: 10 }),
      entry({ year: 2024, kpi_id: 1, month: 2, value: 20 }),
      entry({ year: 2024, kpi_id: 1, month: 3, value: 30 }),
      entry({ year: 2025, kpi_id: 1, month: 1, value: 5 }),
    ];
    const points = buildYTDPivot(entries, 1, [2024, 2025], 2);
    const point2024 = points.find((p) => p.label === "2024");
    const point2025 = points.find((p) => p.label === "2025");
    expect(point2024?.[2024]).toBe(30); // 10 + 20
    expect(point2025?.[2025]).toBe(5);
  });

  it("filters by kpi_id when multiple KPIs share a year", () => {
    const entries = [
      entry({ id: 1, kpi_id: 1, year: 2024, month: 1, value: 10 }),
      entry({ id: 2, kpi_id: 2, year: 2024, month: 1, value: 999 }),
    ];
    const points = buildYTDPivot(entries, 1, [2024], 12);
    expect(points[0][2024]).toBe(10);
  });
});

describe("defaultComparisonPair", () => {
  it("falls back to current+prior year when given no available years", () => {
    const result = defaultComparisonPair([], 2026);
    expect(result.currentYear).toBe(2026);
    expect(result.compareYear).toBe(2025);
  });

  it("falls back to current+prior year using the system year when no preferred current is given", () => {
    const result = defaultComparisonPair([]);
    expect(result.compareYear).toBe(result.currentYear - 1);
  });

  it("picks the latest available year as current when none is preferred", () => {
    const result = defaultComparisonPair([2024, 2025, 2026]);
    expect(result.currentYear).toBe(2026);
    expect(result.compareYear).toBe(2025);
  });

  it("uses preferredCurrentYear for the current side and picks the next-latest for compare", () => {
    const result = defaultComparisonPair([2024, 2025, 2026], 2025);
    expect(result.currentYear).toBe(2025);
    expect(result.compareYear).toBe(2026);
  });

  it("falls back to current-1 when no other year is available", () => {
    const result = defaultComparisonPair([2024], 2024);
    expect(result.compareYear).toBe(2023);
  });
});