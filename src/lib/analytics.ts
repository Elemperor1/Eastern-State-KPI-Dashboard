import type {
  ComparisonPoint,
  KPIAnalytics,
  KPIWithCategory,
  MonthlyEntryWithMeta,
  UnitType,
  YearSummary,
} from "./types";
import {
  ANNUAL_ENTRY_MONTH,
  MONTH_NUMBERS,
  isAnnualEntryMonth,
  isAnnualReportingFrequency,
  isMonthlyEntryMonth,
  isMonthlyEntryThrough,
} from "@/features/metrics";

export const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const MONTH_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Map any unit_type to one of the three numeric formats the formatter understands. */
function numericFormat(unitType: UnitType): "number" | "currency" | "percent" {
  if (unitType === "currency") return "currency";
  if (unitType === "percent") return "percent";
  return "number"; // count, attendance, note, breakdown
}

/** Format a number according to its KPI unit type. */
export function formatValue(
  value: number | null | undefined,
  unitType: UnitType | "number" | "currency" | "percent" = "number",
  options: { compact?: boolean; signed?: boolean } = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  const fmt = (typeof unitType === "string" && ["count", "percent", "currency", "attendance", "note", "breakdown"].includes(unitType))
    ? numericFormat(unitType as UnitType)
    : (unitType as "number" | "currency" | "percent");
  const { compact = false, signed = false } = options;
  const formatter = new Intl.NumberFormat("en-US", {
    style: fmt === "currency" ? "currency" : fmt === "percent" ? "percent" : "decimal",
    currency: fmt === "currency" ? "USD" : undefined,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: fmt === "percent" ? 1 : compact ? 1 : 0,
    signDisplay: signed ? "exceptZero" : "auto",
  });
  return formatter.format(fmt === "percent" ? value / 100 : value);
}

export function formatDelta(
  value: number,
  unitType: UnitType | "number" | "currency" | "percent" = "number",
): string {
  const fmt = (typeof unitType === "string" && ["count", "percent", "currency", "attendance", "note", "breakdown"].includes(unitType))
    ? numericFormat(unitType as UnitType)
    : (unitType as "number" | "currency" | "percent");
  if (fmt === "percent") {
    return `${value > 0 ? "+" : ""}${value.toFixed(1)} pts`;
  }
  return formatValue(value, unitType, { signed: true });
}

/**
 * Decide whether a change is "good" given the metric's direction.
 * Returns "up" | "down" | "flat" — purely the numeric direction.
 */
export function numericDirection(delta: number): "up" | "down" | "flat" {
  return delta > 0 ? "up" : delta < 0 ? "down" : "flat";
}

/** Returns true when an upward delta is favorable for this KPI. */
export function isFavorable(direction: string, delta: number): boolean {
  if (delta === 0) return true;
  if (direction === "lower") return delta < 0;
  return delta > 0;
}

/**
 * Color tokens for charts — keep aligned with the teal/navy brand
 * palette in `globals.css` and `tailwind.config.ts`. Order is
 * "loudest → quietest" so the first entry always wins visual weight
 * when callers index by position.
 */
export const CHART_COLORS = [
  "var(--chart-primary)",      // medium teal — current year
  "var(--chart-secondary)",    // dark teal — compare year
  "var(--chart-tertiary)",     // navy — recent trend line
  "var(--chart-brand-mid)",    // mid teal — stacked series
  "var(--chart-brand-soft)",   // soft teal — area fills
  "var(--chart-accent)",       // yellow — single high-attention point
  "var(--chart-ink-soft)",     // grey teal — 3rd historic year
  "var(--chart-muted)",        // disabled / null data
];

interface BuildAnalyticsArgs {
  kpi: KPIWithCategory;
  entries: MonthlyEntryWithMeta[];
  currentYear: number;
  compareYear: number;
  currentMonth: number;
}

export function buildKPIAnalytics(args: BuildAnalyticsArgs): KPIAnalytics {
  const { kpi, entries, currentYear, compareYear, currentMonth } = args;
  const annual = isAnnualReportingFrequency(kpi.reporting_frequency);
  const years = Array.from(new Set([currentYear, compareYear, ...entries.map((e) => e.year)])).sort();

  const yearSummaries: YearSummary[] = years.map((year) => {
    const yearEntries = entries.filter((e) => e.year === year);
    const monthlyValues: Record<number, number> = {};
    let ytdValue = 0;
    let fullYearValue = 0;
    if (annual) {
      // Annual metrics store one full-year value at month 0.
      const annualEntry = yearEntries.find((e) => isAnnualEntryMonth(e.month));
      const v = annualEntry?.value ?? 0;
      monthlyValues[ANNUAL_ENTRY_MONTH] = v;
      ytdValue = v;
      fullYearValue = v;
    } else {
      for (const entry of yearEntries) {
        if (isAnnualEntryMonth(entry.month)) continue; // ignore stray annual rows for monthly kpis
        monthlyValues[entry.month] = entry.value;
        fullYearValue += entry.value;
        if (entry.month <= currentMonth) {
          ytdValue += entry.value;
        }
      }
    }
    return { year, ytdValue, fullYearValue, monthlyValues };
  });

  const currentSummary = yearSummaries.find((y) => y.year === currentYear);
  const compareSummary = yearSummaries.find((y) => y.year === compareYear);

  // "No underlying entry" — used to distinguish a true 0 from "no data".
  // Monthly: did either year have any entry at all in the queried month?
  // YTD: did either year have any entry at or before the through-month?
  const hasMonthEntry = (year: number, month: number): boolean => {
    return entries.some((e) => e.year === year && e.month === month);
  };
  const hasYtdEntry = (year: number, through: number): boolean => {
    if (annual) return hasMonthEntry(year, ANNUAL_ENTRY_MONTH);
    return entries.some((e) => e.year === year && isMonthlyEntryThrough(e.month, through));
  };

  let currentValue: number;
  let compareValue: number;
  if (annual) {
    currentValue = currentSummary?.monthlyValues[ANNUAL_ENTRY_MONTH] ?? 0;
    compareValue = compareSummary?.monthlyValues[ANNUAL_ENTRY_MONTH] ?? 0;
  } else {
    currentValue = currentSummary?.monthlyValues[currentMonth] ?? 0;
    compareValue = compareSummary?.monthlyValues[currentMonth] ?? 0;
  }
  const delta = currentValue - compareValue;
  const pctChange = compareValue !== 0 ? (delta / Math.abs(compareValue)) * 100 : null;
  const ptsChange = kpi.unit_type === "percent" ? delta : null;
  const monthlyIsEmpty =
    currentValue === 0 &&
    compareValue === 0 &&
    !hasMonthEntry(currentYear, annual ? ANNUAL_ENTRY_MONTH : currentMonth) &&
    !hasMonthEntry(compareYear, annual ? ANNUAL_ENTRY_MONTH : currentMonth);

  let ytdCurrent: number;
  let ytdCompare: number;
  if (annual) {
    ytdCurrent = currentSummary?.ytdValue ?? 0;
    ytdCompare = compareSummary?.ytdValue ?? 0;
  } else {
    ytdCurrent = currentSummary?.ytdValue ?? 0;
    ytdCompare = compareSummary?.ytdValue ?? 0;
  }
  const ytdDelta = ytdCurrent - ytdCompare;
  const ytdPctChange = ytdCompare !== 0 ? (ytdDelta / Math.abs(ytdCompare)) * 100 : null;
  const ytdPtsChange = kpi.unit_type === "percent" ? ytdDelta : null;
  const ytdIsEmpty =
    ytdCurrent === 0 &&
    ytdCompare === 0 &&
    !hasYtdEntry(currentYear, currentMonth) &&
    !hasYtdEntry(compareYear, currentMonth);

  return {
    kpi,
    years: yearSummaries,
    monthlyComparison: {
      currentValue,
      compareValue,
      delta,
      pctChange,
      ptsChange,
      currentYear,
      compareYear,
      currentMonth,
      isAnnual: annual,
      isEmpty: monthlyIsEmpty,
    },
    ytdComparison: {
      currentValue: ytdCurrent,
      compareValue: ytdCompare,
      delta: ytdDelta,
      pctChange: ytdPctChange,
      ptsChange: ytdPtsChange,
      currentYear,
      compareYear,
      throughMonth: currentMonth,
      isAnnual: annual,
      isEmpty: ytdIsEmpty,
    },
  };
}

/** Build chart-friendly data points for the trend view (monthly metrics only).
 *  Only month=1–12 entries are plotted; month=0 (annual full-year snapshot) rows
 *  are always excluded so they never appear as a thirteenth point on the x-axis. */
export function buildTrendPoints(
  entries: MonthlyEntryWithMeta[],
  years: number[],
): ComparisonPoint[] {
  const monthlyEntries = entries.filter((e) => isMonthlyEntryMonth(e.month));
  const points: ComparisonPoint[] = [];
  for (const month of MONTH_NUMBERS) {
    const point: ComparisonPoint = {
      label: MONTH_LABELS[month - 1],
      month,
    };
    for (const year of years) {
      const entry = monthlyEntries.find((e) => e.year === year && e.month === month);
      point[String(year)] = entry ? entry.value : null;
    }
    points.push(point);
  }
  return points;
}

/** Build year-by-year data points for a YTD line through a given month. */
export function buildYTDPivot(
  allEntries: MonthlyEntryWithMeta[],
  kpiId: number,
  years: number[],
  throughMonth: number,
): ComparisonPoint[] {
  const points: ComparisonPoint[] = [];
  for (const year of years) {
    let running = 0;
    const yearData: ComparisonPoint = {
      label: String(year),
      month: year,
    };
    for (let month = 1; month <= throughMonth; month++) {
      const entry = allEntries.find(
        (e) => e.kpi_id === kpiId && e.year === year && e.month === month,
      );
      if (entry) running += entry.value;
    }
    yearData[String(year)] = running;
    yearData.value = running;
    points.push(yearData);
  }
  return points;
}

/** Pick a default comparison year given a list of available years. */
export function defaultComparisonPair(
  availableYears: number[],
  preferredCurrentYear?: number,
): { currentYear: number; compareYear: number } {
  if (availableYears.length === 0) {
    const year = preferredCurrentYear ?? new Date().getFullYear();
    return { currentYear: year, compareYear: year - 1 };
  }
  const sorted = [...availableYears].sort((a, b) => b - a);
  const currentYear = preferredCurrentYear ?? sorted[0];
  const compareYear = sorted.find((y) => y !== currentYear) ?? currentYear - 1;
  return { currentYear, compareYear };
}
