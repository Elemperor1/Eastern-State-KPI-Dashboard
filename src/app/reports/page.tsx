import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import {
  listDashboardYears,
  listStrategicReportingPeriods,
  loadBoardReportPageData,
  loadStrategicTrendReportData,
  reportingCycleThroughMonth,
} from "@/features/reporting/server";
import { reportingCycleForSelection } from "@/features/strategy";
import { getActiveInstallation } from "@/features/installation/server";
import { firstSearchParam } from "@/lib/search-params";
import { BoardReportView } from "./BoardReportView";
import { ReportFilters } from "./ReportFilters";
import { StrategicTrendsView } from "./StrategicTrendsView";

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
  const installation = getActiveInstallation();
  const view = firstSearchParam(params.view) === "trends"
    ? "trends"
    : "board";
  const years = listDashboardYears();
  const rawYear = Number(firstSearchParam(params.year));
  const year = years.includes(rawYear) ? rawYear : Math.max(...years);
  const periods = listStrategicReportingPeriods(year);
  const rawPeriod = firstSearchParam(params.period);
  const period = reportingCycleForSelection(rawPeriod, periods);
  const throughMonth = reportingCycleThroughMonth(period);

  return (
    <AppShell user={user} organizationShortName={installation.organization.shortName} planName={installation.plan.name}>
      <div className="page-content page-content-wide page-enter">
        <PageHeader title="Reports" />
        <ReportFilters
          view={view}
          year={year}
          years={years}
          period={period}
          periods={periods}
        />
        {view === "board" ? (
          <BoardReportView
            data={loadBoardReportPageData({
              year,
              throughMonth,
              reportingPeriod: period,
            })}
          />
        ) : (
          <StrategicTrendsView
            data={loadStrategicTrendReportData({
              year,
              throughMonth,
              reportingPeriod: period,
            })}
            reportingPeriod={period.label}
          />
        )}
      </div>
    </AppShell>
  );
}
