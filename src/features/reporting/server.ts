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
import {
  STRATEGIC_PLAN_REPORTING_YEARS,
} from "@/features/strategy";
import {
  listStrategicGoals,
  listStrategicAuditEvents,
} from "@/features/strategy/server";
import type { DashboardData } from "./types";
import { buildStrategicDashboardSummary } from "./strategy-summary";
import { listCalculatedStrategyActuals } from "./strategy-actuals-server";
import { buildStrategicBoardReportFromSummary } from "./strategic-board-adapter";
import {
  buildTrendExplorerInitialSelection,
  listTrendExplorerYears,
  type TrendExplorerPageData,
} from "./trend-explorer";

export function listDashboardYears(): number[] {
  return Array.from(
    new Set([...listAvailableYears(), ...STRATEGIC_PLAN_REPORTING_YEARS]),
  ).sort((a, b) => a - b);
}

function pageMetadata() {
  return {
    years: listDashboardYears(),
    sampleData: isSampleDataEnabled(),
  };
}

function strategyReporting({
  kpis,
  entries,
  year,
  throughMonth,
  priorityId,
  auditKpiId,
}: {
  kpis: DashboardData["kpis"];
  entries: DashboardData["entries"];
  year: number;
  throughMonth?: number;
  priorityId?: number;
  auditKpiId?: number;
}) {
  const goals = listStrategicGoals({
    year,
    ...(priorityId === undefined ? {} : { priority_id: priorityId }),
  });
  const actuals = listCalculatedStrategyActuals({
    kpiIds: Array.from(
      new Set(goals.flatMap((goal) => goal.members.map((member) => member.kpi_id))),
    ),
    throughYear: year,
  });
  const summary = buildStrategicDashboardSummary({
    goals,
    kpis,
    entries,
    selectedYear: year,
    throughMonth,
    actuals,
  });
  const strategicAuditEvents = auditKpiId === undefined
    ? []
    : auditEventsForKpi(goals, auditKpiId);
  return {
    strategicSummary: summary,
    strategicBoardReport: buildStrategicBoardReportFromSummary({
      summary,
      goals,
    }),
    strategicActuals: actuals,
    strategicAuditEvents,
  };
}

function auditEventsForKpi(
  goals: ReturnType<typeof listStrategicGoals>,
  kpiId: number,
) {
  const identities = new Set<string>();
  let kpiName = "";
  for (const goal of goals) {
    const member = goal.members.find((candidate) => candidate.kpi_id === kpiId);
    if (!member) continue;
    kpiName = member.kpi.name;
    identities.add(`strategic_goal:${goal.id}`);
    identities.add(`goal_membership:${member.id}`);
    if (member.configuration) {
      identities.add(`measurement_config:${member.configuration.id}`);
    }
    for (const target of member.targets) identities.add(`target:${target.id}`);
    for (const component of member.components) {
      identities.add(`component:${component.id}`);
      for (const target of component.targets) identities.add(`target:${target.id}`);
    }
  }
  return listStrategicAuditEvents({ limit: 500 }).filter(
    (event) =>
      identities.has(`${event.entity_type}:${event.entity_id}`) ||
      (kpiName !== "" && event.entity_display_name.includes(kpiName)),
  );
}

export function loadOverviewPageData(
  opts?: { throughMonth?: number; year?: number },
): DashboardData {
  const year = opts?.year ?? new Date().getFullYear();
  const kpis = listKPIs();
  const entries = listEntries();
  return {
    categories: listCategories(),
    kpis,
    entries,
    breakdowns: listBreakdowns(),
    goals: listGoals({
      enabledOnly: true,
      throughMonth: opts?.throughMonth,
      asOfYear: opts?.year,
    }),
    ...strategyReporting({
      kpis,
      entries,
      year,
      throughMonth: opts?.throughMonth,
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
  const kpis = listKPIs().filter((kpi) => kpi.category_id === category.id);
  const entries = listEntries({ category_id: category.id });
  const year = opts?.year ?? new Date().getFullYear();

  return {
    categories: [category],
    kpis,
    entries,
    breakdowns: listBreakdowns({ category_id: category.id }),
    goals: listGoals({
      category_id: category.id,
      enabledOnly: true,
      throughMonth: opts?.throughMonth,
      asOfYear: opts?.year,
    }),
    ...strategyReporting({
      kpis,
      entries,
      year,
      throughMonth: opts?.throughMonth,
      priorityId: category.id,
    }),
    ...pageMetadata(),
  };
}

export function loadMetricDetailPageData(
  kpiSlug: string,
  opts?: { throughMonth?: number; year?: number; includeAudit?: boolean },
): DashboardData | null {
  const kpi = getKPIBySlug(kpiSlug);
  if (!kpi) return null;
  const category = getCategory(kpi.category_id);
  if (!category) return null;
  const entries = listEntries({ kpi_id: kpi.id });
  const year = opts?.year ?? new Date().getFullYear();

  return {
    categories: [category],
    kpis: [kpi],
    entries,
    breakdowns: listBreakdowns({ kpi_id: kpi.id }),
    goals: listGoals({
      enabledOnly: true,
      kpi_id: kpi.id,
      throughMonth: opts?.throughMonth,
      asOfYear: opts?.year,
    }),
    ...strategyReporting({
      kpis: [kpi],
      entries,
      year,
      throughMonth: opts?.throughMonth,
      priorityId: category.id,
      ...(opts?.includeAudit ? { auditKpiId: kpi.id } : {}),
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
