"use client";

import { AlertTriangle, ArrowDownRight, ArrowUpRight, Crosshair, Minus } from "lucide-react";
import { Badge, CardAction, Progress } from "@/components/ui";
import type { KPIAnalytics, KpiGoalWithMeta } from "@/lib/types";
import { MONTH_FULL } from "@/features/metrics";
import { formatDelta, formatValue, isFavorable } from "@/lib/analytics";
import { isAnnualReportingFrequency } from "@/features/metrics";
import type {
  StrategicBoardKpiViewModel,
  TargetProgressViewModel,
} from "@/features/reporting/strategic-board-report";
import { formatBoardReportTarget } from "./strategic-board-report-presentation";

interface Props {
  analytics: KPIAnalytics;
  accentColor?: string;
  onSelect?: () => void;
  selected?: boolean;
  basis?: "monthly" | "ytd";
  goal?: KpiGoalWithMeta | null;
  strategic?: StrategicBoardKpiViewModel | null;
}

export function MetricCard({
  analytics,
  accentColor,
  onSelect,
  selected,
  basis = "monthly",
  goal,
  strategic = null,
}: Props) {
  const { kpi } = analytics;
  const comp = basis === "ytd" ? analytics.ytdComparison : analytics.monthlyComparison;
  const isEmpty = comp.isEmpty;

  const direction = comp.delta > 0 ? "up" : comp.delta < 0 ? "down" : "flat";
  const favorable = isFavorable(kpi.direction, comp.delta);
  const DirectionIcon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;

  const periodLabel = comp.isAnnual
    ? `${comp.currentYear} (annual)`
    : basis === "ytd"
      ? `YTD through ${MONTH_FULL[analytics.ytdComparison.throughMonth - 1]} ${comp.currentYear}`
      : `${MONTH_FULL[analytics.monthlyComparison.currentMonth - 1]} ${comp.currentYear}`;

  // When the underlying data is missing for both years, skip the misleading
  // ±0% and surface a "No data" badge instead.
  const changeText = isEmpty
    ? "No data"
    : kpi.unit_type === "percent"
      ? comp.ptsChange !== null
        ? `${comp.ptsChange > 0 ? "+" : ""}${comp.ptsChange.toFixed(1)} pts`
        : "—"
      : comp.pctChange !== null
        ? `${comp.pctChange > 0 ? "+" : ""}${comp.pctChange.toFixed(1)}%`
        : "—";

  const badgeVariant: React.ComponentProps<typeof Badge>["variant"] = isEmpty
    ? "warning"
    : direction === "flat"
      ? "default"
      : favorable
        ? "success"
        : "error";

  const badgeIcon = isEmpty ? AlertTriangle : DirectionIcon;
  const strategicCurrent = strategic?.result.displayValue ?? null;

  return (
    <CardAction onClick={onSelect} selected={selected} className="relative overflow-hidden p-5">
      {accentColor ? (
        <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: accentColor }} aria-hidden />
      ) : null}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-700">
            {kpi.category_name}
          </p>
          <h3 className="text-lg font-semibold leading-snug text-ink-900">{kpi.name}</h3>
        </div>
        {strategic ? (
          <div className="flex flex-wrap justify-end gap-1.5">
            <Badge variant="info">{displayLabel(strategic.measurementType)}</Badge>
            <Badge variant={strategicStatusVariant(strategic.configurationStatus)}>
              {displayLabel(strategic.configurationStatus)}
            </Badge>
            <Badge variant="default">{displayLabel(strategic.boardStatus)}</Badge>
          </div>
        ) : null}
      </div>

      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-[30px] font-medium leading-none tracking-[-0.025em] tabular text-ink-900">
          {strategicCurrent ?? formatValue(comp.currentValue, kpi.unit_type, { compact: kpi.unit_type === "currency" })}
        </span>
        {!strategic ? <span className="text-sm text-ink-500">{kpi.unit}</span> : null}
      </div>
      <p className="mb-5 text-sm text-ink-500">
        {strategic
          ? `${displayLabel(strategic.reportingFrequency)} reporting · ${comp.currentYear}`
          : periodLabel}
      </p>

      {strategic ? <StrategicTargetSummary strategic={strategic} /> : null}

      {strategic?.unresolvedReasons.length ? (
        <div className="mb-4 rounded-lg bg-accent-50 px-3 py-2 text-xs leading-5 text-ink-800">
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-3.5" aria-hidden />
            Configuration needs attention
          </p>
          <p className="mt-1 line-clamp-3">{strategic.unresolvedReasons.join("; ")}</p>
        </div>
      ) : null}

      {strategic?.measurementType === "year_over_year" ? (
        <StrategicYearOverYearContext strategic={strategic} />
      ) : !strategic ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Badge
              variant={badgeVariant}
              icon={badgeIcon}
              className="tabular"
              title={isEmpty ? "No data has been entered for this period in either year." : undefined}
            >
              {changeText}
            </Badge>
            <span className="truncate text-sm text-ink-500">
              vs {comp.compareYear}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {goal ? (
              <div className="flex flex-col gap-1" title={`${goal.target_year} goal from ${goal.baseline_year} baseline: ${goal.target_value > 0 ? "+" : ""}${goal.target_value}${goal.goal_type === "pct" ? "%" : ""}${goal.full_year_target !== null ? ` → ${goal.full_year_target?.toLocaleString(undefined, { maximumFractionDigits: 1 })}` : " (baseline unavailable)"}`}>
                {goal.full_year_target === null ? (
                  <div className="flex items-center gap-1.5">
                    <Crosshair className="size-3 text-ink-400" aria-hidden />
                    <span className="text-xs tabular text-ink-400 min-w-[2.5ch]">—</span>
                  </div>
                ) : isAnnualReportingFrequency(goal.reporting_frequency) ? (
                  <div className="flex items-center gap-1.5">
                    <Crosshair className="size-3 text-ink-400" aria-hidden />
                    <Progress value={Math.round(goal.full_year_progress_pct ?? 0)} className="w-10" />
                    <span className="text-xs tabular text-ink-500 min-w-[2.5ch]">
                      {goal.full_year_progress_pct !== null ? `${Math.round(goal.full_year_progress_pct)}%` : "—"}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5" title={`YTD pace: ${goal.ytd_value?.toLocaleString(undefined, { maximumFractionDigits: 1 })} actual vs ${goal.ytd_target?.toLocaleString(undefined, { maximumFractionDigits: 1 })} target through this month`}>
                      <span className="text-[10px] text-ink-400 min-w-[3ch]">Pace</span>
                      <Progress
                        value={Math.round(goal.ytd_progress_pct ?? 0)}
                        className="w-10"
                        color={goal.ytd_progress_pct !== null && goal.ytd_progress_pct >= 100 ? "var(--color-success-text)" : undefined}
                      />
                      <span className="text-xs tabular text-ink-500 min-w-[2.5ch]">
                        {goal.ytd_progress_pct !== null ? `${Math.round(goal.ytd_progress_pct)}%` : "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5" title={`Full year: ${goal.full_year_value?.toLocaleString(undefined, { maximumFractionDigits: 1 })} actual vs ${goal.full_year_target?.toLocaleString(undefined, { maximumFractionDigits: 1 })} target`}>
                      <span className="text-[10px] text-ink-400 min-w-[3ch]">Goal</span>
                      <Progress
                        value={Math.round(goal.full_year_progress_pct ?? 0)}
                        className="w-10"
                        color={goal.full_year_progress_pct !== null && goal.full_year_progress_pct >= 100 ? "var(--color-success-text)" : undefined}
                      />
                      <span className="text-xs tabular text-ink-500 min-w-[2.5ch]">
                        {goal.full_year_progress_pct !== null ? `${Math.round(goal.full_year_progress_pct)}%` : "—"}
                      </span>
                    </div>
                  </>
                )}
              </div>
            ) : null}
            {!isEmpty ? (
              <div className="shrink-0 text-sm font-medium tabular text-ink-700">
                {formatDelta(comp.delta, kpi.unit_type)}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </CardAction>
  );
}

function StrategicYearOverYearContext({
  strategic,
}: {
  strategic: StrategicBoardKpiViewModel;
}) {
  const { result } = strategic;
  const Icon =
    result.state !== "ok"
      ? AlertTriangle
      : (result.value ?? 0) > 0
        ? ArrowUpRight
        : (result.value ?? 0) < 0
          ? ArrowDownRight
          : Minus;
  const label =
    result.state === "ok"
      ? "Calculated year over year"
      : result.state === "invalid"
        ? "Year-over-year calculation needs review"
        : "Year-over-year result not reported";

  return (
    <div
      className="flex items-center gap-2 text-sm text-ink-500"
      title={result.formulaExplanation ?? undefined}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

function StrategicTargetSummary({
  strategic,
}: {
  strategic: StrategicBoardKpiViewModel;
}) {
  const rows = [
    strategic.annualProgress
      ? {
          label: "Annual",
          yearLabel: "Reporting year",
          progress: strategic.annualProgress,
        }
      : null,
    strategic.fullPlanProgress
      ? {
          label: "Full plan",
          yearLabel: "Plan target year",
          progress: strategic.fullPlanProgress,
        }
      : null,
  ].filter(
    (row): row is {
      label: string;
      yearLabel: string;
      progress: TargetProgressViewModel;
    } =>
      row !== null,
  );

  return (
    <div className="mb-4 rounded-lg bg-ink-50 px-3 py-3 shadow-[inset_0_0_0_1px_var(--color-hairline-light)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-500">
        Targets
      </p>
      {rows.length > 0 ? (
        <div className="mt-3 divide-y divide-ink-200">
          {rows.map(({ label, yearLabel, progress }) => (
            <div key={label} className="py-3 first:pt-0 last:pb-0">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-ink-700">{label}</span>
                <span className="tabular text-ink-600">
                  {progress.actualProgressPercentage === null
                    ? displayLabel(progress.status)
                    : `${progress.actualProgressPercentage}%`}
                </span>
              </div>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-sm font-semibold tabular text-ink-900">
                  {formatBoardReportTarget(progress, strategic.unit)}
                </span>
                <span className="text-[11px] font-medium text-ink-500">
                  {yearLabel} {progress.targetYear ?? "not specified"}
                </span>
              </div>
              {targetNarrative(progress) ? (
                <p className="mb-2 text-xs leading-5 text-ink-600">
                  {targetNarrative(progress)}
                </p>
              ) : null}
              {progress.displayProgressPercentage === null ? (
                <div
                  className="h-1.5 rounded-full bg-ink-100"
                  role="status"
                  aria-label={`${label} progress: ${displayLabel(progress.status)}`}
                />
              ) : (
                <Progress
                  value={progress.displayProgressPercentage}
                  aria-label={`${label} progress for ${strategic.name}`}
                  aria-valuetext={`${progress.actualProgressPercentage}% actual progress; ${displayLabel(progress.status)}`}
                />
              )}
              {label === "Annual" && progress.pacingStatus !== null ? (
                <p className="mt-1 text-[11px] text-ink-500">
                  Pacing: {displayLabel(progress.pacingStatus)}
                  {progress.pacingTarget === null ? "" : ` toward ${progress.pacingTarget}`}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs font-medium text-ink-500">Target not finalized</p>
      )}
    </div>
  );
}

function targetNarrative(progress: TargetProgressViewModel): string | null {
  return progress.targetDescription ??
    (progress.hasTarget ? progress.targetDisplayText : null);
}

function strategicStatusVariant(
  status: StrategicBoardKpiViewModel["configurationStatus"],
): React.ComponentProps<typeof Badge>["variant"] {
  if (status === "active" || status === "ready") return "success";
  if (status === "needs_definition") return "error";
  if (status === "needs_target") return "warning";
  return "default";
}

function displayLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
