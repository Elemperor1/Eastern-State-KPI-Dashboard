import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ReportingYearFilter } from "@/components/ReportingYearFilter";
import { SampleDataBadge } from "@/components/SampleDataBadge";
import { Badge, Breadcrumb, EmptyState, PageHeader, Progress } from "@/components/ui";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import { listDashboardYears, loadStrategicPriorityPageData } from "@/features/reporting/server";
import { formatBoardReportPercentage, formatBoardReportToken } from "@/components/strategic-board-report-presentation";
import { getActiveInstallation } from "@/features/installation/server";

export const dynamic = "force-dynamic";

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function statusVariant(status: string) {
  if (["complete", "exceeded", "on_track"].includes(status)) return "success" as const;
  if (["needs_target", "target_not_finalized"].includes(status)) return "incomplete" as const;
  if (["at_risk", "needs_definition"].includes(status)) return "warning" as const;
  if (status === "off_track") return "error" as const;
  return "info" as const;
}

export default async function StrategicPriorityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query, user] = await Promise.all([
    params,
    searchParams,
    getCurrentUserReadOnly(),
  ]);
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");

  const years = listDashboardYears();
  const installation = getActiveInstallation();
  const requestedYear = Number(firstValue(query.year));
  const selectedYear = years.includes(requestedYear) ? requestedYear : Math.max(...years);
  const data = loadStrategicPriorityPageData(slug, { year: selectedYear });
  if (!data) redirect("/dashboard/overview");

  return (
    <AppShell user={user} organizationShortName={installation.organization.shortName} planName={installation.plan.name}>
      <div className="page-content page-enter">
        <Breadcrumb href="/dashboard/overview" label="Overview" />
        <PageHeader
          title={data.priority.name}
          actions={<SampleDataBadge sample={data.sampleData} />}
        />

        <div className="mb-8 flex justify-end">
          <ReportingYearFilter
            path={`/dashboard/category/${slug}`}
            year={data.selectedYear}
            years={data.years}
          />
        </div>

        <section className="mb-10 border-b border-ink-200 pb-8" aria-labelledby="priority-progress">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="priority-progress" className="text-sm font-medium text-ink-600">Goal progress</h2>
              <p className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-ink-950 tabular">
                {formatBoardReportPercentage(data.priority.goalCompletion.completionPercentage)}
              </p>
            </div>
            <p className="text-sm font-semibold text-ink-700">
              {data.priority.goalCompletion.countLabel}
            </p>
          </div>
          <Progress
            value={data.priority.goalCompletion.completionPercentage ?? 0}
            className="mt-4 h-3"
            aria-label={`${data.priority.name} goal progress`}
            aria-valuetext={formatBoardReportPercentage(data.priority.goalCompletion.completionPercentage)}
          />
        </section>

        <section aria-labelledby="goals-heading">
          <h2 id="goals-heading" className="section-title mb-5">Goals and measures</h2>
          {data.priority.goals.length === 0 ? (
            <EmptyState title="No goals yet" description="Add a goal in Setup to begin reporting." />
          ) : (
            <div className="divide-y divide-ink-200 border-y border-ink-200">
              {data.priority.goals.map((goal) => (
                <section key={goal.id} className="py-6" aria-labelledby={`goal-${goal.id}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 id={`goal-${goal.id}`} className="text-lg font-semibold text-ink-950">{goal.name}</h3>
                      <p className="mt-1 text-sm text-ink-600">
                        {goal.completedKpisCount} of {goal.totalEligibleKpisCount} measures complete
                      </p>
                    </div>
                    <Badge variant={statusVariant(goal.completionStatus)} label="Goal status">
                      {formatBoardReportToken(goal.completionStatus)}
                    </Badge>
                  </div>

                  <ul className="mt-4 divide-y divide-ink-100 border-t border-ink-100">
                    {goal.kpis.map((kpi) => (
                      <li key={kpi.id}>
                        <Link
                          href={`/dashboard/metric/${data.kpiSlugs[kpi.id]}?year=${data.selectedYear}`}
                          className="flex min-h-20 flex-col items-stretch gap-2 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)] sm:flex-row sm:items-center sm:gap-4"
                        >
                          <span className="min-w-0 flex-1 font-medium text-ink-900">{kpi.name}</span>
                          <span className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
                            <span className="text-right font-semibold tabular text-ink-950">{kpi.result.displayValue}</span>
                            <Badge variant={statusVariant(kpi.boardStatus)} label="Board status">
                              {formatBoardReportToken(kpi.boardStatus)}
                            </Badge>
                            <ArrowRight className="size-4 shrink-0 text-ink-400" aria-hidden />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
