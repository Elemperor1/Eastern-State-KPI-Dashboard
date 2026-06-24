"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import clsx from "clsx";
import type { KPIAnalytics } from "@/lib/types";
import { formatDelta, formatValue, MONTH_FULL } from "@/lib/analytics";

interface Props {
  analytics: KPIAnalytics;
  accentColor?: string;
  onSelect?: () => void;
  selected?: boolean;
}

export function KPISummaryCard({ analytics, accentColor, onSelect, selected }: Props) {
  const { kpi, monthlyComparison } = analytics;
  const direction =
    monthlyComparison.delta > 0 ? "up" : monthlyComparison.delta < 0 ? "down" : "flat";
  const directionLabel =
    direction === "up" ? "Increase" : direction === "down" ? "Decrease" : "No change";
  const DirectionIcon =
    direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        "surface p-5 text-left w-full transition hover:-translate-y-0.5 hover:shadow-md",
        selected && "ring-2 ring-brand-500/40",
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-500">
            {kpi.category_name}
          </p>
          <h3 className="text-base font-semibold text-ink-900 mt-0.5">{kpi.name}</h3>
        </div>
        {accentColor ? (
          <span
            className="inline-block w-2 h-10 rounded-full"
            style={{ backgroundColor: accentColor }}
            aria-hidden
          />
        ) : null}
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-3xl font-display font-semibold tabular text-ink-900">
          {formatValue(monthlyComparison.currentValue, kpi.format, { compact: kpi.format === "currency" })}
        </span>
        <span className="text-xs text-ink-500">{kpi.unit}</span>
      </div>
      <p className="text-xs text-ink-500 mb-4">
        {MONTH_FULL[monthlyComparison.currentMonth - 1]} {monthlyComparison.currentYear}
      </p>

      <div className="flex items-center justify-between border-t border-ink-100 pt-3">
        <div className="flex items-center gap-1.5">
          <span
            className={clsx(
              "pill tabular",
              direction === "up" && "bg-emerald-50 text-emerald-700",
              direction === "down" && "bg-red-50 text-red-700",
              direction === "flat" && "bg-ink-100 text-ink-600",
            )}
          >
            <DirectionIcon className="w-3 h-3" />
            {monthlyComparison.pctChange !== null
              ? `${monthlyComparison.pctChange > 0 ? "+" : ""}${monthlyComparison.pctChange.toFixed(1)}%`
              : "—"}
          </span>
          <span className="text-xs text-ink-500">vs {monthlyComparison.compareYear}</span>
        </div>
        <div className="text-xs text-ink-700 tabular">
          {formatDelta(monthlyComparison.delta, kpi.format)}
        </div>
      </div>
      <p className="sr-only">{directionLabel} versus prior year</p>
    </button>
  );
}
