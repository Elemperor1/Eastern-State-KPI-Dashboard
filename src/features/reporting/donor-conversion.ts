import { MONTH_LABELS } from "@/features/metrics";
import { MONTH_NUMBERS } from "@/features/metrics";
import type { BreakdownEntryWithMeta } from "@/lib/types";

export interface DonorConversionPair {
  referred: number;
  donors: number;
  conversionPct: number | null;
}

export interface DonorConversionMonthlyRow {
  month: number;
  monthLabel: string;
  current: DonorConversionPair;
  compare: DonorConversionPair;
  pointChange: number | null;
}

export interface DonorConversionModel {
  monthlyRows: DonorConversionMonthlyRow[];
  currentTotal: DonorConversionPair;
  compareTotal: DonorConversionPair;
  pointChange: number | null;
  showCompare: boolean;
  conversionChartData: Array<Record<string, string | number>>;
  volumeChartData: Array<Record<string, string | number>>;
}

export function donorConversionRate(
  breakdowns: BreakdownEntryWithMeta[],
  year: number,
  throughMonth: number,
): number | null {
  return donorConversionTotals(breakdowns, year, throughMonth).conversionPct;
}

export function buildDonorConversionModel({
  breakdowns,
  currentYear,
  compareYear,
  currentMonth,
}: {
  breakdowns: BreakdownEntryWithMeta[];
  currentYear: number;
  compareYear: number;
  currentMonth: number;
}): DonorConversionModel {
  const monthsToShow = Math.min(Math.max(currentMonth, 0), 12);
  const showCompare = breakdowns.some((breakdown) => breakdown.year === compareYear);
  const monthlyRows = MONTH_NUMBERS.slice(0, monthsToShow).map((month) => {
    const current = donorConversionMonthPair(breakdowns, currentYear, month);
    const compare = donorConversionMonthPair(breakdowns, compareYear, month);
    return {
      month,
      monthLabel: MONTH_LABELS[month - 1],
      current,
      compare,
      pointChange: current.conversionPct !== null && compare.conversionPct !== null
        ? current.conversionPct - compare.conversionPct
        : null,
    };
  });
  const currentTotal = donorConversionTotals(breakdowns, currentYear, currentMonth);
  const compareTotal = donorConversionTotals(breakdowns, compareYear, currentMonth);
  const pointChange = currentTotal.conversionPct !== null && compareTotal.conversionPct !== null
    ? currentTotal.conversionPct - compareTotal.conversionPct
    : null;

  return {
    monthlyRows,
    currentTotal,
    compareTotal,
    pointChange,
    showCompare,
    conversionChartData: monthlyRows.map((row) => ({
      month: row.monthLabel,
      [currentYear]: roundedPctForChart(row.current.conversionPct),
      ...(showCompare
        ? { [compareYear]: roundedPctForChart(row.compare.conversionPct) }
        : {}),
    })),
    volumeChartData: monthlyRows.map((row) => ({
      month: row.monthLabel,
      Referred: row.current.referred,
      Donors: row.current.donors,
    })),
  };
}

function donorConversionTotals(
  breakdowns: BreakdownEntryWithMeta[],
  year: number,
  throughMonth: number,
): DonorConversionPair {
  const months = Math.min(Math.max(throughMonth, 0), 12);
  let referred = 0;
  let donors = 0;
  for (const month of MONTH_NUMBERS.slice(0, months)) {
    const pair = donorConversionMonthPair(breakdowns, year, month);
    referred += pair.referred;
    donors += pair.donors;
  }
  return {
    referred,
    donors,
    conversionPct: calculateConversionPct(referred, donors),
  };
}

function donorConversionMonthPair(
  breakdowns: BreakdownEntryWithMeta[],
  year: number,
  month: number,
): DonorConversionPair {
  const referred = breakdowns.find(
    (breakdown) =>
      breakdown.year === year &&
      breakdown.month === month &&
      breakdown.label === "Referred",
  )?.value ?? 0;
  const donors = breakdowns.find(
    (breakdown) =>
      breakdown.year === year &&
      breakdown.month === month &&
      breakdown.label === "Donors",
  )?.value ?? 0;
  return {
    referred,
    donors,
    conversionPct: calculateConversionPct(referred, donors),
  };
}

function calculateConversionPct(referred: number, donors: number): number | null {
  return referred > 0 ? (donors / referred) * 100 : null;
}

function roundedPctForChart(value: number | null): number {
  return value !== null ? Number(value.toFixed(1)) : 0;
}
