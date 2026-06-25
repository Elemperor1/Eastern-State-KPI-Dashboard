"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ExportPDFButton } from "@/components/ExportPDFButton";
import { DashboardControls, type CompareState } from "@/components/DashboardControls";
import { TrendChart } from "@/components/TrendChart";
import { BreakdownChart } from "@/components/BreakdownChart";
import { Breadcrumb, Card, PageHeader, Table } from "@/components/ui";
import { SampleDataBadge } from "@/components/SampleDataBadge";
import {
  buildKPIAnalytics,
  buildTrendPoints,
  formatDelta,
  formatValue,
  isFavorable,
  MONTH_FULL,
  MONTH_LABELS,
} from "@/lib/analytics";
import type { DashboardData } from "@/lib/dashboard-data";

export function MetricDetailClient({
  data,
  kpiSlug,
  initialState,
}: {
  data: DashboardData;
  kpiSlug: string;
  initialState: CompareState;
}) {
  const router = useRouter();
  const [state, setState] = useState<CompareState>(initialState);

  useEffect(() => {
    setState(initialState);
  }, [initialState.currentYear, initialState.compareYear, initialState.currentMonth]);

  const kpi = data.kpis.find((k) => k.slug === kpiSlug);
  const category = data.categories.find((c) => c.id === kpi?.category_id);

  function updateState(next: Partial<CompareState>) {
    const merged = { ...state, ...next };
    setState(merged);
    const search = new URLSearchParams();
    search.set("currentYear", String(merged.currentYear));
    search.set("compareYear", String(merged.compareYear));
    search.set("currentMonth", String(merged.currentMonth));
    router.replace(`/dashboard/metric/${kpiSlug}?${search.toString()}`, { scroll: false });
  }

  const kpiEntries = useMemo(
    () => (kpi ? data.entries.filter((e) => e.kpi_id === kpi.id) : []),
    [data.entries, kpi],
  );

  if (!kpi || !category) return null;

  const analytics = buildKPIAnalytics({
    kpi,
    entries: kpiEntries,
    currentYear: state.currentYear,
    compareYear: state.compareYear,
    currentMonth: state.currentMonth,
  });
  const comp = analytics.monthlyComparison;
  const ytd = analytics.ytdComparison;
  const isAnnual = kpi.reporting_frequency === "annual";
  const isBreakdown = kpi.unit_type === "breakdown";

  const trendYears = useMemo(
    () => Array.from(new Set(kpiEntries.map((e) => e.year))).sort(),
    [kpiEntries],
  );
  const trendPoints = useMemo(
    () => buildTrendPoints(kpiEntries, trendYears),
    [kpiEntries, trendYears],
  );

  const ytdBar = [
    { name: String(ytd.compareYear), value: ytd.compareValue },
    { name: String(ytd.currentYear), value: ytd.currentValue },
  ];

  const favorableMonthly = isFavorable(kpi.direction, comp.delta);
  const printId = `metric-${kpiSlug}-print`;

  type TableRow = {
    period: string;
    value: number | undefined;
    notes: string | null;
    compare?: number | undefined;
  };
  const tableRows: TableRow[] = isAnnual
    ? analytics.years.map((y) => ({
        period: String(y.year),
        value: y.fullYearValue,
        notes: kpiEntries.find((e) => e.year === y.year && e.month === 0)?.notes ?? null,
      }))
    : MONTH_LABELS.map((m, i) => {
        const month = i + 1;
        const cur = kpiEntries.find((e) => e.year === state.currentYear && e.month === month);
        const cmp = kpiEntries.find((e) => e.year === state.compareYear && e.month === month);
        return {
          period: `${m} ${state.currentYear}`,
          value: cur?.value,
          notes: cur?.notes ?? null,
          compare: cmp?.value,
        };
      });

  const directionLabel =
    kpi.direction === "higher"
      ? "Higher is better"
      : kpi.direction === "lower"
        ? "Lower is better"
        : "Neutral direction";

  return (
    <div className="px-6 py-6 lg:px-8 lg:py-8 max-w-[1200px] mx-auto">
      <div id={printId}>
        <Breadcrumb href={`/dashboard/category/${category.slug}`} label={category.name} />

        <PageHeader
          eyebrow={category.name}
          title={kpi.name}
          subtitle={
            <>
              {kpi.description}{" "}
              <span className="text-ink-400">· {kpi.reporting_frequency} · {kpi.unit_type} · {directionLabel}</span>
            </>
          }
          actions={
            <>
              <SampleDataBadge sample={data.sampleData} />
              <ExportPDFButton
                targetId={printId}
                fileName={`eastern-state-${kpiSlug}.pdf`}
              />
            </>
          }
        />

        <DashboardControls
          state={state}
          availableYears={data.years}
          onChange={updateState}
          allowMonth={!isAnnual}
        />

        {!isBreakdown ? (
          <section className="mb-10">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label={isAnnual ? `${state.currentYear} value` : `${MONTH_FULL[state.currentMonth - 1]} ${state.currentYear}`}
                value={formatValue(comp.currentValue, kpi.unit_type, { compact: kpi.unit_type === "currency" })}
                unit={kpi.unit}
                tone={favorableMonthly ? "good" : comp.delta < 0 ? "bad" : "neutral"}
              />
              <StatCard
                label={`YoY change vs ${state.compareYear}`}
                value={kpi.unit_type === "percent" && comp.ptsChange !== null
                  ? `${comp.ptsChange > 0 ? "+" : ""}${comp.ptsChange.toFixed(1)} pts`
                  : comp.pctChange !== null
                    ? `${comp.pctChange > 0 ? "+" : ""}${comp.pctChange.toFixed(1)}%`
                    : "—"}
                sub={formatDelta(comp.delta, kpi.unit_type)}
                tone={favorableMonthly ? "good" : comp.delta < 0 ? "bad" : "neutral"}
              />
              <StatCard
                label={`YTD through ${MONTH_FULL[state.currentMonth - 1]}`}
                value={formatValue(ytd.currentValue, kpi.unit_type, { compact: kpi.unit_type === "currency" })}
                unit={kpi.unit}
              />
              <StatCard
                label={`YTD vs ${ytd.compareYear}`}
                value={kpi.unit_type === "percent" && ytd.ptsChange !== null
                  ? `${ytd.ptsChange > 0 ? "+" : ""}${ytd.ptsChange.toFixed(1)} pts`
                  : ytd.pctChange !== null
                    ? `${ytd.pctChange > 0 ? "+" : ""}${ytd.pctChange.toFixed(1)}%`
                    : "—"}
                sub={formatDelta(ytd.delta, kpi.unit_type)}
                tone={isFavorable(kpi.direction, ytd.delta) ? "good" : ytd.delta < 0 ? "bad" : "neutral"}
              />
            </div>
          </section>
        ) : null}

        {isBreakdown ? (
          <Card className="p-5 lg:p-6 mb-10">
            <BreakdownChart
              kpi={kpi}
              breakdowns={data.breakdowns}
              currentYear={state.currentYear}
              compareYear={state.compareYear}
            />
          </Card>
        ) : isAnnual ? (
          <Card className="p-5 lg:p-6 mb-10">
            <div className="mb-5">
              <p className="section-eyebrow">Annual</p>
              <h2 className="section-title">Year-over-year</h2>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ytdBar} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--chart-axis)" }} />
                  <YAxis
                    tickFormatter={(v) => formatValue(Number(v), kpi.unit_type, { compact: true })}
                    tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
                    width={70}
                  />
                  <Tooltip formatter={(v: number) => formatValue(Number(v), kpi.unit_type)} cursor={{ fill: "var(--chart-cursor)" }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={64} fill="var(--chart-brand)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        ) : (
          <>
            <Card className="p-5 lg:p-6 mb-10">
              <div className="mb-5">
                <p className="section-eyebrow">Trend</p>
                <h2 className="section-title">Monthly trend</h2>
              </div>
              <TrendChart
                data={trendPoints}
                years={trendYears}
                unitType={kpi.unit_type}
                unit={kpi.unit}
              />
            </Card>

            <Card className="p-5 lg:p-6 mb-10">
              <div className="mb-5">
                <p className="section-eyebrow">Year-to-date</p>
                <h2 className="section-title">
                  Through {MONTH_FULL[state.currentMonth - 1]} · {state.compareYear} vs {state.currentYear}
                </h2>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ytdBar} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--chart-axis)" }} />
                    <YAxis
                      tickFormatter={(v) => formatValue(Number(v), kpi.unit_type, { compact: true })}
                      tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
                      width={70}
                    />
                    <Tooltip formatter={(v: number) => formatValue(Number(v), kpi.unit_type)} cursor={{ fill: "var(--chart-cursor)" }} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={120} fill="var(--chart-brand)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </>
        )}

        {!isBreakdown ? (
          <Card className="p-5 lg:p-6 mb-10">
            <div className="section-head">
              <p className="section-eyebrow">Values</p>
              <h2 className="section-title">
                {isAnnual ? "Annual values" : `Monthly values · ${state.currentYear}`}
              </h2>
            </div>
            <Table minWidth="520px">
              <thead>
                <tr>
                  <th className="text-left" scope="col">Period</th>
                  <th className="text-right" scope="col">Value</th>
                  {!isAnnual ? <th className="text-right" scope="col">{state.compareYear}</th> : null}
                  <th className="text-left" scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r, idx) => (
                  <tr key={idx} className="hover:bg-ink-50/50 transition-colors">
                    <td className="font-medium text-ink-900">{r.period}</td>
                    <td className="text-right tabular text-ink-900 font-medium">
                      {r.value === undefined || r.value === null ? "—" : formatValue(Number(r.value), kpi.unit_type)}
                    </td>
                    {!isAnnual ? (
                      <td className="text-right tabular text-ink-500">
                        {r.compare === undefined || r.compare === null ? "—" : formatValue(Number(r.compare), kpi.unit_type)}
                      </td>
                    ) : null}
                    <td className="text-ink-500 text-xs">{r.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({
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
    tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-ink-900";
  return (
    <Card className="p-5">
      <p className="text-xs font-medium text-ink-500 mb-2">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-semibold tabular ${toneClass}`}>{value}</span>
        {unit ? <span className="text-xs text-ink-500">{unit}</span> : null}
      </div>
      {sub ? <p className={`text-xs mt-1 tabular font-medium ${toneClass}`}>{sub}</p> : null}
    </Card>
  );
}
