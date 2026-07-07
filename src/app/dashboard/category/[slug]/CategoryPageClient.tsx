"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LegacyExportPDFButton } from "@/components/LegacyExportPDFButton";
import { DashboardControls, type CompareState } from "@/components/DashboardControls";
import { MetricCard } from "@/components/MetricCard";
import { BreakdownChart } from "@/components/BreakdownChart";
import { DonorConversionCard } from "@/components/DonorConversionCard";
import { Breadcrumb, Card, ExportCSVButton, ExportPNGButton, PageHeader, PrintButton, PrintReportFooter, PrintReportHeader } from "@/components/ui";
import { SampleDataBadge } from "@/components/SampleDataBadge";
import { buildCategoryPageModel } from "@/features/reporting/category-page";
import { buildCategoryCsvExport } from "@/features/reporting/csv";
import { CHART_COLORS, MONTH_FULL } from "@/lib/analytics";
import type { DashboardData } from "@/features/reporting/types";

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
  }, [initialState]);

  const model = useMemo(
    () => buildCategoryPageModel(data, categorySlug, state),
    [data, categorySlug, state],
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

  if (!model.category) return null;

  const csvExport = buildCategoryCsvExport(data, categorySlug, state);

  const printId = `category-${categorySlug}-print`;
  const { category } = model;

  return (
    <div className="page-content page-content-wide page-enter">
      <div id={printId}>
        <PrintReportHeader
          eyebrow={category.name}
          title={category.name}
          subtitle={category.description}
          filters={[
            { label: "Current Year", value: String(state.currentYear) },
            { label: "Compare Year", value: String(state.compareYear) },
            { label: "Through Month", value: MONTH_FULL[state.currentMonth - 1] },
          ]}
        />
        <Breadcrumb href="/dashboard/overview" label="All categories" />

        <PageHeader
          eyebrow={category.name}
          title={category.name}
          subtitle={category.description}
          actions={
            <>
              <SampleDataBadge sample={data.sampleData} />
              <ExportCSVButton rows={csvExport.rows} columns={csvExport.columns} filename={csvExport.filename} />
              <PrintButton />
              <ExportPNGButton
                targetId={printId}
                fileName={`eastern-state-${categorySlug}.png`}
              />
              <LegacyExportPDFButton
                targetId={printId}
                fileName={`eastern-state-${categorySlug}.pdf`}
              />
            </>
          }
        />

        <DashboardControls state={state} availableYears={data.years} onChange={updateState} />

        {model.metricCards.length > 0 ? (
          <section className="mb-10">
            <div className="section-head">
              <p className="section-eyebrow">Metrics</p>
              <h2 className="section-title">
                {MONTH_FULL[state.currentMonth - 1]} {state.currentYear} vs {state.compareYear}
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {model.metricCards.map((metric, idx) => (
                <MetricCard
                  key={metric.kpi.id}
                  analytics={metric.analytics}
                  accentColor={CHART_COLORS[idx % CHART_COLORS.length]}
                  onSelect={() => router.push(`/dashboard/metric/${metric.kpi.slug}`)}
                  goal={metric.goal}
                />
              ))}
            </div>
          </section>
        ) : null}

        {model.monthlyBreakdowns.length > 0 ? (
          <section className="mb-10 space-y-6">
            <div className="section-head">
              <p className="section-eyebrow">Monthly breakdowns</p>
              <h2 className="section-title">
                Through {MONTH_FULL[state.currentMonth - 1]} {state.currentYear}
              </h2>
            </div>
            {model.monthlyBreakdowns.map((section) => (
              <Card key={section.kpi.id} className="p-5 lg:p-6">
                <DonorConversionCard
                  kpi={section.kpi}
                  data={section.breakdowns}
                  currentYear={state.currentYear}
                  compareYear={state.compareYear}
                  currentMonth={state.currentMonth}
                />
              </Card>
            ))}
          </section>
        ) : null}

        {model.annualBreakdowns.length > 0 ? (
          <section className="mb-10 space-y-6">
            <div className="section-head">
              <p className="section-eyebrow">Breakdowns</p>
              <h2 className="section-title">Composition metrics</h2>
            </div>
            {model.annualBreakdowns.map((section) => (
              <Card key={section.kpi.id} className="p-5 lg:p-6">
                <BreakdownChart
                  kpi={section.kpi}
                  data={section.breakdowns}
                  currentYear={state.currentYear}
                  compareYear={state.compareYear}
                />
              </Card>
            ))}
          </section>
        ) : null}
        <PrintReportFooter />
      </div>
    </div>
  );
}
