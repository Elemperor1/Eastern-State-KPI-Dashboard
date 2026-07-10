"use client";

import { Badge, CardAction, Progress } from "@/components/ui";
import type { StrategicDashboardSummary } from "@/features/reporting/strategy-summary";

export function StrategicGoalsOverview({
  summary,
}: {
  summary: StrategicDashboardSummary;
}) {
  return (
    <section aria-labelledby="strategic-goals-overview-title" className="mb-12">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-eyebrow">Named strategic goals</p>
          <h2 id="strategic-goals-overview-title" className="section-title">
            Goal-level completion
          </h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-ink-600">
          Each goal uses its configured required KPIs. Undefined KPIs are excluded and identified rather than counted as failures.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {summary.goals.map((goal) => {
          const percentage = goal.result.completionPercentage;
          const excluded = !goal.result.eligible || goal.result.state !== "ok";
          return (
            <CardAction
              as="a"
              key={goal.goalId}
              href={`/dashboard/category/${goal.prioritySlug}`}
              className="flex min-w-0 flex-col p-5"
              data-pdf-keep-together
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="section-eyebrow">{goal.priorityName}</p>
                  <h3 className="text-lg font-semibold leading-snug text-ink-900 text-pretty">
                    {goal.goalName}
                  </h3>
                </div>
                <Badge variant={excluded ? "warning" : goal.result.complete ? "success" : "info"}>
                  {excluded ? "Excluded" : goal.result.complete ? "Complete" : "In progress"}
                </Badge>
              </div>
              <div className="mt-auto pt-5">
                <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                  <p className="text-sm font-semibold tabular text-ink-900">
                    {goal.result.completedKpisCount} of {goal.result.totalEligibleKpisCount} KPIs complete
                  </p>
                  <p className="text-sm font-semibold tabular text-ink-900">
                    {percentage === null ? "Not available" : `${percentage}%`}
                  </p>
                </div>
                <Progress
                  value={percentage ?? 0}
                  aria-label={`${goal.goalName} completion`}
                  aria-valuetext={percentage === null ? "Goal excluded from completion" : `${percentage}% complete`}
                />
                {goal.result.exclusionReasons.length > 0 ? (
                  <p className="mt-3 text-xs leading-5 text-ink-600">
                    {goal.result.exclusionReasons.join("; ").replaceAll("_", " ")}
                  </p>
                ) : null}
              </div>
            </CardAction>
          );
        })}
      </div>
    </section>
  );
}
