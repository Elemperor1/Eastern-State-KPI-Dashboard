"use client";

import { useMemo, useState } from "react";
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { BarChart3 } from "lucide-react";
import { Card, FormField, Select, Badge, EmptyState, Chip } from "@/components/ui";
import { CHART_COLORS, formatValue, MONTH_LABELS } from "@/lib/analytics";
import { PageHeader } from "@/components/ui/PageHeader";
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
    <div className="px-6 py-6 lg:px-8 lg:py-8 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="Trend Explorer"
        title="Multi-KPI · Multi-Year Trends"
        subtitle="Compare any combination of KPIs and years to see how the site is moving."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <aside className="space-y-4 no-print">
          <Card className="p-4">
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
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="label mb-0">KPIs</p>
              <Badge variant="default" className="tabular">{kpiSlugs.length} selected</Badge>
            </div>
            <div className="space-y-2 max-h-72 overflow-auto pr-1">
              {visibleKPIs.map((kpi) => {
                const checked = kpiSlugs.includes(kpi.slug);
                return (
                  <label
                    key={kpi.id}
                    className="flex items-start gap-2.5 text-sm text-ink-700 cursor-pointer p-1.5 rounded-lg hover:bg-ink-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleKpi(kpi.slug)}
                      className="mt-0.5 w-4 h-4 accent-brand-700"
                    />
                    <span className="flex-1 text-pretty">{kpi.name}</span>
                  </label>
                );
              })}
              {visibleKPIs.length === 0 && (
                <p className="text-xs text-ink-500">No monthly KPIs in this category.</p>
              )}
            </div>
          </Card>

          <Card className="p-4">
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
          </Card>
        </aside>

        <Card className="p-5 lg:p-6 min-h-[420px] flex flex-col">
          {kpiSlugs.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="Select a KPI"
              description="Use the sidebar to choose a category, then pick KPIs and years to see the trend."
            />
          ) : (
            <div className="h-[520px]">
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
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                  {kpiSlugs.flatMap((slug, ki) =>
                    selectedYears.map((year, yi) => {
                      const kpi = kpis.find((k) => k.slug === slug);
                      if (!kpi) return null;
                      const color = CHART_COLORS[(ki * 2 + yi) % CHART_COLORS.length];
                      return (
                        <Line
                          key={`${slug}__${year}`}
                          dataKey={`${slug}__${year}`}
                          name={`${kpi.name} ${year}`}
                          stroke={color}
                          strokeWidth={2}
                          dot={{ r: 3, strokeWidth: 0 }}
                          connectNulls={false}
                        />
                      );
                    }),
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
