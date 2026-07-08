import type { BreakdownEntryWithMeta } from "@/lib/types";

export interface BreakdownComparisonRow {
  label: string;
  currentValue: number;
  compareValue: number;
  delta: number;
}

export interface BreakdownComparisonModel {
  rows: BreakdownComparisonRow[];
  chartData: Array<Record<string, string | number>>;
  totalCurrent: number;
  totalCompare: number;
  pctChange: number | null;
  showCompare: boolean;
}

export function buildBreakdownComparisonModel({
  breakdowns,
  currentYear,
  compareYear,
}: {
  breakdowns: BreakdownEntryWithMeta[];
  currentYear: number;
  compareYear: number;
}): BreakdownComparisonModel {
  const sortOrderByLabel = new Map<string, number>();
  for (const breakdown of breakdowns) {
    if (!sortOrderByLabel.has(breakdown.label)) {
      sortOrderByLabel.set(breakdown.label, breakdown.sort_order);
    }
  }

  const labels = Array.from(sortOrderByLabel.keys()).sort(
    (a, b) => (sortOrderByLabel.get(a) ?? 0) - (sortOrderByLabel.get(b) ?? 0),
  );
  const rows = labels.map((label) => {
    const currentValue = sumBreakdownValue(breakdowns, label, currentYear);
    const compareValue = sumBreakdownValue(breakdowns, label, compareYear);
    return {
      label,
      currentValue,
      compareValue,
      delta: currentValue - compareValue,
    };
  });
  const totalCurrent = rows.reduce((sum, row) => sum + row.currentValue, 0);
  const totalCompare = rows.reduce((sum, row) => sum + row.compareValue, 0);

  return {
    rows,
    chartData: rows.map((row) => ({
      label: row.label,
      [currentYear]: row.currentValue,
      [compareYear]: row.compareValue,
    })),
    totalCurrent,
    totalCompare,
    pctChange: totalCompare !== 0
      ? ((totalCurrent - totalCompare) / totalCompare) * 100
      : null,
    showCompare: breakdowns.some((breakdown) => breakdown.year === compareYear),
  };
}

function sumBreakdownValue(
  breakdowns: BreakdownEntryWithMeta[],
  label: string,
  year: number,
): number {
  return breakdowns
    .filter((breakdown) => breakdown.label === label && breakdown.year === year)
    .reduce((sum, breakdown) => sum + breakdown.value, 0);
}
