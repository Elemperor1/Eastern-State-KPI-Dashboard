"use client";

import { Card } from "@/components/ui";
import { MONTH_FULL } from "@/features/metrics";
import { formatDelta, formatValue } from "@/lib/analytics";
import type { KPIAnalytics } from "@/lib/types";

interface MetricComparisonStatsProps {
  analytics: KPIAnalytics;
  favorableMonthly: boolean;
  favorableYtd: boolean;
  yearOverYearMeasurement?: boolean;
}

export function MetricComparisonStats({
  analytics,
  favorableMonthly,
  favorableYtd,
  yearOverYearMeasurement = false,
}: MetricComparisonStatsProps) {
  const { kpi, monthlyComparison: comp, ytdComparison: ytd } = analytics;
  const isAnnual = comp.isAnnual;
  const currentMonthLabel = MONTH_FULL[comp.currentMonth - 1];

  return (
    <section className="mb-10">
      <Card className="overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-y divide-ink-100 lg:grid-cols-4 lg:divide-y-0">
          <StatItem
            label={isAnnual ? `${comp.currentYear} value` : `${currentMonthLabel} ${comp.currentYear}`}
            value={formatValue(comp.currentValue, kpi.unit_type, { compact: kpi.unit_type === "currency" })}
            unit={kpi.unit}
            tone={favorableMonthly ? "good" : comp.delta < 0 ? "bad" : "neutral"}
          />
          <StatItem
            label={`${yearOverYearMeasurement ? "Year-over-year change" : "Comparison change"} vs ${comp.compareYear}`}
            value={kpi.unit_type === "percent" && comp.ptsChange !== null
              ? `${comp.ptsChange > 0 ? "+" : ""}${comp.ptsChange.toFixed(1)} pts`
              : comp.pctChange !== null
                ? `${comp.pctChange > 0 ? "+" : ""}${comp.pctChange.toFixed(1)}%`
                : "—"}
            sub={formatDelta(comp.delta, kpi.unit_type)}
            tone={favorableMonthly ? "good" : comp.delta < 0 ? "bad" : "neutral"}
          />
          <StatItem
            label={isAnnual ? `${ytd.currentYear} (full year)` : `YTD through ${currentMonthLabel}`}
            value={formatValue(ytd.currentValue, kpi.unit_type, { compact: kpi.unit_type === "currency" })}
            unit={kpi.unit}
          />
          <StatItem
            label={isAnnual ? `vs ${ytd.compareYear}` : `YTD vs ${ytd.compareYear}`}
            value={kpi.unit_type === "percent" && ytd.ptsChange !== null
              ? `${ytd.ptsChange > 0 ? "+" : ""}${ytd.ptsChange.toFixed(1)} pts`
              : ytd.pctChange !== null
                ? `${ytd.pctChange > 0 ? "+" : ""}${ytd.pctChange.toFixed(1)}%`
                : "—"}
            sub={formatDelta(ytd.delta, kpi.unit_type)}
            tone={favorableYtd ? "good" : ytd.delta < 0 ? "bad" : "neutral"}
          />
        </div>
      </Card>
    </section>
  );
}

function StatItem({
  label,
  value,
  unit,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "text-[var(--color-success-text)]"
      : tone === "bad"
        ? "text-[var(--color-danger-text)]"
        : "text-ink-900";

  return (
    <div className="min-w-0 p-5">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-[28px] font-medium leading-none tracking-[-0.02em] tabular ${toneClass}`}>{value}</span>
        {unit ? <span className="text-sm text-ink-500">{unit}</span> : null}
      </div>
      {sub ? <p className={`mt-2 text-sm tabular font-medium ${toneClass}`}>{sub}</p> : null}
    </div>
  );
}
