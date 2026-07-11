import { Badge, Card, Progress } from "@/components/ui";
import {
  normalizePriorityGoalCompletionViewModel,
  type NormalizedGoalExclusionReason,
  type PriorityGoalCompletionViewModel,
} from "./goal-completion-model";

export interface PriorityGoalCompletionCardProps {
  model: PriorityGoalCompletionViewModel;
}

export function PriorityGoalCompletionCard({
  model,
}: PriorityGoalCompletionCardProps) {
  const normalized = normalizePriorityGoalCompletionViewModel(model);

  return (
    <Card
      as="article"
      className="flex min-w-0 flex-col p-5"
      data-priority-id={normalized.priorityId}
      data-pdf-keep-together
      data-raster-export-text
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="section-eyebrow">Strategic priority</p>
          <h3 className="text-xl font-semibold leading-tight text-ink-900 text-pretty">
            {normalized.priorityName}
          </h3>
        </div>
        {normalized.excludedGoalsCount > 0 ? (
          <Badge variant="info">
            {normalized.excludedGoalsCount} excluded
          </Badge>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            Goals completed
          </p>
          <p className="mt-1 text-3xl font-semibold leading-none tabular text-ink-900">
            {normalized.completionPercentageLabel}
          </p>
        </div>
        <p className="text-sm font-semibold tabular text-ink-700">
          {normalized.countLabel}
        </p>
      </div>

      <div className="mt-3">
        {normalized.hasCompletionPercentage ? (
          <Progress
            value={normalized.displayCompletionPercentage}
            className="h-2.5"
            aria-label={`${normalized.priorityName} goal completion`}
            aria-valuetext={normalized.progressAriaValueText}
          />
        ) : (
          <div
            className="h-2.5 rounded-full bg-ink-100"
            role="status"
            aria-label={`${normalized.priorityName} goal completion`}
          >
            <span className="sr-only">{normalized.progressAriaValueText}</span>
          </div>
        )}
      </div>

      <p className="mt-4 text-sm leading-6 text-ink-600">
        {normalized.excludedNote}
      </p>

      <GoalExclusionDetails
        reasons={normalized.excludedGoalReasons}
        excludedGoalsCount={normalized.excludedGoalsCount}
        label={`${normalized.priorityName} excluded goal details`}
        className="mt-3"
      />
    </Card>
  );
}

export function GoalExclusionDetails({
  reasons,
  excludedGoalsCount,
  label,
  className,
}: {
  reasons: NormalizedGoalExclusionReason[];
  excludedGoalsCount: number;
  label: string;
  className?: string;
}) {
  if (excludedGoalsCount === 0) return null;

  return (
    <details className={className} open>
      <summary className="cursor-pointer text-sm font-semibold text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]">
        Review excluded goal details ({excludedGoalsCount})
      </summary>
      {reasons.length > 0 ? (
        <ul
          className="mt-3 space-y-2 text-sm leading-6 text-ink-600"
          aria-label={label}
        >
          {reasons.map((reason) => (
            <li key={reason.goalId} className="break-words">
              <span className="font-semibold text-ink-900">
                {reason.goalName}:
              </span>{" "}
              {reason.reasons.join("; ")}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-ink-600">
          Detailed exclusion reasons were not supplied.
        </p>
      )}
    </details>
  );
}
