import {
  buildKPIAnalytics,
  buildTrendPoints,
  isFavorable,
} from "@/lib/analytics";
import {
  MONTH_FULL,
  isAnnualEntryMonth,
  isAnnualReportingFrequency,
  isMonthlyEntryMonth,
} from "@/features/metrics";
import { buildMetricValueRows } from "./csv";
import { selectReportingGoal } from "./goal-selection";
import type {
  ComparePeriod,
  DashboardData,
  MetricDetailModel,
} from "./types";

export function buildMetricDetailModel(
  data: DashboardData,
  kpiSlug: string,
  period: ComparePeriod,
): MetricDetailModel {
  const kpi = data.kpis.find((item) => item.slug === kpiSlug) ?? null;
  const category = data.categories.find((item) => item.id === kpi?.category_id) ?? null;
  const emptyModel: MetricDetailModel = {
    kpi,
    category,
    entries: [],
    analytics: null,
    isAnnual: false,
    isBreakdown: false,
    trendYears: [],
    trendPoints: [],
    ytdBar: [],
    favorableMonthly: true,
    favorableYtd: true,
    goal: null,
    goalIsAnnual: false,
    tableRows: [],
    directionLabel: "",
    breakdown: null,
  };
  if (!kpi || !category) {
    return emptyModel;
  }

  const entries = data.entries.filter((entry) => entry.kpi_id === kpi.id);
  const analytics = buildKPIAnalytics({
    kpi,
    entries,
    currentYear: period.currentYear,
    compareYear: period.compareYear,
    currentMonth: period.currentMonth,
  });
  const isAnnual = isAnnualReportingFrequency(kpi.reporting_frequency);
  const isBreakdown = kpi.unit_type === "breakdown";
  const trendYears = Array.from(
    new Set(entries.filter((entry) => isMonthlyEntryMonth(entry.month)).map((entry) => entry.year)),
  ).sort();
  const trendPoints = buildTrendPoints(entries, trendYears);
  const ytd = analytics.ytdComparison;
  const ytdBar = [
    {
      label: isAnnual ? "Full year" : `Through ${MONTH_FULL[period.currentMonth - 1]}`,
      [ytd.compareYear]: ytd.compareValue,
      [ytd.currentYear]: ytd.currentValue,
    },
  ];
  const goal = selectReportingGoal(data.goals, kpi.id, period.currentYear);
  const breakdowns = data.breakdowns.filter((breakdown) => breakdown.kpi_id === kpi.id);
  const hasMonthlyBreakdownRows = breakdowns.some((breakdown) =>
    isMonthlyEntryMonth(breakdown.month),
  );
  const breakdown = !isBreakdown
    ? null
    : entries.length === 0 && hasMonthlyBreakdownRows
      ? {
          kind: "donor-conversion" as const,
          breakdowns,
        }
      : {
          kind: "annual-breakdown" as const,
          breakdowns: breakdowns.filter(
            (item) =>
              isAnnualEntryMonth(item.month) &&
              (item.year === period.currentYear || item.year === period.compareYear),
          ),
        };

  return {
    kpi,
    category,
    entries,
    analytics,
    isAnnual,
    isBreakdown,
    trendYears,
    trendPoints,
    ytdBar,
    favorableMonthly: isFavorable(kpi.direction, analytics.monthlyComparison.delta),
    favorableYtd: isFavorable(kpi.direction, analytics.ytdComparison.delta),
    goal,
    goalIsAnnual: goal ? isAnnualReportingFrequency(goal.reporting_frequency) : false,
    tableRows: buildMetricValueRows({ kpi, entries, period }),
    directionLabel: directionLabel(kpi.direction),
    breakdown,
  };
}

function directionLabel(direction: string): string {
  if (direction === "higher") {
    return "Higher is better";
  }
  if (direction === "lower") {
    return "Lower is better";
  }
  return "Neutral direction";
}
