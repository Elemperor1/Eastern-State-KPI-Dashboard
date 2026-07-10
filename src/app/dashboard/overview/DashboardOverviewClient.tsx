"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExportPDFButton } from "@/components/ExportPDFButton";
import { DashboardControls, type CompareState } from "@/components/DashboardControls";
import { CategoryOverviewCard } from "@/components/CategoryOverviewCard";
import { GoalCompletionSummary } from "@/components/GoalCompletionSummary";
import { StrategicBoardReport } from "@/components/StrategicBoardReport";
import { ExportCSVButton, ExportPNGButton, PageHeader, PrintButton, PrintReportFooter, PrintReportHeader } from "@/components/ui";
import { SampleDataBadge } from "@/components/SampleDataBadge";
import { buildCategoryOverviewSummaries } from "@/features/reporting/category-summary";
import { buildStrategicBoardCsvExport } from "@/features/reporting/strategic-board-report";
import { MONTH_FULL } from "@/features/metrics";
import { CHART_COLORS } from "@/lib/analytics";
import type { DashboardData } from "@/features/reporting/types";

export function DashboardOverviewClient({
  data,
  initialState,
}: {
  data: DashboardData;
  initialState: CompareState;
}) {
  const router = useRouter();
  const [state, setState] = useState<CompareState>(initialState);

  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  function updateState(next: Partial<CompareState>) {
    const merged = { ...state, ...next };
    setState(merged);
    const search = new URLSearchParams();
    if (merged.currentYear) search.set("currentYear", String(merged.currentYear));
    if (merged.compareYear) search.set("compareYear", String(merged.compareYear));
    if (merged.currentMonth) search.set("currentMonth", String(merged.currentMonth));
    const qs = search.toString();
    router.replace(qs ? `/dashboard/overview?${qs}` : "/dashboard/overview", { scroll: false });
  }

  const monthLabel = MONTH_FULL[state.currentMonth - 1];

  const csvExport = useMemo(
    () => buildStrategicBoardCsvExport(data.strategicBoardReport),
    [data.strategicBoardReport],
  );
  const categorySummaries = useMemo(
    () => buildCategoryOverviewSummaries(data, state),
    [data, state],
  );

  return (
    <div className="page-content page-content-wide page-enter">
      <div id="dashboard-print-root" data-print="hide">
        <PrintReportHeader
          eyebrow="KPI Intelligence Dashboard"
          title="Organizational Performance"
          subtitle={`${monthLabel} ${state.currentYear} compared with ${state.compareYear} · ${data.categories.length} performance areas`}
          filters={[
            { label: "Current Year", value: String(state.currentYear) },
            { label: "Compare Year", value: String(state.compareYear) },
            { label: "Through Month", value: monthLabel },
          ]}
        />
        <PageHeader
          className="no-print"
          eyebrow="KPI Intelligence Dashboard"
          title="Organizational Performance"
          subtitle={
            <>
              {monthLabel} {state.currentYear} compared with {state.compareYear} ·{" "}
              {data.categories.length} performance areas
            </>
          }
          actions={
            <>
              <SampleDataBadge sample={data.sampleData} />
              <ExportCSVButton rows={csvExport.rows} columns={[...csvExport.columns]} filename={csvExport.filename} />
              <PrintButton />
              <ExportPNGButton
                targetId="dashboard-print-root"
                fileName={`eastern-state-overview-${state.currentYear}.png`}
              />
              <ExportPDFButton
                targetId="dashboard-print-root"
                fileName={`eastern-state-overview-${state.currentYear}.pdf`}
              />
            </>
          }
        />

        <DashboardControls
          state={state}
          availableYears={data.years}
          onChange={updateState}
        />

        <div className="mb-12">
          <GoalCompletionSummary
            organization={data.strategicSummary.organization}
          />
        </div>

        <section aria-label="Categories" className="mb-12">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="section-eyebrow">Executive overview</p>
              <h2 className="text-2xl font-medium tracking-[-0.02em] text-ink-900">Performance by area</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-ink-600 text-pretty">
              Open a category for metric-level trends, values, and reporting context.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {categorySummaries.map((summary, idx) => (
              <CategoryOverviewCard
                key={summary.category.id}
                summary={summary}
                accent={CHART_COLORS[idx % CHART_COLORS.length]}
              />
            ))}
          </div>
        </section>
        <PrintReportFooter />
      </div>
      <div id="strategic-board-export-root">
        <StrategicBoardReport report={data.strategicBoardReport} />
      </div>
    </div>
  );
}
