"use client";

import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from "lucide-react";
import clsx from "clsx";
import { formatDelta, formatValue, MONTH_FULL } from "@/lib/analytics";
import type { KPIWithCategory, MonthlyEntryWithMeta } from "@/lib/types";

interface Props {
  kpis: KPIWithCategory[];
  entries: MonthlyEntryWithMeta[];
  currentYear: number;
  compareYear: number;
  currentMonth: number;
}

interface RollupRow {
  kpi: KPIWithCategory;
  currentValue: number;
  compareValue: number;
  delta: number;
  pct: number | null;
}

export function HeadlineRollup({
  kpis,
  entries,
  currentYear,
  compareYear,
  currentMonth,
}: Props) {
  const rows: RollupRow[] = kpis.map((kpi) => {
    const kpiEntries = entries.filter((e) => e.kpi_id === kpi.id);
    let currentValue = 0;
    let compareValue = 0;
    for (let m = 1; m <= currentMonth; m++) {
      const a = kpiEntries.find((e) => e.year === currentYear && e.month === m);
      const b = kpiEntries.find((e) => e.year === compareYear && e.month === m);
      if (a) currentValue += a.value;
      if (b) compareValue += b.value;
    }
    const delta = currentValue - compareValue;
    const pct = compareValue !== 0 ? (delta / compareValue) * 100 : null;
    return { kpi, currentValue, compareValue, delta, pct };
  });

  const improving = rows.filter((r) => (r.pct ?? 0) > 0).length;
  const declining = rows.filter((r) => (r.pct ?? 0) < 0).length;
  const flat = rows.length - improving - declining;

  return (
    <section aria-label="YTD rollup" className="surface p-6">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-accent-500" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-700">
          Year-to-Date Performance
        </h2>
      </div>
      <p className="text-xs text-ink-500 mb-5">
        Every KPI, January through {MONTH_FULL[currentMonth - 1]} · {currentYear} vs {compareYear}
      </p>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <Pill label="Improving" count={improving} tone="up" />
        <Pill label="Declining" count={declining} tone="down" />
        <Pill label="Unchanged" count={flat} tone="flat" />
      </div>

      <div className="overflow-hidden rounded-xl border border-ink-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 bg-ink-50 border-b border-ink-200">
              <th className="text-left px-4 py-2.5">KPI</th>
              <th className="text-right px-4 py-2.5">{compareYear} YTD</th>
              <th className="text-right px-4 py-2.5">{currentYear} YTD</th>
              <th className="text-right px-4 py-2.5">Change</th>
              <th className="text-right px-4 py-2.5">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 bg-white">
            {rows.map(({ kpi, currentValue, compareValue, delta, pct }) => {
              const tone = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
              const Icon = tone === "up" ? ArrowUpRight : tone === "down" ? ArrowDownRight : Minus;
              return (
                <tr key={kpi.id}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-ink-900">{kpi.name}</div>
                    <div className="text-[11px] text-ink-500">{kpi.category_name} · {kpi.unit || "no unit"}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular text-ink-700">
                    {formatValue(compareValue, kpi.format, { compact: kpi.format === "currency" })}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular text-ink-900 font-semibold">
                    {formatValue(currentValue, kpi.format, { compact: kpi.format === "currency" })}
                  </td>
                  <td className={clsx("px-4 py-2.5 text-right tabular font-medium",
                    tone === "up" && "text-emerald-700",
                    tone === "down" && "text-red-700",
                    tone === "flat" && "text-ink-700",
                  )}>
                    {formatDelta(delta, kpi.format)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={clsx("pill tabular inline-flex items-center gap-1",
                      tone === "up" && "bg-emerald-50 text-emerald-700",
                      tone === "down" && "bg-red-50 text-red-700",
                      tone === "flat" && "bg-ink-100 text-ink-700",
                    )}>
                      <Icon className="w-3 h-3" />
                      {pct !== null ? `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%` : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Pill({ label, count, tone }: { label: string; count: number; tone: "up" | "down" | "flat" }) {
  return (
    <div className={clsx(
      "rounded-xl border px-4 py-3 flex items-center justify-between",
      tone === "up" && "border-emerald-200 bg-emerald-50/60",
      tone === "down" && "border-red-200 bg-red-50/60",
      tone === "flat" && "border-ink-200 bg-ink-50",
    )}>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-ink-500 font-semibold">{label}</div>
        <div className="text-2xl font-display font-semibold tabular text-ink-900 mt-1">{count}</div>
      </div>
      <div className={clsx(
        "w-2.5 h-10 rounded-full",
        tone === "up" && "bg-emerald-500",
        tone === "down" && "bg-red-500",
        tone === "flat" && "bg-ink-300",
      )} aria-hidden />
    </div>
  );
}
