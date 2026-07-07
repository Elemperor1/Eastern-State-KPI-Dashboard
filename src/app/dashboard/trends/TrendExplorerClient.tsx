"use client";

import { useEffect, useMemo, useState } from "react";
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import {
  Badge,
  Card,
  Checkbox,
  Chip,
  EmptyState,
  ExportCSVButton,
  ExportPNGButton,
  FormField,
  PageHeader,
  PrintButton,
  PrintReportFooter,
  PrintReportHeader,
  Select,
  Tabs,
} from "@/components/ui";
import {
  TREND_AXIS_MODE_OPTIONS,
  buildTrendExplorerModel,
  defaultTrendAxisMode,
  defaultTrendYears,
  selectInitialTrendKpiSlugs,
  type TrendAxisMode,
} from "@/features/reporting/trend-explorer";
import { CHART_COLORS, formatValue } from "@/lib/analytics";
import type {
  Category,
  KPIWithCategory,
  MonthlyEntryWithMeta,
} from "@/lib/types";

export function TrendExplorerClient({
  kpis,
  categories,
  entries,
  years,
}: {
  kpis: KPIWithCategory[];
  categories: Category[];
  entries: MonthlyEntryWithMeta[];
  years: number[];
}) {
  const [categorySlug, setCategorySlug] = useState<string>("all");
  const [kpiSlugs, setKpiSlugs] = useState<string[]>(() => selectInitialTrendKpiSlugs(kpis));
  const [selectedYears, setSelectedYears] = useState<number[]>(() => defaultTrendYears(years));
  const [axisMode, setAxisMode] = useState<TrendAxisMode>(() =>
    defaultTrendAxisMode(selectInitialTrendKpiSlugs(kpis)),
  );

  // When the user toggles a category that changes which KPIs are visible, fall back to a
  // sensible default if the current mode no longer makes sense (e.g. only 1 KPI left → Shared).
  useEffect(() => {
    if (kpiSlugs.length <= 1 && axisMode !== "shared") {
      setAxisMode("shared");
    }
  }, [kpiSlugs.length, axisMode]);

  const trendModel = useMemo(() => buildTrendExplorerModel(
    { kpis, entries },
    { categorySlug, kpiSlugs, selectedYears, axisMode },
  ), [kpis, entries, categorySlug, kpiSlugs, selectedYears, axisMode]);

  function toggleKpi(slug: string) {
    setKpiSlugs((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  }
  function toggleYear(year: number) {
    setSelectedYears((prev) => (prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]));
  }

  const trendPrintId = "trend-print-root";

  return (
    <div className="page-content page-content-wide page-enter">
      <div id={trendPrintId}>
        <PrintReportHeader
          eyebrow="Trend Explorer"
          title="Multi-KPI · Multi-Year Trends"
          subtitle="Compare any combination of KPIs and years to see how the site is moving."
          filters={[
            { label: "KPIs", value: trendModel.selectedKpiFilterLabel },
            { label: "Years", value: trendModel.selectedYearsFilterLabel },
            { label: "Y-axis", value: axisMode },
          ]}
        />
        <PageHeader
          eyebrow="Trend Explorer"
          title="Multi-KPI · Multi-Year Trends"
          subtitle="Compare any combination of KPIs and years to see how the site is moving."
          actions={
            <>
              <ExportCSVButton
                rows={trendModel.csvExport.rows}
                columns={trendModel.csvExport.columns}
                filename={trendModel.csvExport.filename}
              />
              <PrintButton />
              <ExportPNGButton
                targetId={trendPrintId}
                fileName={trendModel.pngFileName}
              />
            </>
          }
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="no-print">
            <Card className="overflow-hidden">
              <div className="p-5">
                <p className="section-eyebrow">Configure view</p>
                <h2 className="text-xl font-semibold text-ink-900">Trend selection</h2>
                <p className="mt-2 text-sm leading-6 text-ink-600 text-pretty">
                  Choose the measures and years to place on the same timeline.
                </p>
              </div>

              <div className="border-t border-ink-100 p-5">
                <FormField htmlFor="trend-category" label="Category">
                  <Select
                    id="trend-category"
                    value={categorySlug}
                    onChange={(e) => {
                      setCategorySlug(e.target.value);
                      setKpiSlugs([]);
                    }}
                  >
                    <option value="all">All categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.slug}>{c.name}</option>
                    ))}
                  </Select>
                </FormField>
              </div>

              <div className="border-t border-ink-100 p-3">
                <div className="mb-2 flex items-center justify-between px-2">
                  <p className="label mb-0">KPIs</p>
                  <Badge variant="default" className="tabular">{kpiSlugs.length} selected</Badge>
                </div>
                <div className="max-h-80 space-y-0.5 overflow-auto pr-1">
                  {trendModel.visibleKPIs.map((kpi) => {
                    const checked = kpiSlugs.includes(kpi.slug);
                    return (
                      <Checkbox
                        key={kpi.id}
                        id={`trend-kpi-${kpi.slug}`}
                        label={kpi.name}
                        checked={checked}
                        onChange={() => toggleKpi(kpi.slug)}
                      />
                    );
                  })}
                  {trendModel.visibleKPIs.length === 0 && (
                    <p className="px-2 py-3 text-sm leading-6 text-ink-500">No monthly KPIs in this category.</p>
                  )}
                </div>
              </div>

              <div className="border-t border-ink-100 p-5">
                <p className="label mb-2">Years</p>
                <div className="flex flex-wrap gap-2">
                  {years.map((year) => {
                    const checked = selectedYears.includes(year);
                    return (
                      <Chip
                        key={year}
                        active={checked}
                        onClick={() => toggleYear(year)}
                        aria-pressed={checked}
                      >
                        {year}
                      </Chip>
                    );
                  })}
                </div>
              </div>
            </Card>
          </aside>

          <Card className="flex min-h-[480px] flex-col overflow-hidden">
            {trendModel.emptyState ? (
              <EmptyState
                icon={BarChart3}
                title={trendModel.emptyState.title}
                description={trendModel.emptyState.description}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-100 px-5 py-4 lg:px-6">
                  <div>
                    <p className="section-eyebrow">Trend comparison</p>
                    <h2 className="text-xl font-semibold text-ink-900">
                      {kpiSlugs.length} {kpiSlugs.length === 1 ? "measure" : "measures"} across {selectedYears.length} {selectedYears.length === 1 ? "year" : "years"}
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-ink-500">
                      Each measure uses its native scale; high-volume series can compress smaller values.
                    </p>
                  </div>
                  <div className="flex max-w-xl flex-wrap justify-end gap-x-4 gap-y-2">
                    {trendModel.selectedKpis.map((kpi, index) => {
                      return (
                        <span key={kpi.slug} className="inline-flex items-center gap-2 text-xs text-ink-600">
                          <span
                            className="size-2 rounded-sm"
                            style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                            aria-hidden
                          />
                          {kpi.name}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="border-b border-ink-100 px-5 py-3 lg:px-6">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="label text-ink-700">Y-axis mode</span>
                    <Tabs
                      options={TREND_AXIS_MODE_OPTIONS}
                      value={axisMode}
                      onChange={setAxisMode}
                    />
                  </div>
                </div>
                <div className="h-[440px] px-2 pb-4 pt-5 md:h-[560px] md:px-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendModel.trendData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--chart-axis)" }} />
                      <YAxis
                        scale={axisMode === "log" ? "log" : "linear"}
                        domain={axisMode === "log" ? ["auto", "auto"] : axisMode === "indexed" ? ["auto", "auto"] : ["auto", "auto"]}
                        allowDataOverflow={axisMode === "log"}
                        tickFormatter={(v) =>
                          axisMode === "shared"
                            ? formatValue(Number(v), trendModel.sampleUnitType, { compact: true })
                            : axisMode === "log"
                              ? `10^${Number(v).toFixed(1)}`
                              : `${Number(v).toFixed(0)}`
                        }
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
                        width={70}
                      />
                      <Tooltip
                        formatter={(value, name) => {
                          if (value === null || value === undefined) return ["—", name];
                          if (axisMode === "shared") {
                            return [formatValue(Number(value), trendModel.sampleUnitType), name];
                          }
                          if (axisMode === "log") {
                            return [`10^${Number(value).toFixed(2)} (≈ ${formatValue(Math.pow(10, Number(value)), trendModel.sampleUnitType, { compact: true })})`, name];
                          }
                          // indexed
                          return [`${Number(value).toFixed(1)} (baseline = 100)`, name];
                        }}
                      />
                      {trendModel.series.map((series) => {
                        const color = CHART_COLORS[series.kpiIndex % CHART_COLORS.length];
                        return (
                          <Line
                            key={series.dataKey}
                            dataKey={series.dataKey}
                            name={series.name}
                            stroke={color}
                            strokeWidth={series.isCurrentSelection ? 2.75 : 1.75}
                            strokeOpacity={series.isCurrentSelection ? 1 : 0.62}
                            strokeDasharray={series.isCurrentSelection ? undefined : series.yearIndex % 2 === 0 ? "2 4" : "7 4"}
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0 }}
                            connectNulls={false}
                            isAnimationActive={false}
                          />
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="border-t border-ink-100 px-5 py-2 text-xs leading-5 text-ink-600">
                  {trendModel.axisModeHelp}
                </div>
                <div className="flex flex-wrap gap-4 border-t border-ink-100 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                  {selectedYears.map((year, index) => {
                    const isCurrentSelection = index === selectedYears.length - 1;
                    return (
                      <span key={year} className="inline-flex items-center gap-2">
                        <span
                          className={`block w-7 border-t-2 ${isCurrentSelection ? "border-solid border-ink-950" : index % 2 === 0 ? "border-dotted border-ink-500" : "border-dashed border-ink-500"}`}
                          aria-hidden
                        />
                        {year}
                      </span>
                    );
                  })}
                </div>
              </>
            )}
          </Card>
        </div>
        <PrintReportFooter />
      </div>
    </div>
  );
}
