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
    <CardAction onClick={onSelect} selected={selected}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-1">
            {kpi.category_name}
          </p>
          <h3 className="text-base font-semibold text-ink-900 leading-snug">{kpi.name}</h3>
        </div>
        {accentColor ? (
          <span
            className="inline-block w-1.5 h-10 rounded-full shrink-0"
            style={{ backgroundColor: accentColor }}
            aria-hidden
          />
        ) : null}
      </div>

      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-3xl font-semibold tabular text-ink-900">
          {formatValue(comp.currentValue, kpi.unit_type, { compact: kpi.unit_type === "currency" })}
        </span>
        <span className="text-xs text-ink-500">{kpi.unit}</span>
      </div>
      <p className="text-xs text-ink-500 mb-5">{periodLabel}</p>

      <div className="flex items-center justify-between pt-4">
        <div className="flex items-center gap-2">
          <Badge variant={badgeVariant} icon={DirectionIcon} className="tabular">
            {changeText}
          </Badge>
          <span className="text-xs text-ink-500">vs {comp.compareYear}</span>
        </div>
        <div className="text-xs text-ink-700 tabular font-medium">
          {formatDelta(comp.delta, kpi.unit_type)}
        </div>
      </div>
    </CardAction>
  );
}
