import { listKPIs } from "@/features/catalog/server";
import {
  buildReportingCycleOptions,
  type ReportingCycleOption,
} from "@/features/strategy";
import { getActiveInstallation } from "@/features/installation/server";
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
import {
  buildStrategicDashboardSummary,
  type StrategicDashboardSummary,
} from "./strategy-summary";
import { getBoardReportingScope } from "@/features/board-reporting";

export type ReportingAudience = "staff" | "board";

/** Keeps Board reporting on the explicitly approved priorities and measures. */
function scopeGoalsForAudience(
  goals: ReturnType<typeof listStrategicGoals>,
  audience: ReportingAudience,
): ReturnType<typeof listStrategicGoals> {
  if (audience !== "board") return goals;
  const scope = getBoardReportingScope();
  const prioritySlugs = new Set(
    scope.priorities.map((priority) => priority.prioritySlug),
  );
  const kpiSlugs = new Set(
    scope.priorities.flatMap((priority) =>
      priority.statements.flatMap((statement) =>
        statement.measures.map((measure) => measure.slug),
      ),
    ),
  );
  return goals
    .filter((goal) => prioritySlugs.has(goal.priority_slug))
    .map((goal) => ({
      ...goal,
      members: goal.members.filter((member) => kpiSlugs.has(member.kpi.slug)),
    }))
    .filter((goal) => goal.members.length > 0);
}

/** Retrieves dashboard years. */
export function listDashboardYears(): number[] {
  return [...getActiveInstallation().years];
}

/** Implements the unique kpi ids operation. */
function uniqueKpiIds(
  goals: ReturnType<typeof listStrategicGoals>,
): number[] {
  return Array.from(
    new Set(goals.flatMap((goal) => goal.members.map((member) => member.kpi_id))),
  );
}

/** Retrieves strategic report model. */
function loadStrategicReportModel({
  year,
  throughMonth = 12,
  priorityId,
  reportingPeriod,
  audience = "staff",
}: {
  year: number;
  throughMonth?: number;
  priorityId?: number;
  reportingPeriod?: ReportingCycleOption;
  audience?: ReportingAudience;
}) {
  const installation = getActiveInstallation();
  const goals = scopeGoalsForAudience(listStrategicGoals({
    year,
    ...(priorityId === undefined ? {} : { priority_id: priorityId }),
  }), audience);
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
    planStartYear: installation.plan.startYear,
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
      organizationName: installation.organization.name,
      organizationSlug: installation.organization.slug,
      reportingPeriod: reportingPeriod?.label,
    }),
  };
}

/** Retrieves strategic reporting periods. */
export function listStrategicReportingPeriods(
  year: number,
  audience: ReportingAudience = "staff",
): ReportingCycleOption[] {
  const goals = scopeGoalsForAudience(listStrategicGoals({ year }), audience);
  return buildReportingCycleOptions(
    goals.flatMap((goal) =>
      goal.members.map((member) => member.configuration?.reporting_frequency ?? null),
    ),
    year,
  );
}

/** Implements the reporting cycle through month operation. */
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
  audience = "staff",
}: {
  year: number;
  throughMonth?: number;
  audience?: ReportingAudience;
}): ExecutiveOverviewPageData {
  const { summary } = loadStrategicReportModel({ year, throughMonth, audience });
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
  audience = "staff",
}: {
  year: number;
  throughMonth?: number;
  reportingPeriod?: ReportingCycleOption;
  audience?: ReportingAudience;
}): BoardReportPageData {
  const { report } = loadStrategicReportModel({
    year,
    throughMonth,
    reportingPeriod,
    audience,
  });
  return {
    years: listDashboardYears(),
    sampleData: isSampleDataEnabled(),
    report,
  };
}

/** Retrieves strategic priority page data. */
export function loadStrategicPriorityPageData(
  prioritySlug: string,
  {
    year,
    throughMonth = 12,
    audience = "staff",
  }: { year: number; throughMonth?: number; audience?: ReportingAudience },
): StrategicPriorityPageData | null {
  if (
    audience === "board" &&
    !getBoardReportingScope().priorities.some(
      (priority) => priority.prioritySlug === prioritySlug,
    )
  ) return null;
  const context = listStrategicGoals({ year }).find(
    (goal) => goal.priority_slug === prioritySlug,
  );
  if (!context) return null;
  const { report } = loadStrategicReportModel({
    year,
    throughMonth,
    priorityId: context.priority_id,
    audience,
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

/** Retrieves strategic metric page data. */
export function loadStrategicMetricPageData(
  kpiSlug: string,
  {
    year,
    throughMonth = 12,
    includeAudit = false,
    audience = "staff",
  }: {
    year: number;
    throughMonth?: number;
    includeAudit?: boolean;
    audience?: ReportingAudience;
  },
): StrategicMetricPageData | null {
  const catalogKpi = listKPIs().find((kpi) => kpi.slug === kpiSlug);
  if (!catalogKpi) return null;
  if (
    audience === "board" &&
    !getBoardReportingScope().priorities.some((priority) =>
      priority.statements.some((statement) =>
        statement.measures.some((measure) => measure.slug === kpiSlug),
      ),
    )
  ) return null;
  const goals = listStrategicGoals({ year });
  const context = goals
    .flatMap((goal) => goal.members.map((member) => ({ goal, member })))
    .find(({ member }) => member.kpi_id === catalogKpi.id);
  if (!context) return null;
  const { report, actuals } = loadStrategicReportModel({ year, throughMonth, audience });
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
    goalId: context.goal.id,
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

/** Implements the period included operation. */
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

/** Implements the actual included in reporting cycle operation. */
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
  year = getActiveInstallation().plan.endYear,
  throughMonth = 12,
  reportingPeriod,
  audience = "staff",
}: {
  year?: number;
  throughMonth?: number;
  reportingPeriod?: ReportingCycleOption;
  audience?: ReportingAudience;
} = {}): StrategicTrendReportData {
  const years = getActiveInstallation().years.filter(
    (candidate) => candidate <= year,
  );
  const goals = scopeGoalsForAudience(listStrategicGoals({ year }), audience);
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
    organizationSlug: getActiveInstallation().organization.slug,
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
