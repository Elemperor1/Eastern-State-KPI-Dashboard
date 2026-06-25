"use client";

import { useMemo, useState } from "react";
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
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
  const [categorySlug, setCategorySlug] = useState<string>("all");
  const initialKpiSlugs = (() => {
    // Start with the first KPI from each category, capped at 3.
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
  const [kpiSlugs, setKpiSlugs] = useState<string[]>(initialKpiSlugs);
  const [selectedYears, setSelectedYears] = useState<number[]>(years.slice(-3));

  const visibleKPIs = useMemo(() => {
    return categorySlug === "all"
      ? kpis
      : kpis.filter((k) => k.category_slug === categorySlug);
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

  const sampleFormat = kpiSlugs[0]
    ? kpis.find((k) => k.slug === kpiSlugs[0])?.format ?? "number"
    : "number";

  function toggleKpi(slug: string) {
    setKpiSlugs((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  }
  function toggleYear(year: number) {
    setSelectedYears((prev) => (prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]));
  }

  return (
    <div className="px-8 py-8 max-w-[1400px] mx-auto">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-500 mb-2">Trend Explorer</p>
        <h1 className="text-3xl font-display font-semibold text-ink-900">
          Multi-KPI · Multi-Year Trends
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          Compare any combination of KPIs and years to see how the site is moving.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <aside className="space-y-4 no-print">
          <div className="surface p-4">
            <p className="label">Category</p>
            <select
              className="input"
              value={categorySlug}
              onChange={(e) => {
                setCategorySlug(e.target.value);
                setKpiSlugs([]);
              }}
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="surface p-4">
            <p className="label">KPIs</p>
            <div className="space-y-1.5 max-h-72 overflow-auto pr-1">
              {visibleKPIs.map((kpi) => {
                const checked = kpiSlugs.includes(kpi.slug);
                return (
                  <label key={kpi.id} className="flex items-start gap-2 text-sm text-ink-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleKpi(kpi.slug)}
                      className="mt-0.5"
                    />
                    <span className="flex-1">{kpi.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="surface p-4">
            <p className="label">Years</p>
            <div className="flex flex-wrap gap-1.5">
              {years.map((year) => {
                const checked = selectedYears.includes(year);
                return (
                  <button
                    key={year}
                    onClick={() => toggleYear(year)}
                    className={`px-3 py-1 rounded-md text-sm font-medium border ${
                      checked
                        ? "bg-brand-700 text-white border-brand-700"
                        : "bg-white text-ink-700 border-ink-200 hover:bg-ink-50"
                    }`}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <div className="surface p-6 min-h-[420px]">
          {kpiSlugs.length === 0 ? (
            <p className="text-sm text-ink-500">Select at least one KPI to view the trend.</p>
          ) : (
            <div className="h-[520px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#475569" }} />
                  <YAxis
                    tickFormatter={(v) => formatValue(Number(v), sampleFormat, { compact: true })}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#475569" }}
                    width={70}
                  />
                  <Tooltip
                    formatter={(value) => {
                      if (value === null || value === undefined) return ["—", ""];
                      return [formatValue(Number(value), sampleFormat), ""];
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
        </div>
      </div>
    </div>
  );
}