import { buildKPIAnalytics } from "@/lib/analytics";
import {
  isAnnualEntryMonth,
  isMonthlyEntryMonth,
} from "@/features/metrics";
import type {
  CategoryBreakdownModel,
  CategoryMetricCardModel,
  CategoryMetricGroupModel,
  CategoryPageModel,
  ComparePeriod,
  DashboardData,
} from "./types";
import { selectReportingGoal } from "./goal-selection";

const STRATEGIC_GOAL_SEPARATOR = " — ";

export function strategicGoalName(kpiName: string): string {
  const separatorIndex = kpiName.indexOf(STRATEGIC_GOAL_SEPARATOR);
  return separatorIndex > 0 ? kpiName.slice(0, separatorIndex) : "Other";
}

export function groupCategoryMetrics(
  metrics: CategoryMetricCardModel[],
): CategoryMetricGroupModel[] {
  const groups = new Map<string, CategoryMetricCardModel[]>();
  for (const metric of metrics) {
    const goal = strategicGoalName(metric.kpi.name);
    const group = groups.get(goal);
    if (group) {
      group.push(metric);
    } else {
      groups.set(goal, [metric]);
    }
  }
  return Array.from(groups, ([goal, groupedMetrics]) => ({
    goal,
    metrics: groupedMetrics,
  }));
}

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
      metricGroups: [],
      monthlyBreakdowns: [],
      annualBreakdowns: [],
    };
  }

  const categoryKpis = data.kpis.filter((kpi) => kpi.category_slug === categorySlug);
  const nonBreakdownKpis = categoryKpis.filter((kpi) => kpi.unit_type !== "breakdown");
  const breakdownKpis = categoryKpis.filter((kpi) => kpi.unit_type === "breakdown");
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
      goal: selectReportingGoal(data.goals, kpi.id, period.currentYear),
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
    metricGroups: groupCategoryMetrics(metricCards),
    monthlyBreakdowns,
    annualBreakdowns,
  };
}
