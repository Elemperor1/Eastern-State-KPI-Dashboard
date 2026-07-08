import { buildKPIAnalytics, isFavorable } from "@/lib/analytics";
import {
  isMonthlyEntryMonth,
} from "@/features/metrics";
import { donorConversionRate } from "./donor-conversion";
import type {
  BreakdownEntryWithMeta,
  Category,
  KPIWithCategory,
  MonthlyEntryWithMeta,
} from "@/lib/types";
import type {
  CategoryMetricMovement,
  CategoryOverviewSummary,
  ComparePeriod,
  ReportingData,
} from "./types";

interface BuildCategorySummaryArgs extends ReportingData {
  category: Category;
  period: ComparePeriod;
}

export function buildCategoryMetricMovement({
  kpi,
  entries,
  breakdowns,
  period,
}: {
  kpi: KPIWithCategory;
  entries: MonthlyEntryWithMeta[];
  breakdowns: BreakdownEntryWithMeta[];
  period: ComparePeriod;
}): CategoryMetricMovement {
  if (kpi.unit_type === "breakdown") {
    return buildBreakdownMetricMovement({ kpi, breakdowns, period });
  }

  const analytics = buildKPIAnalytics({
    kpi,
    entries: entries.filter((entry) => entry.kpi_id === kpi.id),
    currentYear: period.currentYear,
    compareYear: period.compareYear,
    currentMonth: period.currentMonth,
  });
  const comp = analytics.ytdComparison;
  const pct = kpi.unit_type === "percent" ? comp.ptsChange : comp.pctChange;
  return {
    kpi,
    pct,
    favorable: isFavorable(kpi.direction, comp.delta),
    delta: comp.delta,
  };
}

function buildBreakdownMetricMovement({
  kpi,
  breakdowns,
  period,
}: {
  kpi: KPIWithCategory;
  breakdowns: BreakdownEntryWithMeta[];
  period: ComparePeriod;
}): CategoryMetricMovement {
  const kpiBreakdowns = breakdowns.filter((breakdown) => breakdown.kpi_id === kpi.id);
  const isMonthly = kpiBreakdowns.some((breakdown) => isMonthlyEntryMonth(breakdown.month));
  if (isMonthly) {
    const curPct = donorConversionRate(kpiBreakdowns, period.currentYear, period.currentMonth);
    const cmpPct = donorConversionRate(kpiBreakdowns, period.compareYear, period.currentMonth);
    const delta = curPct !== null && cmpPct !== null ? curPct - cmpPct : null;
    const deltaAbs = delta ?? 0;
    return {
      kpi,
      pct: delta,
      favorable: isFavorable(kpi.direction, deltaAbs),
      delta: deltaAbs,
    };
  }

  const curTotal = kpiBreakdowns
    .filter((breakdown) => breakdown.year === period.currentYear)
    .reduce((sum, breakdown) => sum + breakdown.value, 0);
  const cmpTotal = kpiBreakdowns
    .filter((breakdown) => breakdown.year === period.compareYear)
    .reduce((sum, breakdown) => sum + breakdown.value, 0);
  const delta = curTotal - cmpTotal;
  return {
    kpi,
    pct: cmpTotal !== 0 ? (delta / Math.abs(cmpTotal)) * 100 : null,
    favorable: isFavorable(kpi.direction, delta),
    delta,
  };
}

export function buildCategoryOverviewSummary({
  category,
  kpis,
  entries,
  breakdowns,
  period,
}: BuildCategorySummaryArgs): CategoryOverviewSummary {
  const categoryKpis = kpis.filter((kpi) => kpi.category_id === category.id);
  const metrics = categoryKpis.map((kpi) =>
    buildCategoryMetricMovement({ kpi, entries, breakdowns, period }),
  );
  const improving = metrics.filter((metric) => metric.favorable && metric.delta !== 0).length;
  const declining = metrics.filter((metric) => !metric.favorable && metric.delta !== 0).length;
  const flat = metrics.filter((metric) => metric.delta === 0).length;
  const total = metrics.length;
  const pctImproving = total ? Math.round((improving / total) * 100) : 0;

  const sorted = [...metrics].sort(
    (a, b) => Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0),
  );
  const topMover = sorted.find((metric) => metric.favorable && metric.pct !== null) ?? sorted[0] ?? null;

  return {
    category,
    metrics,
    improving,
    declining,
    flat,
    total,
    pctImproving,
    topMover,
  };
}

export function buildCategoryOverviewSummaries(
  data: ReportingData,
  period: ComparePeriod,
): CategoryOverviewSummary[] {
  return data.categories.map((category) =>
    buildCategoryOverviewSummary({ ...data, category, period }),
  );
}
