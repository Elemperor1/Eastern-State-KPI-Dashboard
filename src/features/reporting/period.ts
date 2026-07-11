import { defaultComparisonPair } from "@/lib/analytics";
import type { DashboardCompareState } from "./types";

export type DashboardSearchParams = Record<string, string | string[] | undefined>;

function firstParamValue(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

function parsePositiveYear(raw: string | string[] | undefined): number | null {
  const parsed = Number(firstParamValue(raw));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseThroughMonth(
  raw: string | string[] | undefined,
  fallbackYear: number,
  now: Date = new Date(),
): number {
  const parsed = Number(firstParamValue(raw));
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 12) {
    return Math.round(parsed);
  }
  return fallbackYear === now.getFullYear() ? Math.min(now.getMonth() + 1, 12) : 12;
}

export function resolveDashboardCompareState(
  searchParams: DashboardSearchParams,
  availableYears: number[],
  now: Date = new Date(),
): DashboardCompareState {
  const currentYearParam = parsePositiveYear(searchParams.currentYear);
  const fallbackPair = defaultComparisonPair(availableYears);
  const currentYear = currentYearParam ?? (
    availableYears.includes(now.getFullYear())
      ? now.getFullYear()
      : fallbackPair.currentYear
  );
  const priorYears = availableYears.filter((year) => year < currentYear);
  const nearestPriorYear = priorYears.at(-1) ?? fallbackPair.compareYear;
  const compareYear = parsePositiveYear(searchParams.compareYear) ?? nearestPriorYear;
  return {
    currentYear,
    compareYear,
    currentMonth: parseThroughMonth(searchParams.currentMonth, currentYear, now),
  };
}
