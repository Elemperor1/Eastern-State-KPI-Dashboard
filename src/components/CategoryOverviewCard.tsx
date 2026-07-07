"use client";

import { ChevronRight, Crosshair, TrendingUp, TrendingDown, Minus } from "lucide-react";
import clsx from "clsx";
import { CardAction, Progress } from "@/components/ui";
import { buildKPIAnalytics, isFavorable } from "@/lib/analytics";
import type {
  BreakdownEntryWithMeta,
  Category,
  KPIWithCategory,
  KpiGoalWithMeta,
  MonthlyEntryWithMeta,
} from "@/lib/types";

interface Props {
  category: Category;
  kpis: KPIWithCategory[];
  entries: MonthlyEntryWithMeta[];
  breakdowns: BreakdownEntryWithMeta[];
  goals: KpiGoalWithMeta[];
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
    const isMonthly = breakdowns.some((b) => b.kpi_id === kpi.id && b.month > 0);
    if (isMonthly) {
      // Monthly breakdown (e.g. percent-cultivated-donors): compute
      // donor conversion rate for YTD months in each year.
      function conversionRate(year: number): number | null {
        let referred = 0;
        let donors = 0;
        const months = Math.min(currentMonth, 12);
        for (let m = 1; m <= months; m++) {
          const r = breakdowns.find((b) => b.kpi_id === kpi.id && b.year === year && b.month === m && b.label === "Referred");
          const d = breakdowns.find((b) => b.kpi_id === kpi.id && b.year === year && b.month === m && b.label === "Donors");
          referred += r?.value ?? 0;
          donors += d?.value ?? 0;
        }
        return referred > 0 ? (donors / referred) * 100 : null;
      }
      const curPct = conversionRate(currentYear);
      const cmpPct = conversionRate(compareYear);
      const delta = curPct !== null && cmpPct !== null ? curPct - cmpPct : null;
      const pct = delta !== null ? delta : null;
      const deltaAbs = delta ?? 0;
      return { pct, favorable: isFavorable(kpi.direction, deltaAbs), delta: deltaAbs };
    }
    // Annual breakdown: compare total sum across labels.
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
  goals,
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

  // Goal progress for this category in the current year.
  const catGoals = goals.filter(
    (g) => g.category_id === category.id && g.target_year === currentYear,
  );
  const goalsWithProgress = catGoals.filter((g) => g.full_year_progress_pct !== null);
  const avgGoalProgress = goalsWithProgress.length
    ? Math.round(
        goalsWithProgress.reduce((sum, g) => sum + (g.full_year_progress_pct ?? 0), 0) /
          goalsWithProgress.length,
      )
    : null;

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
            <h3 className="truncate text-lg font-semibold leading-tight text-ink-900">
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
            Improving YoY
          </span>
          <span className="text-sm font-semibold tabular text-ink-900">{pctImproving}%</span>
        </div>
        <Progress value={pctImproving} color={accent} />
      </div>

      <div className="flex items-center gap-4 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-success-text)]" aria-label={`${improving} improving`}>
          <TrendingUp className="w-3.5 h-3.5" aria-hidden /> {improving}
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-danger-text)]" aria-label={`${declining} declining`}>
          <TrendingDown className="w-3.5 h-3.5" aria-hidden /> {declining}
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-ink-500" aria-label={`${flat} unchanged`}>
          <Minus className="w-3.5 h-3.5" aria-hidden /> {flat}
        </span>
      </div>

      {catGoals.length > 0 ? (
        <div className="mt-5 border-t border-ink-100 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              <Crosshair className="size-3" aria-hidden /> Goals ({catGoals.length})
            </span>
            <span className="text-sm font-semibold tabular text-ink-900">
              {avgGoalProgress !== null ? `${avgGoalProgress}%` : "—"}
            </span>
          </div>
          {avgGoalProgress !== null ? (
            <Progress value={avgGoalProgress} color={accent} />
          ) : (
            <p className="text-xs text-ink-400">No prior-year baseline data yet</p>
          )}
        </div>
      ) : null}

      {topMover && topMover.pct !== null ? (
        <div className="mt-5 hidden items-baseline gap-1 text-sm sm:flex">
          <span className="shrink-0 whitespace-nowrap text-ink-500">Top mover: </span>
          <span className="min-w-0 truncate font-medium text-ink-900">{topMover.kpi.name}</span>
          <span
            className={clsx(
              "tabular ml-auto shrink-0 font-medium",
              topMover.favorable ? "text-[var(--color-success-text)]" : "text-[var(--color-danger-text)]",
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
