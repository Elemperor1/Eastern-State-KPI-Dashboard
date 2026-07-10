"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LegacyExportPDFButton } from "@/components/LegacyExportPDFButton";
import { DashboardControls, type CompareState } from "@/components/DashboardControls";
import { CategoryAnnualBreakdowns } from "@/components/CategoryAnnualBreakdowns";
import { CategoryMetricGrid } from "@/components/CategoryMetricGrid";
import { CategoryMonthlyBreakdowns } from "@/components/CategoryMonthlyBreakdowns";
import { Breadcrumb, ExportCSVButton, ExportPNGButton, PageHeader, PrintButton, PrintReportFooter, PrintReportHeader } from "@/components/ui";
import { SampleDataBadge } from "@/components/SampleDataBadge";
import { buildCategoryPageModel } from "@/features/reporting/category-page";
import { buildCategoryCsvExport } from "@/features/reporting/csv";
import { MONTH_FULL } from "@/features/metrics";
import type { DashboardData } from "@/features/reporting/types";

export function CategoryPageClient({
  data,
  categorySlug,
  initialState,
  legacyPdfEnabled,
}: {
  data: DashboardData;
  categorySlug: string;
  initialState: CompareState;
  legacyPdfEnabled: boolean;
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
  const allowMonth =
    model.monthlyBreakdowns.length > 0 ||
    model.metricCards.some((metric) => {
      const frequency = metric.strategic?.reportingFrequency;
      if (frequency) {
        return frequency === "monthly" ||
          frequency === "quarterly" ||
          frequency === "flexible";
      }
      return metric.kpi.reporting_frequency === "monthly";
    });

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
            ...(allowMonth
              ? [{ label: "Through Month", value: MONTH_FULL[state.currentMonth - 1] }]
              : []),
          ]}
        />
        <Breadcrumb href="/dashboard/overview" label="All categories" />

        <PageHeader
          className="no-print"
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
                enabled={legacyPdfEnabled}
              />
            </>
          }
        />

        <DashboardControls
          state={state}
          availableYears={data.years}
          onChange={updateState}
          allowMonth={allowMonth}
        />

        <CategoryMetricGrid
          groups={model.metricGroups}
          title={
            allowMonth
              ? `${MONTH_FULL[state.currentMonth - 1]} ${state.currentYear} vs ${state.compareYear}`
              : `${state.currentYear} vs ${state.compareYear}`
          }
          onMetricSelect={(slug) => router.push(`/dashboard/metric/${slug}`)}
        />

        <CategoryMonthlyBreakdowns
          sections={model.monthlyBreakdowns}
          title={`Through ${MONTH_FULL[state.currentMonth - 1]} ${state.currentYear}`}
          currentYear={state.currentYear}
          compareYear={state.compareYear}
          currentMonth={state.currentMonth}
        />

        <CategoryAnnualBreakdowns
          sections={model.annualBreakdowns}
          currentYear={state.currentYear}
          compareYear={state.compareYear}
        />
        <PrintReportFooter />
      </div>
    </div>
  );
}
