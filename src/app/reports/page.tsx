import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Alert, LinkButton, PageHeader } from "@/components/ui";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import {
  listReportingPlans,
  listReportYears,
  listStrategicReportingPeriods,
  loadBoardReportPageData,
  loadStrategicTrendReportData,
  reportingCycleThroughMonth,
  resolveReportingPlanContext,
} from "@/features/reporting/server";
import {
  reportingCycleForSelection,
  resolveStrategicReportingYear,
} from "@/features/strategy";
import { getActiveInstallation } from "@/features/installation/server";
import { firstSearchParam } from "@/lib/search-params";
import { BoardReportView } from "./BoardReportView";
import { ReportFilters } from "./ReportFilters";
import { StrategicTrendsView } from "./StrategicTrendsView";
import { ArchivedPlanDetailsView } from "./ArchivedPlanDetailsView";

export const dynamic = "force-dynamic";

/** Renders the reports page interface. */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");

  const params = await searchParams;
  const audience = user.role === "board" ? "board" : "staff";
  const installation = getActiveInstallation();
  const rawPlanId = firstSearchParam(params.plan);
  const planId = rawPlanId === undefined || !/^[1-9]\d*$/.test(rawPlanId)
    ? undefined
    : Number(rawPlanId);
  if (rawPlanId !== undefined && planId === undefined) notFound();
  const plan = resolveReportingPlanContext(planId);
  if (!plan) notFound();
  const archivedBoardAudience =
    audience === "board" && plan.lifecycleState === "archived";
  const requestedView = firstSearchParam(params.view);
  const view =
    !archivedBoardAudience &&
    plan.lifecycleState === "archived" &&
    requestedView === "details"
      ? "details"
      : !archivedBoardAudience && requestedView === "trends"
        ? "trends"
        : "board";
  const years = listReportYears(plan);
  const year = resolveStrategicReportingYear(
    firstSearchParam(params.year),
    years,
  );
  const periods = listStrategicReportingPeriods(year, audience, plan);
  const rawPeriod = firstSearchParam(params.period);
  const period = reportingCycleForSelection(rawPeriod, periods);
  const throughMonth = reportingCycleThroughMonth(period);

  return (
    <AppShell user={user} organizationShortName={installation.organization.shortName} planName={installation.plan.name}>
      <div className="page-content page-content-wide page-enter">
        <PageHeader
          title={plan.lifecycleState === "archived" ? "Archived Plan Review" : "Reports"}
          subtitle={
            plan.lifecycleState === "archived"
              ? `${plan.name}, ${plan.startYear}–${plan.endYear}`
              : undefined
          }
          className="reports-product-header"
        />
        {plan.lifecycleState === "archived" ? (
          <Alert className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <span>
              You are reviewing a read-only Archived Strategic Plan. This selection applies only to this Reports link.
            </span>
            <LinkButton href="/reports" size="sm">
              Return to Active plan
            </LinkButton>
          </Alert>
        ) : null}
        <ReportFilters
          view={view}
          year={year}
          years={years}
          period={period}
          periods={periods}
          plans={listReportingPlans()}
          plan={plan}
          allowTrends={!archivedBoardAudience}
          allowDetails={
            plan.lifecycleState === "archived" && audience === "staff"
          }
        />
        {view === "board" ? (
          <BoardReportView
            data={loadBoardReportPageData({
              year,
              throughMonth,
              reportingPeriod: period,
              audience,
              plan,
            })}
          />
        ) : view === "trends" ? (
          <StrategicTrendsView
            data={loadStrategicTrendReportData({
              year,
              throughMonth,
              reportingPeriod: period,
              audience,
              plan,
            })}
            reportingPeriod={period.label}
          />
        ) : (
          <ArchivedPlanDetailsView
            data={loadBoardReportPageData({
              year,
              throughMonth,
              reportingPeriod: period,
              audience,
              plan,
            })}
          />
        )}
      </div>
    </AppShell>
  );
}
