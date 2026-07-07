import { buildKPIAnalytics } from "@/lib/analytics";
import {
  isAnnualEntryMonth,
  isMonthlyEntryMonth,
} from "@/features/metrics";
import type {
  CategoryBreakdownModel,
  CategoryMetricCardModel,
  CategoryPageModel,
  ComparePeriod,
  DashboardData,
} from "./types";

export function buildCategoryPageModel(
  data: DashboardData,
  categorySlug: string,
  period: ComparePeriod,
): CategoryPageModel {
  const category = data.categories.find((cat) => cat.slug === categorySlug) ?? null;
  if (!category) {
    return {
      category: null,
      metricCards: [],
      monthlyBreakdowns: [],
      annualBreakdowns: [],
    };
  }

  const categoryKpis = data.kpis.filter((kpi) => kpi.category_slug === categorySlug);
  const nonBreakdownKpis = categoryKpis.filter((kpi) => kpi.unit_type !== "breakdown");
  const breakdownKpis = categoryKpis.filter((kpi) => kpi.unit_type === "breakdown");
  const goalsByKpiId = new Map(
    data.goals
      .filter((goal) => goal.target_year === period.currentYear)
      .map((goal) => [goal.kpi_id, goal]),
  );

  const metricCards: CategoryMetricCardModel[] = nonBreakdownKpis.map((kpi) => {
    const entries = data.entries.filter((entry) => entry.kpi_id === kpi.id);
    return {
      kpi,
      analytics: buildKPIAnalytics({
        kpi,
        entries,
        currentYear: period.currentYear,
        compareYear: period.compareYear,
        currentMonth: period.currentMonth,
      }),
      goal: goalsByKpiId.get(kpi.id) ?? null,
    };
  });

  const monthlyBreakdowns: CategoryBreakdownModel[] = [];
  const annualBreakdowns: CategoryBreakdownModel[] = [];
  for (const kpi of breakdownKpis) {
    const breakdowns = data.breakdowns.filter((breakdown) => breakdown.kpi_id === kpi.id);
    if (breakdowns.some((breakdown) => isMonthlyEntryMonth(breakdown.month))) {
      monthlyBreakdowns.push({ kpi, breakdowns });
      continue;
    }
    annualBreakdowns.push({
      kpi,
      breakdowns: breakdowns.filter(
        (breakdown) =>
          isAnnualEntryMonth(breakdown.month) &&
          (breakdown.year === period.currentYear || breakdown.year === period.compareYear),
      ),
    });
  }

  return {
    category,
    metricCards,
    monthlyBreakdowns,
    annualBreakdowns,
  };
}
