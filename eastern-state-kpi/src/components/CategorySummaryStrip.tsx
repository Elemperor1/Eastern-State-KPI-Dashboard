"use client";

import clsx from "clsx";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import {
  buildKPIAnalytics,
  formatDelta,
  formatValue,
  MONTH_FULL,
} from "@/lib/analytics";
import type { Category, KPIWithCategory, MonthlyEntryWithMeta } from "@/lib/types";

interface Props {
  categories: Category[];
  kpis: KPIWithCategory[];
  entries: MonthlyEntryWithMeta[];
  currentYear: number;
  compareYear: number;
  currentMonth: number;
}

export function CategorySummaryStrip({
  categories,
  kpis,
  entries,
  currentYear,
  compareYear,
  currentMonth,
}: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {categories.map((category) => {
        const catKpis = kpis.filter((k) => k.category_id === category.id);
        if (catKpis.length === 0) return null;

        let currentYTD = 0;
        let compareYTD = 0;
        for (const kpi of catKpis) {
          const kpiEntries = entries.filter((e) => e.kpi_id === kpi.id);
          const analytics = buildKPIAnalytics({
            kpi,
            entries: kpiEntries,
            currentYear,
            compareYear,
            currentMonth,
          });
          currentYTD += analytics.ytdComparison.currentValue;
          compareYTD += analytics.ytdComparison.compareValue;
        }

        const delta = currentYTD - compareYTD;
        const pct = compareYTD !== 0 ? (delta / compareYTD) * 100 : null;
        const direction =
          delta > 0 ? "up" : delta < 0 ? "down" : "flat";
        const DirIcon =
          direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;

        const sampleFormat = catKpis[0].format;
        const sampleUnit = catKpis[0].unit;

        return (
          <div key={category.id} className="surface p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-ink-500 font-semibold">
                  {category.name}
                </p>
                <p className="text-xs text-ink-500 mt-0.5">
                  {catKpis.length} KPI{catKpis.length === 1 ? "" : "s"} · YTD through{" "}
                  {MONTH_FULL[currentMonth - 1]}
                </p>
              </div>
              <span
                className={clsx(
                  "pill tabular",
                  direction === "up" && "bg-emerald-50 text-emerald-700",
                  direction === "down" && "bg-red-50 text-red-700",
                  direction === "flat" && "bg-ink-100 text-ink-600",
                )}
              >
                <DirIcon className="w-3 h-3" />
                {pct !== null ? `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%` : "—"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">
                  {currentYear} YTD
                </p>
                <p className="text-xl font-display font-semibold tabular text-ink-900 mt-1">
                  {formatValue(currentYTD, sampleFormat, { compact: sampleFormat === "currency" })}
                </p>
                <p className="text-xs text-ink-400 mt-0.5">{sampleUnit}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">
                  {compareYear} YTD
                </p>
                <p className="text-xl font-display font-semibold tabular text-ink-700 mt-1">
                  {formatValue(compareYTD, sampleFormat, { compact: sampleFormat === "currency" })}
                </p>
                <p className="text-xs text-ink-400 mt-0.5 tabular">
                  {formatDelta(delta, sampleFormat)} change
                </p>
              </div>
            </div>
            <div className="border-t border-ink-100 pt-3 flex flex-wrap gap-1.5">
              {catKpis.map((kpi) => {
                const kpiEntries = entries.filter((e) => e.kpi_id === kpi.id);
                const analytics = buildKPIAnalytics({
                  kpi,
                  entries: kpiEntries,
                  currentYear,
                  compareYear,
                  currentMonth,
                });
                const pct = analytics.monthlyComparison.pctChange;
                return (
                  <span
                    key={kpi.id}
                    className="pill bg-ink-50 text-ink-700 border border-ink-200"
                  >
                    <span className="font-medium">{kpi.name}</span>
                    {pct !== null ? (
                      <span
                        className={clsx(
                          "tabular",
                          pct > 0 && "text-emerald-700",
                          pct < 0 && "text-red-700",
                        )}
                      >
                        {pct > 0 ? "+" : ""}
                        {pct.toFixed(1)}%
                      </span>
                    ) : null}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
