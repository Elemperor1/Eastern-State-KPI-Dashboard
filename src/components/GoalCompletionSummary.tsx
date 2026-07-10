import { Badge, Card, Progress } from "@/components/ui";
import {
  normalizeGoalCompletionViewModel,
  type GoalCompletionViewModel,
} from "./goal-completion-model";

export interface GoalCompletionSummaryProps {
  organization: GoalCompletionViewModel;
  title?: string;
}

export function GoalCompletionSummary({
  organization,
  title = "Strategic plan progress",
}: GoalCompletionSummaryProps) {
  const normalized = normalizeGoalCompletionViewModel(organization);

  return (
    <section
      aria-labelledby="goal-completion-summary-title"
      aria-label="Strategic plan progress"
    >
      <Card
        as="section"
        variant="elevated"
        className="overflow-hidden p-5 lg:p-6"
        data-pdf-keep-together
        data-raster-export-text
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="section-eyebrow">Organization-wide</p>
            <h2
              id="goal-completion-summary-title"
              className="text-2xl font-semibold tracking-[-0.02em] text-ink-900 text-pretty"
            >
              {title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              Only goals with finalized definitions and targets are included.
            </p>
          </div>
          {normalized.excludedGoalsCount > 0 ? (
            <Badge variant="warning">
              {normalized.excludedGoalsCount} pending setup
            </Badge>
          ) : (
            <Badge variant="success">All goals configured</Badge>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              Goals completed
            </p>
            <p className="mt-1 text-5xl font-semibold leading-none tabular tracking-[-0.03em] text-ink-900">
              {normalized.completionPercentageLabel}
            </p>
          </div>
          <p className="text-lg font-semibold tabular text-ink-900">
            {normalized.countLabel}
          </p>
        </div>

        <div className="mt-4">
          {normalized.hasCompletionPercentage ? (
            <Progress
              value={normalized.displayCompletionPercentage}
              className="h-3"
              aria-label="Organization-wide strategic goal completion"
              aria-valuetext={normalized.progressAriaValueText}
            />
          ) : (
            <div
              className="h-3 rounded-full bg-ink-100"
              role="status"
              aria-label="Organization-wide strategic goal completion"
            >
              <span className="sr-only">
                {normalized.progressAriaValueText}
              </span>
            </div>
          )}
        </div>

      </Card>
    </section>
  );
}
