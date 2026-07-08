"use client";

import { AlertTriangle, ArrowDownRight, ArrowUpRight, Crosshair, Minus } from "lucide-react";
import { Badge, CardAction, Progress } from "@/components/ui";
import type { KPIAnalytics, KpiGoalWithMeta } from "@/lib/types";
import { MONTH_FULL } from "@/features/metrics";
import { formatDelta, formatValue, isFavorable } from "@/lib/analytics";
import { isAnnualReportingFrequency } from "@/features/metrics";

interface Props {
  analytics: KPIAnalytics;
  accentColor?: string;
  onSelect?: () => void;
  selected?: boolean;
  basis?: "monthly" | "ytd";
  goal?: KpiGoalWithMeta | null;
}

export function MetricCard({ analytics, accentColor, onSelect, selected, basis = "monthly", goal }: Props) {
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

  return (
    <CardAction onClick={onSelect} selected={selected} className="relative overflow-hidden p-5">
      {accentColor ? (
        <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: accentColor }} aria-hidden />
      ) : null}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-700">
            {kpi.category_name}
          </p>
          <h3 className="text-lg font-semibold leading-snug text-ink-900">{kpi.name}</h3>
        </div>
      </div>

      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-[30px] font-medium leading-none tracking-[-0.025em] tabular text-ink-900">
          {formatValue(comp.currentValue, kpi.unit_type, { compact: kpi.unit_type === "currency" })}
        </span>
        <span className="text-sm text-ink-500">{kpi.unit}</span>
      </div>
      <p className="mb-5 text-sm text-ink-500">{periodLabel}</p>

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
          <span className="truncate text-sm text-ink-500">vs {comp.compareYear}</span>
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
    </CardAction>
  );
}
