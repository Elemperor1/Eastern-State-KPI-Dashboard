import {
  getCategory,
  getCategoryBySlug,
  getKPIBySlug,
  listCategories,
  listKPIs,
} from "@/features/catalog/server";
import { listGoals } from "@/features/goals";
import { isMonthlyReportingFrequency } from "@/features/metrics";
import {
  listAvailableYears,
  listBreakdowns,
  listEntries,
} from "@/features/metrics/server";
import { isSampleDataEnabled } from "@/lib/app-meta";
import type { DashboardData } from "./types";
import {
  buildTrendExplorerInitialSelection,
  listTrendExplorerYears,
  type TrendExplorerPageData,
} from "./trend-explorer";

export function listDashboardYears(): number[] {
  return listAvailableYears();
}

function pageMetadata() {
  return {
    years: listAvailableYears(),
    sampleData: isSampleDataEnabled(),
  };
}

export function loadOverviewPageData(
  opts?: { throughMonth?: number; year?: number },
): DashboardData {
  return {
    categories: listCategories(),
    kpis: listKPIs(),
    entries: listEntries(),
    breakdowns: listBreakdowns(),
    goals: listGoals({
      enabledOnly: true,
      throughMonth: opts?.throughMonth,
      asOfYear: opts?.year,
    }),
    ...pageMetadata(),
  };
}

export function loadCategoryPageData(
  categorySlug: string,
  opts?: { throughMonth?: number; year?: number },
): DashboardData | null {
  const category = getCategoryBySlug(categorySlug);
  if (!category) return null;

  return {
    categories: [category],
    kpis: listKPIs().filter((kpi) => kpi.category_id === category.id),
    entries: listEntries({ category_id: category.id }),
    breakdowns: listBreakdowns({ category_id: category.id }),
    goals: listGoals({
      category_id: category.id,
      enabledOnly: true,
      throughMonth: opts?.throughMonth,
      asOfYear: opts?.year,
    }),
    ...pageMetadata(),
  };
}

export function loadMetricDetailPageData(
  kpiSlug: string,
  opts?: { throughMonth?: number; year?: number },
): DashboardData | null {
  const kpi = getKPIBySlug(kpiSlug);
  if (!kpi) return null;
  const category = getCategory(kpi.category_id);
  if (!category) return null;

  return {
    categories: [category],
    kpis: [kpi],
    entries: listEntries({ kpi_id: kpi.id }),
    breakdowns: listBreakdowns({ kpi_id: kpi.id }),
    goals: listGoals({
      enabledOnly: true,
      kpi_id: kpi.id,
      throughMonth: opts?.throughMonth,
      asOfYear: opts?.year,
    }),
    ...pageMetadata(),
  };
}

export function loadTrendExplorerPageData(): TrendExplorerPageData {
  const kpis = listKPIs().filter(
    (kpi) =>
      isMonthlyReportingFrequency(kpi.reporting_frequency) &&
      kpi.unit_type !== "breakdown",
  );
  const entries = listEntries({ kpi_ids: kpis.map((kpi) => kpi.id) });
  const years = listTrendExplorerYears(entries);

  return {
    categories: listCategories(),
    kpis,
    entries,
    years,
    initialSelection: buildTrendExplorerInitialSelection({ kpis, years }),
  };
}
