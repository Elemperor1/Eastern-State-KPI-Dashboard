import { listKPIs } from "@/features/catalog/server";
import {
  STRATEGIC_PLAN_REPORTING_YEARS,
  buildReportingCycleOptions,
  type ReportingCycleOption,
} from "@/features/strategy";
import {
  listStrategicAuditEvents,
  listStrategicAuditIdentitiesForKpi,
  listStrategicGoals,
} from "@/features/strategy/server";
import { isSampleDataEnabled } from "@/lib/app-meta";
import { humanizeReportingReason } from "./language";
import { buildStrategicBoardReportFromSummary } from "./strategic-board-adapter";
import type {
  BoardReportPageData,
  StrategicMetricPageData,
  StrategicPriorityPageData,
  StrategicTrendReportData,
} from "./types";
import { listCalculatedStrategyActuals } from "./strategy-actuals-server";
import type { StrategicCalculatedActual } from "./strategy-actuals";
import { buildStrategicDashboardSummary } from "./strategy-summary";
import type { StrategicDashboardSummary } from "./strategy-summary";

export function listDashboardYears(): number[] {
  return [...STRATEGIC_PLAN_REPORTING_YEARS];
}

function uniqueKpiIds(
  goals: ReturnType<typeof listStrategicGoals>,
): number[] {
  return Array.from(
    new Set(goals.flatMap((goal) => goal.members.map((member) => member.kpi_id))),
  );
}

function loadStrategicReportModel({
  year,
  throughMonth = 12,
  priorityId,
  reportingPeriod,
}: {
  year: number;
  throughMonth?: number;
  priorityId?: number;
  reportingPeriod?: ReportingCycleOption;
}) {
  const goals = listStrategicGoals({
    year,
    ...(priorityId === undefined ? {} : { priority_id: priorityId }),
  });
  const actuals = listCalculatedStrategyActuals({
    kpiIds: uniqueKpiIds(goals),
    throughYear: year,
  });
  const scopedActuals = reportingPeriod
    ? actuals.filter((actual) => actualIncludedInReportingCycle(actual, reportingPeriod))
    : actuals;
  const summary = buildStrategicDashboardSummary({
    goals,
    kpis: listKPIs(),
    selectedYear: year,
    throughMonth,
    actuals: scopedActuals,
  });
  return {
    goals,
    actuals: scopedActuals,
    summary,
    report: buildStrategicBoardReportFromSummary({
      summary,
      goals,
      reportingPeriod: reportingPeriod?.label,
    }),
  };
}

export function listStrategicReportingPeriods(year: number): ReportingCycleOption[] {
  const goals = listStrategicGoals({ year });
  return buildReportingCycleOptions(
    goals.flatMap((goal) =>
      goal.members.map((member) => member.configuration?.reporting_frequency ?? null),
    ),
    year,
  );
}

export function reportingCycleThroughMonth(period: ReportingCycleOption): number {
  if (period.periodType === "monthly") return period.periodIndex;
  if (period.periodType === "quarterly") return period.periodIndex * 3;
  return 12;
}

export interface ExecutiveOverviewPageData {
  years: number[];
  sampleData: boolean;
  summary: StrategicDashboardSummary;
  needsAttention: Array<{
    goalId: string;
    goalName: string;
    priorityName: string;
    reason: string;
  }>;
}

/** Narrow Overview model: no report markup, legacy values, audit rows, or exports. */
export function loadExecutiveOverviewPageData({
  year,
  throughMonth,
}: {
  year: number;
  throughMonth?: number;
}): ExecutiveOverviewPageData {
  const { summary } = loadStrategicReportModel({ year, throughMonth });
  const priorityById = new Map(
    summary.priorities.map((priority) => [priority.priorityId, priority.priorityName]),
  );
  const needsAttention = summary.organization.excludedGoalReasons
    .flatMap((item) =>
      item.reasons.map((reason) => ({
        goalId: item.goalId,
        goalName: item.goalName,
        priorityName:
          priorityById.get(
            summary.goals.find((goal) => goal.goalId === item.goalId)?.priorityId ?? "",
          ) ?? "Strategic plan",
        reason: humanizeReportingReason(reason),
      })),
    )
    .slice(0, 5);
  return {
    years: listDashboardYears(),
    sampleData: isSampleDataEnabled(),
    summary,
    needsAttention,
  };
}

/** Board Report work occurs only on the explicit Reports route. */
export function loadBoardReportPageData({
  year,
  throughMonth = 12,
  reportingPeriod,
}: {
  year: number;
  throughMonth?: number;
  reportingPeriod?: ReportingCycleOption;
}): BoardReportPageData {
  const { report } = loadStrategicReportModel({
    year,
    throughMonth,
    reportingPeriod,
  });
  return {
    years: listDashboardYears(),
    sampleData: isSampleDataEnabled(),
    report,
  };
}

export function loadStrategicPriorityPageData(
  prioritySlug: string,
  { year, throughMonth = 12 }: { year: number; throughMonth?: number },
): StrategicPriorityPageData | null {
  const context = listStrategicGoals({ year }).find(
    (goal) => goal.priority_slug === prioritySlug,
  );
  if (!context) return null;
  const { report } = loadStrategicReportModel({
    year,
    throughMonth,
    priorityId: context.priority_id,
  });
  const priority = report.priorities.find(
    (candidate) => candidate.id === String(context.priority_id),
  );
  if (!priority) return null;
  const kpiSlugs = Object.fromEntries(
    listKPIs().map((kpi) => [String(kpi.id), kpi.slug]),
  );
  return {
    years: listDashboardYears(),
    sampleData: isSampleDataEnabled(),
    selectedYear: year,
    prioritySlug,
    priority,
    kpiSlugs,
  };
}

export function loadStrategicMetricPageData(
  kpiSlug: string,
  {
    year,
    throughMonth = 12,
    includeAudit = false,
  }: { year: number; throughMonth?: number; includeAudit?: boolean },
): StrategicMetricPageData | null {
  const catalogKpi = listKPIs().find((kpi) => kpi.slug === kpiSlug);
  if (!catalogKpi) return null;
  const goals = listStrategicGoals({ year });
  const context = goals
    .flatMap((goal) => goal.members.map((member) => ({ goal, member })))
    .find(({ member }) => member.kpi_id === catalogKpi.id);
  if (!context) return null;
  const { report, actuals } = loadStrategicReportModel({ year, throughMonth });
  const kpi = report.priorities
    .flatMap((priority) => priority.goals)
    .flatMap((goal) => goal.kpis)
    .find((candidate) => candidate.id === String(catalogKpi.id));
  if (!kpi) return null;
  return {
    years: listDashboardYears(),
    sampleData: isSampleDataEnabled(),
    selectedYear: year,
    priorityName: context.goal.priority_name,
    prioritySlug: context.goal.priority_slug,
    goalName: context.goal.name,
    kpi,
    actuals: actuals.filter((actual) => actual.kpiId === catalogKpi.id),
    strategicAuditEvents: includeAudit
      ? listStrategicAuditEvents({
          identities: listStrategicAuditIdentitiesForKpi(catalogKpi.id),
          limit: 500,
        })
      : [],
  };
}

function periodIncluded(
  actual: StrategicCalculatedActual,
  throughMonth: number,
): boolean {
  if (actual.periodType === "monthly") return actual.periodIndex <= throughMonth;
  if (actual.periodType === "quarterly") {
    return actual.periodIndex <= Math.ceil(throughMonth / 3);
  }
  return true;
}

function actualIncludedInReportingCycle(
  actual: StrategicCalculatedActual,
  reportingPeriod: ReportingCycleOption,
): boolean {
  if (actual.periodType !== reportingPeriod.periodType) return false;
  if (
    reportingPeriod.periodType === "monthly" ||
    reportingPeriod.periodType === "quarterly"
  ) {
    return actual.periodIndex <= reportingPeriod.periodIndex;
  }
  return actual.periodIndex === reportingPeriod.periodIndex;
}

const PERIOD_RANK: Record<StrategicCalculatedActual["periodType"], number> = {
  monthly: 1,
  quarterly: 2,
  annual: 3,
  cumulative: 4,
  one_time: 5,
};

/** Trends use only strategic calculated results and honor the selected cutoff. */
export function loadStrategicTrendReportData({
  year = Math.max(...STRATEGIC_PLAN_REPORTING_YEARS),
  throughMonth = 12,
  reportingPeriod,
}: {
  year?: number;
  throughMonth?: number;
  reportingPeriod?: ReportingCycleOption;
} = {}): StrategicTrendReportData {
  const years = STRATEGIC_PLAN_REPORTING_YEARS.filter(
    (candidate) => candidate <= year,
  );
  const goals = listStrategicGoals({ year });
  const members = Array.from(
    new Map(
      goals.flatMap((goal) =>
        goal.members.map((member) => [member.kpi_id, { goal, member }] as const),
      ),
    ).values(),
  );
  const actuals = listCalculatedStrategyActuals({
    kpiIds: members.map(({ member }) => member.kpi_id),
    throughYear: year,
  });

  return {
    years,
    series: members
      .map(({ goal, member }) => ({
        kpiId: member.kpi_id,
        kpiName: member.kpi.name,
        priorityName: goal.priority_name,
        unit: member.configuration?.unit ?? member.kpi.unit,
        points: years.map((pointYear) => {
          const candidates = actuals.filter(
            (actual) =>
              actual.kpiId === member.kpi_id &&
              actual.year === pointYear &&
              (reportingPeriod
                ? actualIncludedInReportingCycle(actual, reportingPeriod)
                : pointYear < year || periodIncluded(actual, throughMonth)),
          );
          const latest = candidates.sort(
            (left, right) =>
              PERIOD_RANK[left.periodType] - PERIOD_RANK[right.periodType] ||
              left.periodIndex - right.periodIndex,
          ).at(-1);
          return { year: pointYear, value: latest?.value ?? null };
        }),
      }))
      .sort((left, right) => left.kpiName.localeCompare(right.kpiName)),
  };
}
