"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Filter,
  Layers,
  TrendingUp,
} from "lucide-react";
import { ExportPDFButton } from "@/components/ExportPDFButton";
import { KPISummaryCard } from "@/components/KPISummaryCard";
import { ComparisonChart } from "@/components/ComparisonChart";
import { TrendChart } from "@/components/TrendChart";
import { YTDChart } from "@/components/YTDChart";
import { CategorySummaryStrip } from "@/components/CategorySummaryStrip";
import { HeadlineRollup } from "@/components/HeadlineRollup";
import {
  buildKPIAnalytics,
  buildTrendPoints,
  CHART_COLORS,
  formatValue,
  MONTH_FULL,
  MONTH_LABELS,
} from "@/lib/analytics";
import type {
  Category,
  KPIWithCategory,
  MonthlyEntryWithMeta,
} from "@/lib/types";

interface DashboardState {
  kpiSlug: string;
  categorySlug: string;
  currentYear: number;
  compareYear: number;
  currentMonth: number;
  comparisonMode: "monthly" | "ytd" | "trend";
}

export function DashboardOverviewClient({
  kpis,
  categories,
  entries,
  availableYears,
  initialState,
}: {
  kpis: KPIWithCategory[];
  categories: Category[];
  entries: MonthlyEntryWithMeta[];
  availableYears: number[];
  initialState: DashboardState;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const [state, setState] = useState<DashboardState>(initialState);

  useEffect(() => {
    setState(initialState);
  }, [
    initialState.kpiSlug,
    initialState.categorySlug,
    initialState.currentYear,
    initialState.compareYear,
    initialState.currentMonth,
    initialState.comparisonMode,
  ]);

  function updateState(next: Partial<DashboardState>) {
    const merged = { ...state, ...next };
    setState(merged);
    const search = new URLSearchParams();
    if (merged.kpiSlug && merged.kpiSlug !== "all") search.set("kpi", merged.kpiSlug);
    if (merged.categorySlug && merged.categorySlug !== "all") search.set("category", merged.categorySlug);
    if (merged.currentYear) search.set("currentYear", String(merged.currentYear));
    if (merged.compareYear) search.set("compareYear", String(merged.compareYear));
    if (merged.currentMonth) search.set("currentMonth", String(merged.currentMonth));
    if (merged.comparisonMode) search.set("mode", merged.comparisonMode);
    const qs = search.toString();
    router.replace(qs ? `/dashboard/overview?${qs}` : "/dashboard/overview", { scroll: false });
  }

  const filteredKPIs = useMemo(() => {
    if (state.categorySlug === "all") return kpis;
    return kpis.filter((k) => k.category_slug === state.categorySlug);
  }, [kpis, state.categorySlug]);

  const focusKPIs = useMemo(() => {
    if (state.kpiSlug === "all") return filteredKPIs;
    const match = filteredKPIs.find((k) => k.slug === state.kpiSlug);
    return match ? [match] : filteredKPIs;
  }, [filteredKPIs, state.kpiSlug]);

  const focusKPIIds = useMemo(() => new Set(focusKPIs.map((k) => k.id)), [focusKPIs]);

  const filteredEntries = useMemo(
    () => entries.filter((e) => focusKPIIds.has(e.kpi_id)),
    [entries, focusKPIIds],
  );

  // KPI summaries — top-level cards always show all category KPIs for at-a-glance.
  const categoryFilteredKPIs = state.categorySlug === "all"
    ? kpis
    : kpis.filter((k) => k.category_slug === state.categorySlug);

  const summaryCards = useMemo(() => {
    return categoryFilteredKPIs.map((kpi) => {
      const kpiEntries = entries.filter((e) => e.kpi_id === kpi.id);
      const analytics = buildKPIAnalytics({
        kpi,
        entries: kpiEntries,
        currentYear: state.currentYear,
        compareYear: state.compareYear,
        currentMonth: state.currentMonth,
      });
      return analytics;
    });
  }, [categoryFilteredKPIs, entries, state.currentYear, state.compareYear, state.currentMonth]);

  const headlineTrend = useMemo(() => {
    return buildTrendPoints(filteredEntries, [state.compareYear, state.currentYear]);
  }, [filteredEntries, state.currentYear, state.compareYear]);

  const headlineYTD = useMemo(() => {
    return categoryFilteredKPIs.map((kpi) => {
      const kpiEntries = entries.filter((e) => e.kpi_id === kpi.id);
      const analytics = buildKPIAnalytics({
        kpi,
        entries: kpiEntries,
        currentYear: state.currentYear,
        compareYear: state.compareYear,
        currentMonth: state.currentMonth,
      });
      return { kpi, analytics };
    });
  }, [categoryFilteredKPIs, entries, state.currentYear, state.compareYear, state.currentMonth]);

  return (
    <div className="px-8 py-8 max-w-[1400px] mx-auto">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-ink-500 mb-2">
            Executive Dashboard
          </p>
          <h1 className="text-3xl font-display font-semibold text-ink-900 leading-tight">
            Organizational Performance
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            {MONTH_FULL[state.currentMonth - 1]} {state.currentYear} compared with {MONTH_FULL[state.currentMonth - 1]} {state.compareYear}.
          </p>
        </div>
        <div className="no-print flex items-center gap-2">
          <ExportPDFButton targetId="dashboard-export" fileName={`eastern-state-kpi-${state.currentYear}-vs-${state.compareYear}.pdf`} />
        </div>
      </header>

      <FilterPanel
        state={state}
        availableYears={availableYears}
        categories={categories}
        kpis={filteredKPIs}
        onChange={updateState}
      />

      <div id="dashboard-export" className="space-y-8">
        {/* KPI Summary cards */}
        <section aria-label="KPI Summary">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-700">
                At a glance
              </h2>
              <p className="text-xs text-ink-500 mt-0.5">
                Monthly comparison · {MONTH_FULL[state.currentMonth - 1]} {state.currentYear} vs {MONTH_FULL[state.currentMonth - 1]} {state.compareYear}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {summaryCards.map((s, idx) => (
              <KPISummaryCard
                key={s.kpi.id}
                analytics={s}
                accentColor={CHART_COLORS[idx % CHART_COLORS.length]}
              />
            ))}
          </div>
        </section>

        {/* Trend / Comparison charts */}
        <section aria-label="Comparison charts">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-700">
                {focusKPIs.length === 1 ? focusKPIs[0].name : "Selected KPIs"}
              </h2>
              <p className="text-xs text-ink-500 mt-0.5">
                {state.comparisonMode === "monthly" && "Monthly comparison — current month vs prior year."}
                {state.comparisonMode === "ytd" && "Year-to-date — running total through current month."}
                {state.comparisonMode === "trend" && "Trend — full-year monthly progression."}
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5 shadow-soft no-print">
              {(["monthly", "ytd", "trend"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => updateState({ comparisonMode: mode })}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                    state.comparisonMode === mode
                      ? "bg-brand-700 text-white shadow-sm"
                      : "text-ink-600 hover:text-ink-900"
                  }`}
                >
                  {mode === "monthly" ? "Monthly" : mode === "ytd" ? "Year-to-date" : "Trend"}
                </button>
              ))}
            </div>
          </div>

          <div className="surface p-6">
            {focusKPIs.length === 0 ? (
              <p className="text-sm text-ink-500">No KPIs selected.</p>
            ) : state.comparisonMode === "monthly" ? (
              <ComparisonChart
                analyticsList={focusKPIs.map((kpi) =>
                  buildKPIAnalytics({
                    kpi,
                    entries: entries.filter((e) => e.kpi_id === kpi.id),
                    currentYear: state.currentYear,
                    compareYear: state.compareYear,
                    currentMonth: state.currentMonth,
                  }),
                )}
              />
            ) : state.comparisonMode === "ytd" ? (
              <YTDChart
                analyticsList={headlineYTD.filter((s) => focusKPIIds.has(s.kpi.id))}
              />
            ) : (
              <TrendChart
                data={headlineTrend}
                years={[state.compareYear, state.currentYear]}
                format={focusKPIs[0]?.format ?? "number"}
                unit={focusKPIs[0]?.unit ?? ""}
              />
            )}
          </div>
        </section>


        {/* Headline YTD rollup of every KPI */}
        <section aria-label="Headline rollup">
          <HeadlineRollup
            kpis={kpis}
            entries={entries}
            currentYear={state.currentYear}
            compareYear={state.compareYear}
            currentMonth={state.currentMonth}
          />
        </section>

        {/* Per-category rollup */}
        <section aria-label="Category performance">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-700">
                Category Performance
              </h2>
              <p className="text-xs text-ink-500 mt-0.5">
                Year-to-date totals grouped by category, with year-over-year change.
              </p>
            </div>
          </div>
          <CategorySummaryStrip
            categories={categories}
            kpis={kpis}
            entries={entries}
            currentYear={state.currentYear}
            compareYear={state.compareYear}
            currentMonth={state.currentMonth}
          />
        </section>

        <footer className="pt-2 pb-6 text-center text-xs text-ink-400">
          Eastern State Penitentiary Historic Site · KPI Intelligence Dashboard ·{" "}
          {state.currentYear}
        </footer>
      </div>
    </div>
  );
}

function FilterPanel({
  state,
  availableYears,
  categories,
  kpis,
  onChange,
}: {
  state: DashboardState;
  availableYears: number[];
  categories: Category[];
  kpis: KPIWithCategory[];
  onChange: (next: Partial<DashboardState>) => void;
}) {
  return (
    <div className="surface p-5 mb-8 no-print">
      <div className="flex items-center gap-2 mb-3">
        <Filter className="w-3.5 h-3.5 text-ink-500" />
        <span className="text-[11px] uppercase tracking-wider font-semibold text-ink-500">
          Compare
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div>
          <label className="label">Category</label>
          <select
            className="input"
            value={state.categorySlug}
            onChange={(e) => onChange({ categorySlug: e.target.value, kpiSlug: "all" })}
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">KPI</label>
          <select
            className="input"
            value={state.kpiSlug}
            onChange={(e) => onChange({ kpiSlug: e.target.value })}
          >
            <option value="all">All KPIs in category</option>
            {kpis.map((k) => (
              <option key={k.id} value={k.slug}>
                {k.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">
            <Calendar className="inline w-3 h-3 mr-1" /> Current year
          </label>
          <select
            className="input"
            value={state.currentYear}
            onChange={(e) => onChange({ currentYear: Number(e.target.value) })}
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Compare against</label>
          <select
            className="input"
            value={state.compareYear}
            onChange={(e) => onChange({ compareYear: Number(e.target.value) })}
          >
            {availableYears.filter((y) => y !== state.currentYear).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">
            <Layers className="inline w-3 h-3 mr-1" /> Through month
          </label>
          <select
            className="input"
            value={state.currentMonth}
            onChange={(e) => onChange({ currentMonth: Number(e.target.value) })}
          >
            {MONTH_LABELS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
