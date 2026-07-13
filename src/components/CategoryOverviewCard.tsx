"use client";

import { ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { CardAction, Progress } from "@/components/ui";
import type { CategoryOverviewSummary } from "@/features/reporting/types";

interface Props {
  summary: CategoryOverviewSummary;
  accent: string;
}

export function CategoryOverviewCard({
  summary,
  accent,
}: Props) {
  const {
    category,
    improving,
    declining,
    flat,
    total,
    comparisonMetricCount,
    completedStrategicGoals,
    eligibleStrategicGoals,
    strategicGoalCompletionPercentage,
    excludedStrategicGoals,
  } = summary;

  return (
    <CardAction as="a" href={`/dashboard/category/${category.slug}`} className="relative overflow-hidden p-5">
      <span
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ backgroundColor: accent }}
        aria-hidden
      />
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="mt-1 inline-block size-2 shrink-0 rounded-sm"
            style={{ backgroundColor: accent }}
            aria-hidden
          />
          <div className="min-w-0">
            <h3
              className="truncate text-lg font-semibold leading-tight text-ink-900"
              data-raster-export-text
            >
              {category.name}
            </h3>
            <p className="mt-1 text-sm text-ink-500">{total} metrics</p>
          </div>
        </div>
        <ChevronRight className="mt-1 size-4 shrink-0 text-ink-400 transition-colors group-hover:text-ink-900" aria-hidden />
      </div>

      {category.description ? (
        <p className="mb-5 hidden min-h-12 text-sm leading-6 text-ink-600 text-pretty sm:line-clamp-2">
          {category.description}
        </p>
      ) : null}

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            Strategic goals completed
          </span>
          <span className="text-sm font-semibold tabular text-ink-900">
            {strategicGoalCompletionPercentage === null
              ? "Not available"
              : `${strategicGoalCompletionPercentage}%`}
          </span>
        </div>
        <Progress
          value={strategicGoalCompletionPercentage ?? 0}
          color={accent}
          aria-label={`${category.name} strategic goal completion`}
          aria-valuetext={`${completedStrategicGoals} of ${eligibleStrategicGoals} goals completed`}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-semibold tabular text-ink-900">
            {completedStrategicGoals} of {eligibleStrategicGoals} goals completed
          </span>
          {excludedStrategicGoals > 0 ? (
            <span className="font-medium text-[var(--color-warning-text)]">
              {excludedStrategicGoals} excluded
            </span>
          ) : null}
        </div>
      </div>

      <div className="border-t border-ink-100 pt-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
          Selected-year comparison
        </p>
        {comparisonMetricCount > 0 ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-success-text)]" aria-label={`${improving} improving`}>
              <TrendingUp className="w-3.5 h-3.5" aria-hidden /> {improving}
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-danger-text)]" aria-label={`${declining} declining`}>
              <TrendingDown className="w-3.5 h-3.5" aria-hidden /> {declining}
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium text-ink-500" aria-label={`${flat} unchanged`}>
              <Minus className="w-3.5 h-3.5" aria-hidden /> {flat}
            </span>
            <span className="text-xs font-medium text-ink-500">
              {comparisonMetricCount} KPI {comparisonMetricCount === 1 ? "comparison" : "comparisons"}
            </span>
          </div>
        ) : (
          <p className="text-sm leading-5 text-ink-500" role="status">
            No selected-year KPI comparison is available.
          </p>
        )}
      </div>

    </CardAction>
  );
}
