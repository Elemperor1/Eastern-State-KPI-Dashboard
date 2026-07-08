"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ExportCSVButton,
  ExportPNGButton,
  PageHeader,
  PrintButton,
  PrintReportFooter,
  PrintReportHeader,
} from "@/components/ui";
import { TrendExplorerChartPanel } from "@/components/TrendExplorerChartPanel";
import { TrendExplorerSidebar } from "@/components/TrendExplorerSidebar";
import {
  buildTrendExplorerModel,
  type TrendAxisMode,
  type TrendExplorerPageData,
} from "@/features/reporting/trend-explorer";

export function TrendExplorerClient({
  data,
}: {
  data: TrendExplorerPageData;
}) {
  const { categories, entries, initialSelection, kpis, years } = data;
  const [categorySlug, setCategorySlug] = useState<string>(initialSelection.categorySlug);
  const [kpiSlugs, setKpiSlugs] = useState<string[]>(initialSelection.kpiSlugs);
  const [selectedYears, setSelectedYears] = useState<number[]>(initialSelection.selectedYears);
  const [axisMode, setAxisMode] = useState<TrendAxisMode>(initialSelection.axisMode);

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
          className="no-print"
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
          <TrendExplorerSidebar
            categories={categories}
            visibleKpis={trendModel.visibleKPIs}
            years={years}
            categorySlug={categorySlug}
            selectedKpiSlugs={kpiSlugs}
            selectedYears={selectedYears}
            onCategoryChange={(nextCategorySlug) => {
              setCategorySlug(nextCategorySlug);
              setKpiSlugs([]);
            }}
            onToggleKpi={toggleKpi}
            onToggleYear={toggleYear}
          />

          <TrendExplorerChartPanel
            model={trendModel}
            axisMode={axisMode}
            selectedKpiCount={kpiSlugs.length}
            selectedYearCount={selectedYears.length}
            selectedYears={selectedYears}
            onAxisModeChange={setAxisMode}
          />
        </div>
        <PrintReportFooter />
      </div>
    </div>
  );
}
