"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExportPDFButton } from "@/components/ExportPDFButton";
import { DashboardControls, type CompareState } from "@/components/DashboardControls";
import { MetricCard } from "@/components/MetricCard";
import { BreakdownChart } from "@/components/BreakdownChart";
import { Breadcrumb, Card, PageHeader } from "@/components/ui";
import { SampleDataBadge } from "@/components/SampleDataBadge";
import { buildKPIAnalytics, CHART_COLORS, MONTH_FULL } from "@/lib/analytics";
import type { DashboardData } from "@/lib/dashboard-data";
import type { KPIWithCategory } from "@/lib/types";

export function CategoryPageClient({
  data,
  categorySlug,
  initialState,
}: {
  data: DashboardData;
  categorySlug: string;
  initialState: CompareState;
}) {
  const router = useRouter();
  const [state, setState] = useState<CompareState>(initialState);

  useEffect(() => {
    setState(initialState);
  }, [initialState.currentYear, initialState.compareYear, initialState.currentMonth]);

  const category = data.categories.find((c) => c.slug === categorySlug);
  const catKpis = useMemo(
    () => data.kpis.filter((k) => k.category_slug === categorySlug),
    [data.kpis, categorySlug],
  );

  function updateState(next: Partial<CompareState>) {
    const merged = { ...state, ...next };
    setState(merged);
    const search = new URLSearchParams();
    search.set("currentYear", String(merged.currentYear));
    search.set("compareYear", String(merged.compareYear));
    search.set("currentMonth", String(merged.currentMonth));
    router.replace(`/dashboard/category/${categorySlug}?${search.toString()}`, { scroll: false });
  }

  if (!category) return null;

  const monthlyKpis = catKpis.filter((k) => k.unit_type !== "breakdown");
  const breakdownKpis = catKpis.filter((k) => k.unit_type === "breakdown");

  function analyticsFor(kpi: KPIWithCategory) {
    const kpiEntries = data.entries.filter((e) => e.kpi_id === kpi.id);
    return buildKPIAnalytics({
      kpi,
      entries: kpiEntries,
      currentYear: state.currentYear,
      compareYear: state.compareYear,
      currentMonth: state.currentMonth,
    });
  }

  const printId = `category-${categorySlug}-print`;

  return (
    <div className="page-content page-content-wide page-enter">
      <div id={printId}>
        <Breadcrumb href="/dashboard/overview" label="All categories" />

        <PageHeader
          eyebrow={category.name}
          title={category.name}
          subtitle={category.description}
          actions={
            <>
              <SampleDataBadge sample={data.sampleData} />
              <ExportPDFButton
                targetId={printId}
                fileName={`eastern-state-${categorySlug}.pdf`}
              />
            </>
          }
        />

        <DashboardControls state={state} availableYears={data.years} onChange={updateState} />

        {monthlyKpis.length > 0 ? (
          <section className="mb-10">
            <div className="section-head">
              <p className="section-eyebrow">Metrics</p>
              <h2 className="section-title">
                {MONTH_FULL[state.currentMonth - 1]} {state.currentYear} vs {state.compareYear}
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {monthlyKpis.map((kpi, idx) => {
                const analytics = analyticsFor(kpi);
                return (
                  <MetricCard
                    key={kpi.id}
                    analytics={analytics}
                    accentColor={CHART_COLORS[idx % CHART_COLORS.length]}
                    onSelect={() => router.push(`/dashboard/metric/${kpi.slug}`)}
                  />
                );
              })}
            </div>
          </section>
        ) : null}

        {breakdownKpis.length > 0 ? (
          <section className="mb-10 space-y-6">
            <div className="section-head">
              <p className="section-eyebrow">Breakdowns</p>
              <h2 className="section-title">Composition metrics</h2>
            </div>
            {breakdownKpis.map((kpi) => (
              <Card key={kpi.id} className="p-5 lg:p-6">
                <BreakdownChart
                  kpi={kpi}
                  breakdowns={data.breakdowns}
                  currentYear={state.currentYear}
                  compareYear={state.compareYear}
                />
              </Card>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}
