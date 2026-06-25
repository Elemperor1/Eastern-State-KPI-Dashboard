"use client";

import { ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import clsx from "clsx";
import { CardAction, Progress } from "@/components/ui";
import { buildKPIAnalytics, isFavorable } from "@/lib/analytics";
import type {
  BreakdownEntryWithMeta,
  Category,
  KPIWithCategory,
  MonthlyEntryWithMeta,
} from "@/lib/types";

interface Props {
  category: Category;
  kpis: KPIWithCategory[];
  entries: MonthlyEntryWithMeta[];
  breakdowns: BreakdownEntryWithMeta[];
  currentYear: number;
  compareYear: number;
  currentMonth: number;
  accent: string;
}

function metricYoYPct(
  kpi: KPIWithCategory,
  entries: MonthlyEntryWithMeta[],
  breakdowns: BreakdownEntryWithMeta[],
  currentYear: number,
  compareYear: number,
  currentMonth: number,
): { pct: number | null; favorable: boolean; delta: number } {
  if (kpi.unit_type === "breakdown") {
    const cur = breakdowns.filter((b) => b.kpi_id === kpi.id && b.year === currentYear);
    const cmp = breakdowns.filter((b) => b.kpi_id === kpi.id && b.year === compareYear);
    const curTotal = cur.reduce((s, b) => s + b.value, 0);
    const cmpTotal = cmp.reduce((s, b) => s + b.value, 0);
    const delta = curTotal - cmpTotal;
    const pct = cmpTotal !== 0 ? (delta / Math.abs(cmpTotal)) * 100 : null;
    return { pct, favorable: isFavorable(kpi.direction, delta), delta };
  }
  const kpiEntries = entries.filter((e) => e.kpi_id === kpi.id);
  const analytics = buildKPIAnalytics({
    kpi,
    entries: kpiEntries,
    currentYear,
    compareYear,
    currentMonth,
  });
  const comp = analytics.ytdComparison;
  const pct = kpi.unit_type === "percent" ? comp.ptsChange : comp.pctChange;
  return { pct, favorable: isFavorable(kpi.direction, comp.delta), delta: comp.delta };
}

export function CategoryOverviewCard({
  category,
  kpis,
  entries,
  breakdowns,
  currentYear,
  compareYear,
  currentMonth,
  accent,
}: Props) {
  const catKpis = kpis.filter((k) => k.category_id === category.id);
  const results = catKpis.map((k) => ({
    kpi: k,
    ...metricYoYPct(k, entries, breakdowns, currentYear, compareYear, currentMonth),
  }));
  const improving = results.filter((r) => r.favorable && r.delta !== 0).length;
  const declining = results.filter((r) => !r.favorable && r.delta !== 0).length;
  const flat = results.filter((r) => r.delta === 0).length;
  const total = results.length;
  const pctImproving = total ? Math.round((improving / total) * 100) : 0;

  const sorted = [...results].sort(
    (a, b) => Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0),
  );
  const topMover = sorted.find((r) => r.favorable && r.pct !== null) ?? sorted[0];

  return (
    <CardAction as="a" href={`/dashboard/category/${category.slug}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="inline-block w-1.5 h-9 rounded-full shrink-0"
            style={{ backgroundColor: accent }}
            aria-hidden
          />
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink-900 leading-tight truncate">
              {category.name}
            </h3>
            <p className="text-xs text-ink-500 mt-0.5">{total} metrics</p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-ink-400 group-hover:text-ink-700 transition-colors shrink-0 mt-1" aria-hidden />
      </div>

      {category.description ? (
        <p className="text-sm text-ink-600 mb-5 line-clamp-2 text-pretty">{category.description}</p>
      ) : null}

      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            Improving YoY
          </span>
          <span className="text-xs font-semibold tabular text-ink-800">{pctImproving}% improved</span>
        </div>
        <Progress value={pctImproving} color={accent} />
      </div>

      <div className="flex items-center gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
          <TrendingUp className="w-3.5 h-3.5" aria-hidden /> {improving}
        </span>
        <span className="inline-flex items-center gap-1.5 text-red-700 font-medium">
          <TrendingDown className="w-3.5 h-3.5" aria-hidden /> {declining}
        </span>
        <span className="inline-flex items-center gap-1.5 text-ink-500 font-medium">
          <Minus className="w-3.5 h-3.5" aria-hidden /> {flat}
        </span>
      </div>

      {topMover && topMover.pct !== null ? (
        <div className="mt-5 pt-4 text-sm">
          <span className="text-ink-500">Top mover: </span>
          <span className="font-medium text-ink-900">{topMover.kpi.name}</span>
          <span
            className={clsx(
              "tabular ml-1.5 font-medium",
              topMover.favorable ? "text-emerald-700" : "text-red-700",
            )}
          >
            {topMover.kpi.unit_type === "percent"
              ? `${topMover.pct > 0 ? "+" : ""}${topMover.pct.toFixed(1)} pts`
              : `${topMover.pct > 0 ? "+" : ""}${topMover.pct.toFixed(1)}%`}
          </span>
        </div>
      ) : null}
    </CardAction>
  );
}
