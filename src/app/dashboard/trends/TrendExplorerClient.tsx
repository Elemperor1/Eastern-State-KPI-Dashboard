"use client";

import { useMemo, useState } from "react";
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import { Badge, Card, Checkbox, Chip, EmptyState, FormField, PageHeader, Select } from "@/components/ui";
import { CHART_COLORS, formatValue, MONTH_LABELS } from "@/lib/analytics";
import type {
  Category,
  ComparisonPoint,
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
  const initialKpiSlugs = (() => {
    const seen = new Set<string>();
    const picks: string[] = [];
    for (const kpi of kpis) {
      if (seen.has(kpi.category_slug)) continue;
      seen.add(kpi.category_slug);
      picks.push(kpi.slug);
      if (picks.length >= 3) break;
    }
    return picks;
  })();
  const [categorySlug, setCategorySlug] = useState<string>("all");
  const [kpiSlugs, setKpiSlugs] = useState<string[]>(initialKpiSlugs);
  const [selectedYears, setSelectedYears] = useState<number[]>(years.slice(-3));

  const visibleKPIs = useMemo(() => {
    const base = categorySlug === "all"
      ? kpis
      : kpis.filter((k) => k.category_slug === categorySlug);
    return base.filter((k) => k.reporting_frequency === "monthly" && k.unit_type !== "breakdown");
  }, [kpis, categorySlug]);

  const trendData: ComparisonPoint[] = useMemo(() => {
    const points: ComparisonPoint[] = [];
    for (let month = 1; month <= 12; month++) {
      const point: ComparisonPoint = { label: MONTH_LABELS[month - 1], month };
      for (const kpiSlug of kpiSlugs) {
        const kpi = kpis.find((k) => k.slug === kpiSlug);
        if (!kpi) continue;
        const value = entries
          .filter((e) => e.kpi_id === kpi.id && e.month === month)
          .reduce((acc, e) => {
            if (selectedYears.includes(e.year)) {
              acc[e.year] = (acc[e.year] || 0) + e.value;
            }
            return acc;
          }, {} as Record<number, number>);
        for (const year of selectedYears) {
          point[`${kpi.slug}__${year}`] = value[year] ?? null;
        }
      }
      points.push(point);
    }
    return points;
  }, [kpis, entries, kpiSlugs, selectedYears]);

  const sampleUnitType = kpiSlugs[0]
    ? kpis.find((k) => k.slug === kpiSlugs[0])?.unit_type ?? "count"
    : "count";

  function toggleKpi(slug: string) {
    setKpiSlugs((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  }
  function toggleYear(year: number) {
    setSelectedYears((prev) => (prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]));
  }

  return (
    <div className="page-content page-content-wide page-enter">
      <PageHeader
        eyebrow="Trend Explorer"
        title="Multi-KPI · Multi-Year Trends"
        subtitle="Compare any combination of KPIs and years to see how the site is moving."
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
              {visibleKPIs.map((kpi) => {
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
              {visibleKPIs.length === 0 && (
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
          {kpiSlugs.length === 0 || selectedYears.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title={kpiSlugs.length === 0 ? "Select a KPI" : "Select a year"}
              description={
                kpiSlugs.length === 0
                  ? "Use the control rail to choose a category, then pick KPIs and years to see the trend."
                  : "Choose at least one year to draw the selected measures."
              }
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
                  {kpiSlugs.map((slug, index) => {
                    const kpi = kpis.find((item) => item.slug === slug);
                    if (!kpi) return null;
                    return (
                      <span key={slug} className="inline-flex items-center gap-2 text-xs text-ink-600">
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
              <div className="h-[440px] px-2 pb-4 pt-5 md:h-[560px] md:px-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--chart-axis)" }} />
                  <YAxis
                    tickFormatter={(v) => formatValue(Number(v), sampleUnitType, { compact: true })}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
                    width={70}
                  />
                  <Tooltip
                    formatter={(value) => {
                      if (value === null || value === undefined) return ["—", ""];
                      return [formatValue(Number(value), sampleUnitType), ""];
                    }}
                  />
                  {kpiSlugs.flatMap((slug, ki) =>
                    selectedYears.map((year, yi) => {
                      const kpi = kpis.find((k) => k.slug === slug);
                      if (!kpi) return null;
                      const color = CHART_COLORS[ki % CHART_COLORS.length];
                      const isCurrentSelection = yi === selectedYears.length - 1;
                      return (
                        <Line
                          key={`${slug}__${year}`}
                          dataKey={`${slug}__${year}`}
                          name={`${kpi.name} ${year}`}
                          stroke={color}
                          strokeWidth={isCurrentSelection ? 2.75 : 1.75}
                          strokeOpacity={isCurrentSelection ? 1 : 0.62}
                          strokeDasharray={isCurrentSelection ? undefined : yi % 2 === 0 ? "2 4" : "7 4"}
                          dot={false}
                          activeDot={{ r: 4, strokeWidth: 0 }}
                          connectNulls={false}
                        />
                      );
                    }),
                  )}
                </LineChart>
              </ResponsiveContainer>
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
    </div>
  );
}
