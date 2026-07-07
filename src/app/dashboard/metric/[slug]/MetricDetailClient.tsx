"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LegacyExportPDFButton } from "@/components/LegacyExportPDFButton";
import { Crosshair } from "lucide-react";
import { DashboardControls, type CompareState } from "@/components/DashboardControls";
import { TrendChart } from "@/components/TrendChart";
import { BreakdownChart } from "@/components/BreakdownChart";
import { DonorConversionCard } from "@/components/DonorConversionCard";
import { Breadcrumb, Card, Chip, ExportCSVButton, ExportPNGButton, PageHeader, PrintButton, PrintReportFooter, PrintReportHeader, Progress, Table } from "@/components/ui";
import { SampleDataBadge } from "@/components/SampleDataBadge";
import { buildMetricDetailModel } from "@/features/reporting/metric-detail";
import { buildMetricCsvExport } from "@/features/reporting/csv";
import {
  formatDelta,
  formatValue,
  MONTH_FULL,
} from "@/lib/analytics";
import type { DashboardData } from "@/features/reporting/types";

export type GoalDisplayMode = "compare" | "goal" | "both";

export function MetricDetailClient({
  data,
  kpiSlug,
  initialState,
  initialGoalDisplay,
}: {
  data: DashboardData;
  kpiSlug: string;
  initialState: CompareState;
  initialGoalDisplay?: GoalDisplayMode;
}) {
  const router = useRouter();
  const [state, setState] = useState<CompareState>(initialState);
  const [goalDisplay, setGoalDisplay] = useState<GoalDisplayMode>(
    initialGoalDisplay ?? "both",
  );

  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  // Sync goalDisplay from URL when the server component re-renders.
  useEffect(() => {
    if (initialGoalDisplay && initialGoalDisplay !== goalDisplay) {
      setGoalDisplay(initialGoalDisplay);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGoalDisplay]);

  const model = useMemo(
    () => buildMetricDetailModel(data, kpiSlug, state),
    [data, kpiSlug, state],
  );

  function updateState(next: Partial<CompareState>) {
    const merged = { ...state, ...next };
    setState(merged);
    const search = new URLSearchParams();
    search.set("currentYear", String(merged.currentYear));
    search.set("compareYear", String(merged.compareYear));
    search.set("currentMonth", String(merged.currentMonth));
    if (goalDisplay !== "both") search.set("goalDisplay", goalDisplay);
    router.replace(`/dashboard/metric/${kpiSlug}?${search.toString()}`, { scroll: false });
  }

  function updateGoalDisplay(mode: GoalDisplayMode) {
    setGoalDisplay(mode);
    const search = new URLSearchParams();
    search.set("currentYear", String(state.currentYear));
    search.set("compareYear", String(state.compareYear));
    search.set("currentMonth", String(state.currentMonth));
    if (mode !== "both") search.set("goalDisplay", mode);
    router.replace(`/dashboard/metric/${kpiSlug}?${search.toString()}`, { scroll: false });
  }

  if (!model.kpi || !model.category || !model.analytics) return null;

  const {
    kpi,
    category,
    analytics,
    isAnnual,
    isBreakdown,
    trendYears,
    trendPoints,
    ytdBar,
    favorableMonthly,
    favorableYtd,
    goal,
    goalIsAnnual,
    tableRows,
    directionLabel,
    breakdown,
  } = model;
  const comp = analytics.monthlyComparison;
  const ytd = analytics.ytdComparison;
  const hasGoal = goal != null;

  // Whether to show the comparison stats and/or goal progress sections.
  // When a goal exists, the user can toggle between three display modes.
  // Without a goal, always show the comparison stats.
  const showCompare = goalDisplay !== "goal" || !hasGoal;
  const showGoalDetails = hasGoal && goalDisplay !== "compare";
  // Precompute chip active states to avoid TS narrowing inside conditional JSX.
  const modeIsCompare = goalDisplay === "compare";
  const modeIsGoal = goalDisplay === "goal";
  const modeIsBoth = goalDisplay === "both";

  const printId = `metric-${kpiSlug}-print`;

  const csvExport = buildMetricCsvExport({ kpi, rows: tableRows, period: state });

  return (
    <div className="page-content page-enter">
      <div id={printId}>
        <PrintReportHeader
          eyebrow={category.name}
          title={kpi.name}
          subtitle={kpi.description}
          filters={[
            { label: "Current Year", value: String(state.currentYear) },
            { label: "Compare Year", value: String(state.compareYear) },
            ...(isAnnual ? [] : [{ label: "Through Month", value: MONTH_FULL[state.currentMonth - 1] }]),
            ...(goal ? [{ label: "Goal", value: `${goal.target_value > 0 ? "+" : ""}${goal.target_value}${goal.goal_type === "pct" ? "%" : ""}` }] : []),
          ]}
        />
        <Breadcrumb href={`/dashboard/category/${category.slug}`} label={category.name} />

        <PageHeader
          eyebrow={category.name}
          title={kpi.name}
          subtitle={
            <>
              {kpi.description}{" "}
              <span className="text-ink-500">· {kpi.reporting_frequency} · {kpi.unit_type} · {directionLabel}</span>
            </>
          }
          actions={
            <>
              <SampleDataBadge sample={data.sampleData} />
              <ExportCSVButton rows={csvExport.rows} columns={csvExport.columns} filename={csvExport.filename} />
              <PrintButton />
              <ExportPNGButton
                targetId={printId}
                fileName={`eastern-state-${kpiSlug}.png`}
              />
              <LegacyExportPDFButton
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

        {!isBreakdown && showCompare ? (
          <section className="mb-10">
            <Card className="overflow-hidden">
              <div className="grid grid-cols-2 divide-x divide-y divide-ink-100 lg:grid-cols-4 lg:divide-y-0">
              <StatItem
                label={isAnnual ? `${state.currentYear} value` : `${MONTH_FULL[state.currentMonth - 1]} ${state.currentYear}`}
                value={formatValue(comp.currentValue, kpi.unit_type, { compact: kpi.unit_type === "currency" })}
                unit={kpi.unit}
                tone={favorableMonthly ? "good" : comp.delta < 0 ? "bad" : "neutral"}
              />
              <StatItem
                label={`YoY change vs ${state.compareYear}`}
                value={kpi.unit_type === "percent" && comp.ptsChange !== null
                  ? `${comp.ptsChange > 0 ? "+" : ""}${comp.ptsChange.toFixed(1)} pts`
                  : comp.pctChange !== null
                    ? `${comp.pctChange > 0 ? "+" : ""}${comp.pctChange.toFixed(1)}%`
                    : "—"}
                sub={formatDelta(comp.delta, kpi.unit_type)}
                tone={favorableMonthly ? "good" : comp.delta < 0 ? "bad" : "neutral"}
              />
              <StatItem
                label={isAnnual ? `${state.currentYear} (full year)` : `YTD through ${MONTH_FULL[state.currentMonth - 1]}`}
                value={formatValue(ytd.currentValue, kpi.unit_type, { compact: kpi.unit_type === "currency" })}
                unit={kpi.unit}
              />
              <StatItem
                label={isAnnual ? `vs ${state.compareYear}` : `YTD vs ${state.compareYear}`}
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
        ) : null}

        {hasGoal ? (
          <section className="mb-10">
            <Card className="overflow-hidden p-5 lg:p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                  <Crosshair className="mr-1 inline size-3" aria-hidden /> Goal
                </p>
                {/* Segmented display-mode toggle — only shown when a goal exists. */}
                <div className="flex items-center gap-1.5 no-print" role="group" aria-label="Display mode">
                  <Chip
                    type="button"
                    active={modeIsCompare}
                    onClick={() => updateGoalDisplay("compare")}
                    className="px-2.5 py-1 text-xs"
                  >
                    Comparison
                  </Chip>
                  <Chip
                    type="button"
                    active={modeIsGoal}
                    onClick={() => updateGoalDisplay("goal")}
                    className="px-2.5 py-1 text-xs"
                  >
                    Goal progress
                  </Chip>
                  <Chip
                    type="button"
                    active={modeIsBoth}
                    onClick={() => updateGoalDisplay("both")}
                    className="px-2.5 py-1 text-xs"
                  >
                    Both
                  </Chip>
                </div>
              </div>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-ink-600">
                    Goal: {goal.target_value > 0 ? "+" : ""}{goal.target_value}{goal.goal_type === "pct" ? "%" : ""}{" "}
                    →{" "}
                    <span className="font-semibold text-ink-900">
                      {goal.full_year_target !== null
                        ? goal.full_year_target?.toLocaleString(undefined, {
                            maximumFractionDigits: 1,
                          })
                        : "—"}
                    </span>
                  </p>
                </div>
              </div>

              {goal.full_year_target === null ? (
                <p className="mt-4 text-sm text-ink-500">
                  No prior-year ({goal.target_year - 1}) data available to compute a baseline for this goal.
                  Enter {goal.target_year - 1} data or choose a different target year for the target to take effect.
                </p>
              ) : showGoalDetails ? (
                goalIsAnnual ? (
                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-ink-600">Completion</span>
                      <div className="flex items-center gap-3">
                        <div className="min-w-[120px]">
                          <Progress
                            value={Math.round(goal.full_year_progress_pct ?? 0)}
                            color={goal.full_year_progress_pct !== null && goal.full_year_progress_pct >= 100 ? "var(--color-success-text)" : undefined}
                          />
                        </div>
                        <span className="text-lg font-semibold tabular text-ink-900">
                          {goal.full_year_progress_pct !== null ? `${Math.round(goal.full_year_progress_pct)}%` : "—"}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-ink-500">
                      {goal.full_year_value != null
                        ? `${goal.full_year_value.toLocaleString(undefined, { maximumFractionDigits: 1 })} of ${goal.full_year_target?.toLocaleString(undefined, { maximumFractionDigits: 1 })}`
                        : "No data entered yet"}
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    {/* YTD pacing */}
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-ink-600">
                          YTD pace through {MONTH_FULL[state.currentMonth - 1]}
                        </span>
                        <div className="flex items-center gap-3">
                          <div className="min-w-[120px]">
                            <Progress
                              value={Math.round(goal.ytd_progress_pct ?? 0)}
                              color={goal.ytd_progress_pct !== null && goal.ytd_progress_pct >= 100 ? "var(--color-success-text)" : undefined}
                            />
                          </div>
                          <span className="text-lg font-semibold tabular text-ink-900">
                            {goal.ytd_progress_pct !== null ? `${Math.round(goal.ytd_progress_pct)}%` : "—"}
                          </span>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-ink-500">
                        {goal.ytd_value != null
                          ? `${goal.ytd_value.toLocaleString(undefined, { maximumFractionDigits: 1 })} actual vs ${goal.ytd_target?.toLocaleString(undefined, { maximumFractionDigits: 1 })} target through ${MONTH_FULL[state.currentMonth - 1]}`
                          : `No data through ${MONTH_FULL[state.currentMonth - 1]} yet`}
                      </p>
                    </div>
                    {/* Full-year completion */}
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-ink-600">Full-year completion</span>
                        <div className="flex items-center gap-3">
                          <div className="min-w-[120px]">
                            <Progress
                              value={Math.round(goal.full_year_progress_pct ?? 0)}
                              color={goal.full_year_progress_pct !== null && goal.full_year_progress_pct >= 100 ? "var(--color-success-text)" : undefined}
                            />
                          </div>
                          <span className="text-lg font-semibold tabular text-ink-900">
                            {goal.full_year_progress_pct !== null ? `${Math.round(goal.full_year_progress_pct)}%` : "—"}
                          </span>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-ink-500">
                        {goal.full_year_value != null
                          ? `${goal.full_year_value.toLocaleString(undefined, { maximumFractionDigits: 1 })} actual vs ${goal.full_year_target?.toLocaleString(undefined, { maximumFractionDigits: 1 })} annual target`
                          : "No data entered yet"}
                      </p>
                    </div>
                  </div>
                )
              ) : (
                <p className="mt-4 text-sm text-ink-500">
                  Comparison mode is hiding pacing details. Switch to Goal progress or Both to view the goal charts and completion metrics.
                </p>
              )}

              {goal.notes ? (
                <p className="mt-2 text-xs text-ink-500">{goal.notes}</p>
              ) : null}
            </Card>
          </section>
        ) : null}

        {isBreakdown ? (
          <Card className="p-5 lg:p-6 mb-10">
            {breakdown?.kind === "donor-conversion" ? (
              <DonorConversionCard
                kpi={kpi}
                data={breakdown.breakdowns}
                currentYear={state.currentYear}
                compareYear={state.compareYear}
                currentMonth={state.currentMonth}
              />
            ) : (
              <BreakdownChart
                kpi={kpi}
                data={breakdown?.breakdowns ?? []}
                currentYear={state.currentYear}
                compareYear={state.compareYear}
              />
            )}
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
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--chart-axis)" }} />
                  <YAxis
                    tickFormatter={(v) => formatValue(Number(v), kpi.unit_type, { compact: true })}
                    tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
                    width={70}
                  />
                  <Tooltip formatter={(v: number) => formatValue(Number(v), kpi.unit_type)} cursor={{ fill: "var(--chart-cursor)" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                  <Bar dataKey={String(ytd.compareYear)} fill="var(--chart-secondary)" radius={[6, 6, 0, 0]} maxBarSize={64} />
                  <Bar dataKey={String(ytd.currentYear)} fill="var(--chart-primary)" radius={[6, 6, 0, 0]} maxBarSize={64} />
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
                  Through {MONTH_FULL[state.currentMonth - 1]} · {state.currentYear} vs {state.compareYear}
                </h2>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ytdBar} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--chart-axis)" }} />
                    <YAxis
                      tickFormatter={(v) => formatValue(Number(v), kpi.unit_type, { compact: true })}
                      tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
                      width={70}
                    />
                      <Tooltip formatter={(v: number) => formatValue(Number(v), kpi.unit_type)} cursor={{ fill: "var(--chart-cursor)" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                    <Bar dataKey={String(ytd.compareYear)} fill="var(--chart-secondary)" radius={[6, 6, 0, 0]} maxBarSize={120} />
                    <Bar dataKey={String(ytd.currentYear)} fill="var(--chart-primary)" radius={[6, 6, 0, 0]} maxBarSize={120} />
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
                  <tr key={idx} className="transition-colors hover:bg-ink-50/70">
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
        <PrintReportFooter />
      </div>
    </div>
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
