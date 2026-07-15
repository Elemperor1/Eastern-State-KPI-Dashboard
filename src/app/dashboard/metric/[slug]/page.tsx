import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ReportingYearFilter } from "@/components/ReportingYearFilter";
import { SampleDataBadge } from "@/components/SampleDataBadge";
import {
  Badge,
  Breadcrumb,
  EmptyState,
  LinkButton,
  PageHeader,
  Progress,
} from "@/components/ui";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import { listDashboardYears, loadStrategicMetricPageData } from "@/features/reporting/server";
import { strategyPeriods } from "@/features/strategy";
import {
  formatBoardReportMetricValue,
  formatBoardReportPercentage,
  formatBoardReportToken,
} from "@/components/strategic-board-report-presentation";

export const dynamic = "force-dynamic";

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function statusVariant(status: string) {
  if (["complete", "exceeded", "on_track", "active"].includes(status)) return "success" as const;
  if (["needs_target", "target_not_finalized"].includes(status)) return "incomplete" as const;
  if (["at_risk", "needs_definition"].includes(status)) return "warning" as const;
  if (["off_track", "invalid"].includes(status)) return "error" as const;
  return "info" as const;
}

function reportedPeriodLabel({
  year,
  periodType,
  periodIndex,
}: {
  year: number;
  periodType: "monthly" | "quarterly" | "annual" | "cumulative" | "one_time";
  periodIndex: number;
}): string {
  if (periodType === "monthly") {
    return `${strategyPeriods.STRATEGY_MONTH_LABELS[periodIndex - 1] ?? `Month ${periodIndex}`} ${year}`;
  }
  if (periodType === "quarterly") {
    return `${strategyPeriods.STRATEGY_QUARTER_LABELS[periodIndex - 1] ?? `Quarter ${periodIndex}`} ${year}`;
  }
  if (periodType === "annual") return `Full year ${year}`;
  if (periodType === "cumulative") return `Cumulative through ${year}`;
  return `One-time result (${year})`;
}

function ProgressSummary({
  label,
  progress,
}: {
  label: string;
  progress: NonNullable<ReturnType<typeof loadStrategicMetricPageData>>["kpi"]["annualProgress"];
}) {
  if (!progress) return null;
  return (
    <div className="border-t border-ink-200 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-ink-950">{label}</p>
          <p className="mt-1 text-sm text-ink-600">
            Target: {progress.targetDisplayText}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-semibold tabular text-ink-950">
            {formatBoardReportPercentage(progress.actualProgressPercentage)}
          </span>
          <Badge variant={statusVariant(progress.status)} label={`${label} status`}>
            {formatBoardReportToken(progress.status)}
          </Badge>
        </div>
      </div>
      {progress.actualProgressPercentage !== null ? (
        <Progress
          value={progress.displayProgressPercentage ?? 0}
          className="mt-3 h-2.5"
          aria-label={`${label} progress`}
          aria-valuetext={formatBoardReportPercentage(progress.actualProgressPercentage)}
        />
      ) : null}
    </div>
  );
}

export default async function StrategicMeasurePage({
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
  const requestedYear = Number(firstValue(query.year));
  const selectedYear = years.includes(requestedYear) ? requestedYear : Math.max(...years);
  const data = loadStrategicMetricPageData(slug, { year: selectedYear });
  if (!data) redirect("/dashboard/overview");

  return (
    <AppShell user={user}>
      <div className="page-content page-enter">
        <Breadcrumb
          href={`/dashboard/category/${data.prioritySlug}?year=${data.selectedYear}`}
          label={data.priorityName}
        />
        <PageHeader
          title={data.kpi.name}
          actions={(
            <div className="flex flex-wrap items-center justify-end gap-3">
              <SampleDataBadge sample={data.sampleData} />
              {user.role === "admin" ? (
                <LinkButton
                  href={`/setup?area=goals&year=${data.selectedYear}&goal=${data.goalId}#goal-target-measure-${data.kpi.id}`}
                  size="sm"
                >
                  Review target
                </LinkButton>
              ) : null}
            </div>
          )}
        />

        <div className="mb-8 flex justify-end">
          <ReportingYearFilter
            path={`/dashboard/metric/${slug}`}
            year={data.selectedYear}
            years={data.years}
          />
        </div>

        <section className="mb-10 border-b border-ink-200 pb-8" aria-labelledby="current-result">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <h2 id="current-result" className="text-sm font-medium text-ink-600">Current result</h2>
              <p className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-ink-950 tabular">
                {data.kpi.result.displayValue}
              </p>
            </div>
            <Badge variant={statusVariant(data.kpi.boardStatus)} label="Board status">
              {formatBoardReportToken(data.kpi.boardStatus)}
            </Badge>
          </div>
        </section>

        <section className="mb-10" aria-labelledby="targets-heading">
          <h2 id="targets-heading" className="section-title mb-2">Progress</h2>
          {data.kpi.annualProgress || data.kpi.fullPlanProgress ? (
            <div className="border-b border-ink-200">
              <ProgressSummary label={`${data.selectedYear} target`} progress={data.kpi.annualProgress} />
              <ProgressSummary label="Full plan target" progress={data.kpi.fullPlanProgress} />
            </div>
          ) : (
            <p className="border-y border-ink-200 py-5 text-sm text-ink-600">No target has been finalized yet.</p>
          )}
        </section>

        {data.kpi.components.length > 0 ? (
          <section className="mb-10" aria-labelledby="components-heading">
            <h2 id="components-heading" className="section-title mb-5">What makes up this result</h2>
            <dl className="divide-y divide-ink-200 border-y border-ink-200">
              {data.kpi.components.map((component) => (
                <div key={component.id} className="flex items-center justify-between gap-4 py-4">
                  <dt className="font-medium text-ink-900">{component.label}</dt>
                  <dd className="font-semibold tabular text-ink-950">{component.result.displayValue}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <section className="mb-10" aria-labelledby="history-heading">
          <h2 id="history-heading" className="section-title mb-5">Reported results</h2>
          {data.actuals.length === 0 ? (
            <EmptyState
              title="No results reported"
              description={user.role === "admin"
                ? "Use Data Entry to add the first result."
                : "No results have been reported for this period."}
            />
          ) : (
            <dl className="divide-y divide-ink-200 border-y border-ink-200">
              {data.actuals.map((actual) => (
                <div key={`${actual.year}-${actual.periodType}-${actual.periodIndex}`} className="flex items-center justify-between gap-4 py-4">
                  <dt className="text-sm text-ink-700">
                    {reportedPeriodLabel(actual)}
                  </dt>
                  <dd className="font-semibold tabular text-ink-950">
                    {formatBoardReportMetricValue(actual.value, data.kpi.unit)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        {data.kpi.unresolvedReasons.length > 0 ? (
          <section aria-labelledby="attention-heading">
            <h2 id="attention-heading" className="section-title mb-5">Needs attention</h2>
            <ul className="divide-y divide-ink-200 border-y border-ink-200">
              {data.kpi.unresolvedReasons.map((reason) => (
                <li key={reason} className="py-4 text-sm text-ink-700">{reason}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
