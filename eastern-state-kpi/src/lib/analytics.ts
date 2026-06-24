import type {
  ComparisonPoint,
  KPIAnalytics,
  KPIWithCategory,
  MonthlyEntryWithMeta,
  YearSummary,
} from "./types";

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

/** Format a number according to its KPI format. */
export function formatValue(
  value: number | null | undefined,
  format: "number" | "currency" | "percent" = "number",
  options: { compact?: boolean; signed?: boolean } = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  const { compact = false, signed = false } = options;
  const formatter = new Intl.NumberFormat("en-US", {
    style: format === "currency" ? "currency" : format === "percent" ? "percent" : "decimal",
    currency: format === "currency" ? "USD" : undefined,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: format === "percent" ? 1 : compact ? 1 : 0,
    signDisplay: signed ? "exceptZero" : "auto",
  });
  return formatter.format(format === "percent" ? value / 100 : value);
}

export function formatDelta(value: number, format: "number" | "currency" | "percent" = "number"): string {
  if (format === "percent") {
    return `${value > 0 ? "+" : ""}${value.toFixed(1)} pts`;
  }
  return formatValue(value, format, { signed: true });
}

/** Color tokens for charts — keep aligned with brand palette in tailwind config. */
export const CHART_COLORS = ["#3b4f89", "#cf841f", "#0e9f6e", "#9333ea", "#dc2626", "#0891b2"];

interface BuildAnalyticsArgs {
  kpi: KPIWithCategory;
  entries: MonthlyEntryWithMeta[];
  currentYear: number;
  compareYear: number;
  currentMonth: number;
}

export function buildKPIAnalytics(args: BuildAnalyticsArgs): KPIAnalytics {
  const { kpi, entries, currentYear, compareYear, currentMonth } = args;
  const years = Array.from(new Set([currentYear, compareYear, ...entries.map((e) => e.year)])).sort();

  const yearSummaries: YearSummary[] = years.map((year) => {
    const yearEntries = entries.filter((e) => e.year === year);
    const monthlyValues: Record<number, number> = {};
    let ytdValue = 0;
    let fullYearValue = 0;
    for (const entry of yearEntries) {
      monthlyValues[entry.month] = entry.value;
      fullYearValue += entry.value;
      if (entry.month <= currentMonth) {
        ytdValue += entry.value;
      }
    }
    return { year, ytdValue, fullYearValue, monthlyValues };
  });

  const currentSummary = yearSummaries.find((y) => y.year === currentYear);
  const compareSummary = yearSummaries.find((y) => y.year === compareYear);

  const currentValue = currentSummary?.monthlyValues[currentMonth] ?? 0;
  const compareValue = compareSummary?.monthlyValues[currentMonth] ?? 0;
  const delta = currentValue - compareValue;
  const pctChange = compareValue !== 0 ? (delta / compareValue) * 100 : null;

  const ytdCurrent = currentSummary?.ytdValue ?? 0;
  const ytdCompare = compareSummary?.ytdValue ?? 0;
  const ytdDelta = ytdCurrent - ytdCompare;
  const ytdPctChange = ytdCompare !== 0 ? (ytdDelta / ytdCompare) * 100 : null;

  return {
    kpi,
    years: yearSummaries,
    monthlyComparison: {
      currentValue,
      compareValue,
      delta,
      pctChange,
      currentYear,
      compareYear,
      currentMonth,
    },
    ytdComparison: {
      currentValue: ytdCurrent,
      compareValue: ytdCompare,
      delta: ytdDelta,
      pctChange: ytdPctChange,
      currentYear,
      compareYear,
      throughMonth: currentMonth,
    },
  };
}

/** Build chart-friendly data points for the trend view. */
export function buildTrendPoints(
  entries: MonthlyEntryWithMeta[],
  years: number[],
): ComparisonPoint[] {
  const points: ComparisonPoint[] = [];
  for (let month = 1; month <= 12; month++) {
    const point: ComparisonPoint = {
      label: MONTH_LABELS[month - 1],
      month,
    };
    for (const year of years) {
      const entry = entries.find((e) => e.year === year && e.month === month);
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