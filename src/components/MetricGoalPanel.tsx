"use client";

import { Crosshair } from "lucide-react";
import { Card, Chip, Progress } from "@/components/ui";
import { MONTH_FULL } from "@/features/metrics";
import type { KpiGoalWithMeta } from "@/lib/types";

export type GoalDisplayMode = "compare" | "goal" | "both";

interface MetricGoalPanelProps {
  goal: KpiGoalWithMeta;
  goalIsAnnual: boolean;
  currentMonth: number;
  goalDisplay: GoalDisplayMode;
  onGoalDisplayChange: (mode: GoalDisplayMode) => void;
}

export function MetricGoalPanel({
  goal,
  goalIsAnnual,
  currentMonth,
  goalDisplay,
  onGoalDisplayChange,
}: MetricGoalPanelProps) {
  const showGoalDetails = goalDisplay !== "compare";
  const modeIsCompare = goalDisplay === "compare";
  const modeIsGoal = goalDisplay === "goal";
  const modeIsBoth = goalDisplay === "both";
  const currentMonthLabel = MONTH_FULL[currentMonth - 1];

  return (
    <section className="mb-10">
      <Card className="overflow-hidden p-5 lg:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            <Crosshair className="mr-1 inline size-3" aria-hidden />{" "}
            {goal.target_year} Goal
          </p>
          <div className="flex items-center gap-1.5 no-print" role="group" aria-label="Display mode">
            <Chip
              type="button"
              active={modeIsCompare}
              onClick={() => onGoalDisplayChange("compare")}
              className="px-2.5 py-1 text-xs"
            >
              Comparison
            </Chip>
            <Chip
              type="button"
              active={modeIsGoal}
              onClick={() => onGoalDisplayChange("goal")}
              className="px-2.5 py-1 text-xs"
            >
              Goal progress
            </Chip>
            <Chip
              type="button"
              active={modeIsBoth}
              onClick={() => onGoalDisplayChange("both")}
              className="px-2.5 py-1 text-xs"
            >
              Both
            </Chip>
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-ink-600">
              Goal: {goal.target_value > 0 ? "+" : ""}{goal.target_value}{goal.goal_type === "pct" ? "%" : ""}{" "}
              →{" "}
              <span className="font-semibold text-ink-900">
                {goal.full_year_target !== null
                  ? goal.full_year_target?.toLocaleString(undefined, {
                      maximumFractionDigits: 1,
                    })
                  : "—"}
              </span>
            </p>
          </div>
        </div>

        {goal.full_year_target === null ? (
          <p className="mt-4 text-sm text-ink-500">
            No prior-year ({goal.target_year - 1}) data available to compute a baseline for this goal.
            Enter {goal.target_year - 1} data or choose a different target year for the target to take effect.
          </p>
        ) : showGoalDetails ? (
          goalIsAnnual ? (
            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink-600">Completion</span>
                <div className="flex items-center gap-3">
                  <div className="min-w-[120px]">
                    <Progress
                      value={Math.round(goal.full_year_progress_pct ?? 0)}
                      color={goal.full_year_progress_pct !== null && goal.full_year_progress_pct >= 100 ? "var(--color-success-text)" : undefined}
                    />
                  </div>
                  <span className="text-lg font-semibold tabular text-ink-900">
                    {goal.full_year_progress_pct !== null ? `${Math.round(goal.full_year_progress_pct)}%` : "—"}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-xs text-ink-500">
                {goal.full_year_value != null
                  ? `${goal.full_year_value.toLocaleString(undefined, { maximumFractionDigits: 1 })} of ${goal.full_year_target?.toLocaleString(undefined, { maximumFractionDigits: 1 })}`
                  : "No data entered yet"}
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-ink-600">
                    YTD pace through {currentMonthLabel}
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="min-w-[120px]">
                      <Progress
                        value={Math.round(goal.ytd_progress_pct ?? 0)}
                        color={goal.ytd_progress_pct !== null && goal.ytd_progress_pct >= 100 ? "var(--color-success-text)" : undefined}
                      />
                    </div>
                    <span className="text-lg font-semibold tabular text-ink-900">
                      {goal.ytd_progress_pct !== null ? `${Math.round(goal.ytd_progress_pct)}%` : "—"}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  {goal.ytd_value != null
                    ? `${goal.ytd_value.toLocaleString(undefined, { maximumFractionDigits: 1 })} actual vs ${goal.ytd_target?.toLocaleString(undefined, { maximumFractionDigits: 1 })} target through ${currentMonthLabel}`
                    : `No data through ${currentMonthLabel} yet`}
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-ink-600">Full-year completion</span>
                  <div className="flex items-center gap-3">
                    <div className="min-w-[120px]">
                      <Progress
                        value={Math.round(goal.full_year_progress_pct ?? 0)}
                        color={goal.full_year_progress_pct !== null && goal.full_year_progress_pct >= 100 ? "var(--color-success-text)" : undefined}
                      />
                    </div>
                    <span className="text-lg font-semibold tabular text-ink-900">
                      {goal.full_year_progress_pct !== null ? `${Math.round(goal.full_year_progress_pct)}%` : "—"}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  {goal.full_year_value != null
                    ? `${goal.full_year_value.toLocaleString(undefined, { maximumFractionDigits: 1 })} actual vs ${goal.full_year_target?.toLocaleString(undefined, { maximumFractionDigits: 1 })} annual target`
                    : "No data entered yet"}
                </p>
              </div>
            </div>
          )
        ) : (
          <p className="mt-4 text-sm text-ink-500">
            Comparison mode is hiding pacing details. Switch to Goal progress or Both to view the goal charts and completion metrics.
          </p>
        )}

        {goal.notes ? (
          <p className="mt-2 text-xs text-ink-500">{goal.notes}</p>
        ) : null}
      </Card>
    </section>
  );
}
