import { listKPIs } from "@/features/catalog/server";
import {
  buildReportingCycleOptions,
  type ReportingCycleOption,
} from "@/features/strategy";
import { getActiveInstallation } from "@/features/installation/server";
import {
  getArchivedPlan,
  listStrategicPlans,
  PlanLifecycleNotFoundError,
} from "@/features/plans/server";
import {
  listStrategicAuditEvents,
  listStrategicAuditIdentitiesForKpi,
  listKpiIdsWithArchivedIntervalValues,
  type listStrategicGoals,
  listStrategicGoalsForReportingDisclosure,
} from "@/features/strategy/server";
import { isSampleDataEnabled } from "@/lib/app-meta";
import { humanizeReportingReason } from "./language";
import { buildStrategicBoardReportFromSummary } from "./strategic-board-adapter";
import type {
  BoardReportPageData,
  ReportingPlanContext,
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
import { getBoardReportingDisclosureScope } from "@/features/board-reporting";

export type ReportingAudience = "staff" | "board";

/** Maps one lifecycle-owned plan into the narrow reporting context. */
function asReportingPlanContext(
  plan: Pick<
    ReturnType<typeof listStrategicPlans>[number],
    "id" | "slug" | "name" | "startYear" | "endYear" | "lifecycleState"
  >,
): ReportingPlanContext {
  if (
    plan.lifecycleState !== "active" &&
    plan.lifecycleState !== "archived"
  ) {
    throw new Error("Only Active and Archived Strategic Plans can be reported.");
  }
  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    startYear: plan.startYear,
    endYear: plan.endYear,
    lifecycleState: plan.lifecycleState,
    years: Array.from(
      { length: plan.endYear - plan.startYear + 1 },
      (_, index) => plan.startYear + index,
    ),
  };
}

/** Returns the Active plan first and every reportable Archived plan after it. */
export function listReportingPlans(): ReportingPlanContext[] {
  const installation = getActiveInstallation();
  const active = asReportingPlanContext({
    ...installation.plan,
    lifecycleState: "active",
  });
  const archived = listStrategicPlans()
    .filter(
      (plan) =>
        plan.organizationId === installation.organization.id &&
        plan.lifecycleState === "archived",
    )
    .map(asReportingPlanContext);
  return [active, ...archived];
}

/**
 * Resolves an explicit Archived-plan request. Omitting the id always returns
 * the Active plan; an explicit Active, Draft, Cancelled, or foreign plan is
 * deliberately rejected so this never becomes a sticky plan switch.
 */
export function resolveReportingPlanContext(
  archivedPlanId?: number,
): ReportingPlanContext | null {
  const installation = getActiveInstallation();
  if (archivedPlanId === undefined) {
    return asReportingPlanContext({
      ...installation.plan,
      lifecycleState: "active",
    });
  }
  try {
    const plan = getArchivedPlan(archivedPlanId);
    if (plan.organizationId !== installation.organization.id) return null;
    return asReportingPlanContext(plan);
  } catch (error) {
    if (error instanceof PlanLifecycleNotFoundError) return null;
    throw error;
  }
}

/** Keeps Board reporting on the explicitly approved priorities and measures. */
function scopeGoalsForAudience(
  goals: ReturnType<typeof listStrategicGoals>,
  audience: ReportingAudience,
  planId: number,
): ReturnType<typeof listStrategicGoals> {
  if (audience !== "board") return goals;
  const scope = getBoardReportingDisclosureScope(planId);
  const scopeByPriority = new Map(
    scope.priorities.map((priority) => [
      priority.prioritySlug,
      {
        displayTitle: priority.displayTitle,
        measureSlugs: new Set(
          priority.statements.flatMap((statement) =>
            statement.measures.map((measure) => measure.slug),
          ),
        ),
      },
    ]),
  );
  return goals
    .filter((goal) => scopeByPriority.has(goal.priority_slug))
    .map((goal) => {
      const priorityScope = scopeByPriority.get(goal.priority_slug)!;
      return {
        ...goal,
        priority_name: priorityScope.displayTitle,
        members: goal.members.filter((member) =>
          priorityScope.measureSlugs.has(member.kpi.slug),
        ),
        archived_members: goal.archived_members?.filter((member) =>
          priorityScope.measureSlugs.has(member.kpi_slug),
        ),
      };
    })
    .filter(
      (goal) =>
        goal.members.length > 0 || (goal.archived_members?.length ?? 0) > 0,
    );
}

/**
 * Lists goals through the narrow reporting-disclosure read. Staff and Board
 * reports both need archived Priority context so exclusions never disappear;
 * Board authorization is applied separately by `scopeGoalsForAudience`.
 */
function listGoalsForReporting(
  filter: Parameters<typeof listStrategicGoals>[0],
): ReturnType<typeof listStrategicGoals> {
  return listStrategicGoalsForReportingDisclosure(filter);
}

/** Retrieves dashboard years. */
export function listDashboardYears(): number[] {
  return [...getActiveInstallation().years];
}

/** Returns only the Reporting Years owned by the supplied request context. */
export function listReportYears(plan: ReportingPlanContext): number[] {
  return [...plan.years];
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
  plan = resolveReportingPlanContext()!,
}: {
  year: number;
  throughMonth?: number;
  priorityId?: number;
  reportingPeriod?: ReportingCycleOption;
  audience?: ReportingAudience;
  plan?: ReportingPlanContext;
}) {
  const installation = getActiveInstallation();
  const goals = scopeGoalsForAudience(listGoalsForReporting({
    year,
    planId: plan.id,
    ...(priorityId === undefined ? {} : { priority_id: priorityId }),
  }), audience, plan.id);
  const actuals = listCalculatedStrategyActuals({
    kpiIds: uniqueKpiIds(goals),
    throughYear: year,
    planStartYear: plan.startYear,
    planId: plan.id,
  });
  const scopedActuals = reportingPeriod
    ? actuals.filter((actual) => actualIncludedInReportingCycle(actual, reportingPeriod))
    : actuals;
  const summary = buildStrategicDashboardSummary({
    goals,
    kpis: listKPIs({ planId: plan.id }),
    selectedYear: year,
    planStartYear: plan.startYear,
    throughMonth,
    actuals: scopedActuals,
    hiddenValueKpiIds: listKpiIdsWithArchivedIntervalValues(uniqueKpiIds(goals)),
  });
  const report = buildStrategicBoardReportFromSummary({
    summary,
    goals,
    organizationName: installation.organization.name,
    organizationSlug: installation.organization.slug,
    reportingPeriod: reportingPeriod?.label,
    plan: {
      id: plan.id,
      slug: plan.slug,
      name: plan.name,
      startYear: plan.startYear,
      endYear: plan.endYear,
      lifecycleState: plan.lifecycleState,
      generatedAt: new Date().toISOString(),
    },
  });
  if (audience === "board") {
    const scopeByPriorityId = new Map(
      getBoardReportingDisclosureScope(plan.id).priorities.map((priority) => [
        String(priority.priorityId),
        priority,
      ]),
    );
    report.priorities = report.priorities.map((priority) => ({
      ...priority,
      focusStatements:
        scopeByPriorityId
          .get(priority.id)
          ?.statements.map((statement) => statement.text) ?? [],
    }));
  }
  return {
    goals,
    actuals: scopedActuals,
    summary,
    report,
  };
}

/** Retrieves strategic reporting periods. */
export function listStrategicReportingPeriods(
  year: number,
  audience: ReportingAudience = "staff",
  plan = resolveReportingPlanContext()!,
): ReportingCycleOption[] {
  const goals = scopeGoalsForAudience(
    listGoalsForReporting({ year, planId: plan.id }),
    audience,
    plan.id,
  );
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
  // Goal-level reasons include excluded measures even when the goal remains
  // eligible. Organization rollups intentionally list only wholly excluded
  // goals, so using them here would make a weak archived measure disappear
  // from Overview while the recomputed goal still looked reporting-ready.
  const needsAttention = Array.from(
    new Map(
      summary.goals.flatMap((goal) =>
        goal.result.exclusionReasons
          .filter((reason) => reason !== "informational")
          .map((reason) => [
            `${goal.goalId}:${reason}`,
            {
              goalId: goal.goalId,
              goalName: goal.goalName,
              priorityName: goal.priorityName,
              reason: humanizeReportingReason(reason),
            },
          ] as const),
      ),
    ).values(),
  ).slice(0, 5);
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
  plan,
}: {
  year: number;
  throughMonth?: number;
  reportingPeriod?: ReportingCycleOption;
  audience?: ReportingAudience;
  plan?: ReportingPlanContext;
}): BoardReportPageData {
  const { report } = loadStrategicReportModel({
    year,
    throughMonth,
    reportingPeriod,
    audience,
    ...(plan ? { plan } : {}),
  });
  return {
    years: plan ? listReportYears(plan) : listDashboardYears(),
    sampleData: isSampleDataEnabled(),
    report,
    boardScopeReviewStatus:
      audience === "board"
          ? getBoardReportingDisclosureScope(
            plan?.id ?? resolveReportingPlanContext()!.id,
          ).reviewStatus ?? "needs_review"
        : "approved",
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
    !getBoardReportingDisclosureScope().priorities.some(
      (priority) => priority.prioritySlug === prioritySlug,
    )
  ) return null;
  const context = listGoalsForReporting({ year }).find(
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
  const activePlanId = getActiveInstallation().plan.id;
  const goals = scopeGoalsForAudience(
    listGoalsForReporting({ year }),
    audience,
    activePlanId,
  );
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
  if (
    reportingPeriod.periodType === "annual" &&
    (actual.periodType === "monthly" || actual.periodType === "quarterly")
  ) {
    return true;
  }
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
  plan = resolveReportingPlanContext()!,
}: {
  year?: number;
  throughMonth?: number;
  reportingPeriod?: ReportingCycleOption;
  audience?: ReportingAudience;
  plan?: ReportingPlanContext;
} = {}): StrategicTrendReportData {
  const years = plan.years.filter(
    (candidate) => candidate <= year,
  );
  const goals = scopeGoalsForAudience(
    listGoalsForReporting({ year, planId: plan.id }),
    audience,
    plan.id,
  );
  const members = Array.from(
    new Map(
      goals.flatMap((goal) =>
        goal.members.map((member) => [member.kpi_id, { goal, member }] as const),
      ),
    ).values(),
  );
  const memberIds = members.map(({ member }) => member.kpi_id);
  const activeMemberIds = new Set(memberIds);
  const excludedMeasures = Array.from(
    new Map(
      goals.flatMap((goal) =>
        (goal.archived_members ?? []).map((member) => [
          member.kpi_id,
          {
            kpiId: member.kpi_id,
            kpiName: member.kpi_name,
            priorityName: goal.priority_name,
            reason: "archived" as const,
          },
        ] as const),
      ),
    ).values(),
  )
    .filter((measure) => !activeMemberIds.has(measure.kpiId))
    .sort((left, right) => left.kpiName.localeCompare(right.kpiName));
  const hiddenValueKpiIds = listKpiIdsWithArchivedIntervalValues(memberIds);
  const actuals = listCalculatedStrategyActuals({
    kpiIds: memberIds,
    throughYear: year,
    planStartYear: plan.startYear,
    planId: plan.id,
  });

  return {
    organizationSlug: getActiveInstallation().organization.slug,
    years,
    excludedMeasures,
    series: members
      .map(({ goal, member }) => ({
        kpiId: member.kpi_id,
        kpiName: member.kpi.name,
        priorityName: goal.priority_name,
        unit: member.configuration?.unit ?? member.kpi.unit,
        restoredWithHiddenData: hiddenValueKpiIds.has(member.kpi_id),
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
