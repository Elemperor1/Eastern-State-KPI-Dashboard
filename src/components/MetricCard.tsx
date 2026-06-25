"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Badge, CardAction } from "@/components/ui";
import type { KPIAnalytics } from "@/lib/types";
import { formatDelta, formatValue, isFavorable, MONTH_FULL } from "@/lib/analytics";

interface Props {
  analytics: KPIAnalytics;
  accentColor?: string;
  onSelect?: () => void;
  selected?: boolean;
  basis?: "monthly" | "ytd";
}

export function MetricCard({ analytics, accentColor, onSelect, selected, basis = "monthly" }: Props) {
  const { kpi } = analytics;
  const comp = basis === "ytd" ? analytics.ytdComparison : analytics.monthlyComparison;
  const direction = comp.delta > 0 ? "up" : comp.delta < 0 ? "down" : "flat";
  const favorable = isFavorable(kpi.direction, comp.delta);
  const DirectionIcon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;

  const periodLabel = comp.isAnnual
    ? `${comp.currentYear} (annual)`
    : basis === "ytd"
      ? `YTD through ${MONTH_FULL[analytics.ytdComparison.throughMonth - 1]} ${comp.currentYear}`
      : `${MONTH_FULL[analytics.monthlyComparison.currentMonth - 1]} ${comp.currentYear}`;

  const changeText =
    kpi.unit_type === "percent"
      ? comp.ptsChange !== null
        ? `${comp.ptsChange > 0 ? "+" : ""}${comp.ptsChange.toFixed(1)} pts`
        : "—"
      : comp.pctChange !== null
        ? `${comp.pctChange > 0 ? "+" : ""}${comp.pctChange.toFixed(1)}%`
        : "—";

  const badgeVariant: React.ComponentProps<typeof Badge>["variant"] =
    direction === "flat" ? "default" : favorable ? "success" : "error";

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
          <Badge variant={badgeVariant} icon={DirectionIcon} className="tabular">
            {changeText}
          </Badge>
          <span className="truncate text-sm text-ink-500">vs {comp.compareYear}</span>
        </div>
        <div className="shrink-0 text-sm font-medium tabular text-ink-700">
          {formatDelta(comp.delta, kpi.unit_type)}
        </div>
      </div>
    </CardAction>
  );
}
