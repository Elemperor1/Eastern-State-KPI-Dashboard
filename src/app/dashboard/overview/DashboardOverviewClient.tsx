"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ExportPDFButton } from "@/components/ExportPDFButton";
import { DashboardControls, type CompareState } from "@/components/DashboardControls";
import { CategoryOverviewCard } from "@/components/CategoryOverviewCard";
import { PageHeader } from "@/components/ui";
import { SampleDataBadge } from "@/components/SampleDataBadge";
import { CHART_COLORS, MONTH_FULL } from "@/lib/analytics";
import type { DashboardData } from "@/lib/dashboard-data";

export function DashboardOverviewClient({
  data,
  initialState,
}: {
  data: DashboardData;
  initialState: CompareState;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<CompareState>(initialState);

  useEffect(() => {
    setState(initialState);
  }, [initialState.currentYear, initialState.compareYear, initialState.currentMonth]);

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

  return (
    <div className="page-content page-content-wide page-enter">
      <div id="dashboard-print-root">
        <PageHeader
          eyebrow="KPI Intelligence Dashboard"
          title="Organizational Performance"
          subtitle={
            <>
              {monthLabel} {state.currentYear} compared with {state.compareYear} ·{" "}
              {data.categories.length} categories · {data.kpis.length} metrics
            </>
          }
          actions={
            <>
              <SampleDataBadge sample={data.sampleData} />
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

        <section aria-label="Categories" className="mb-12">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="section-eyebrow">Category Overview</p>
              <h2 className="text-2xl font-medium tracking-[-0.02em] text-ink-900">Performance by area</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-ink-600 text-pretty">
              Open a category for metric-level trends, values, and reporting context.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.categories.map((cat, idx) => (
              <CategoryOverviewCard
                key={cat.id}
                category={cat}
                kpis={data.kpis}
                entries={data.entries}
                breakdowns={data.breakdowns}
                currentYear={state.currentYear}
                compareYear={state.compareYear}
                currentMonth={state.currentMonth}
                accent={CHART_COLORS[idx % CHART_COLORS.length]}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
