import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, Progress } from "@/components/ui";
import { SampleDataBadge } from "@/components/SampleDataBadge";
import { normalizeGoalCompletionViewModel } from "@/components/goal-completion-model";
import type { ExecutiveOverviewPageData } from "@/features/reporting/server";
import { OverviewYearFilter } from "./OverviewYearFilter";

function statusFor(priority: ExecutiveOverviewPageData["summary"]["priorities"][number]) {
  if (priority.excludedGoalsCount > 0) return { label: "Needs attention", variant: "warning" as const };
  if ((priority.completionPercentage ?? 0) >= 100) return { label: "Complete", variant: "success" as const };
  return { label: "In progress", variant: "info" as const };
}

export function ExecutiveOverview({ data }: { data: ExecutiveOverviewPageData }) {
  const organization = normalizeGoalCompletionViewModel(data.summary.organization);

  return (
    <div className="page-content page-enter">
      <PageHeader
        title="Overview"
        actions={<SampleDataBadge sample={data.sampleData} />}
      />

      <div className="mb-8 flex justify-end">
        <OverviewYearFilter year={data.summary.selectedYear} years={data.years} />
      </div>

      <section aria-labelledby="organization-progress" className="mb-10 border-b border-ink-200 pb-10">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h2 id="organization-progress" className="text-sm font-medium text-ink-600">Organization progress</h2>
            <p className="mt-2 text-5xl font-semibold tracking-[-0.04em] text-ink-950 tabular">
              {organization.completionPercentageLabel}
            </p>
          </div>
          <p className="text-sm font-semibold text-ink-700">{organization.countLabel}</p>
        </div>
        <Progress
          value={organization.displayCompletionPercentage}
          className="mt-5 h-3"
          aria-label="Organization progress"
          aria-valuetext={organization.progressAriaValueText}
        />
      </section>

      <section aria-labelledby="priorities-heading" className="mb-10">
        <div className="mb-5 flex items-end justify-between gap-4">
          <h2 id="priorities-heading" className="section-title">Strategic Priorities</h2>
          <span className="text-sm text-ink-500">{data.summary.selectedYear}</span>
        </div>
        <div className="divide-y divide-ink-200 border-y border-ink-200">
          {data.summary.priorities.map((priority) => {
            const normalized = normalizeGoalCompletionViewModel(priority);
            const status = statusFor(priority);
            const slug = data.summary.goals.find(
              (goal) => goal.priorityId === priority.priorityId,
            )?.prioritySlug;
            const content = (
              <>
                <div className="min-w-0">
                  <p className="font-semibold text-ink-950">{priority.priorityName}</p>
                  <p className="mt-1 text-sm text-ink-600">{normalized.countLabel}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap sm:justify-end">
                  <p className="text-2xl font-semibold text-ink-950 tabular">
                    {normalized.completionPercentageLabel}
                  </p>
                  <Badge variant={status.variant} label="Priority status">{status.label}</Badge>
                  {slug ? <ArrowRight className="size-4 shrink-0 text-ink-400" aria-hidden /> : null}
                </div>
              </>
            );
            return slug ? (
              <Link
                key={priority.priorityId}
                href={`/dashboard/category/${slug}?year=${data.summary.selectedYear}`}
                className="grid min-h-24 grid-cols-1 gap-3 px-1 py-5 transition-colors hover:bg-ink-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-5"
              >
                {content}
              </Link>
            ) : (
              <div key={priority.priorityId} className="grid min-h-24 grid-cols-1 gap-3 px-1 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-5">
                {content}
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="attention-heading">
        <h2 id="attention-heading" className="section-title mb-5">Needs attention</h2>
        {data.needsAttention.length === 0 ? (
          <Card variant="quiet" className="p-5">
            <EmptyState title="Nothing needs attention" description="All included goals are ready for reporting." />
          </Card>
        ) : (
          <ul className="divide-y divide-ink-200 border-y border-ink-200">
            {data.needsAttention.map((item) => (
              <li key={`${item.goalId}:${item.reason}`} className="flex gap-3 py-4">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--color-warning-text)]" aria-hidden />
                <div>
                  <p className="font-medium text-ink-900">{item.goalName}</p>
                  <p className="mt-1 text-sm text-ink-600">{item.priorityName} · {item.reason}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
