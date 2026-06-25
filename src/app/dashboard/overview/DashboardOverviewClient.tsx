"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ExportPDFButton } from "@/components/ExportPDFButton";
import { DashboardControls, type CompareState } from "@/components/DashboardControls";
import { CategoryOverviewCard } from "@/components/CategoryOverviewCard";
import { ChartContainer, PageHeader } from "@/components/ui";
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
    <div className="px-6 py-6 lg:px-8 lg:py-8 max-w-[1400px] mx-auto">
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

        <section aria-label="Categories" className="mb-10">
          <ChartContainer
            eyebrow="Category Overview"
            title="Performance by area"
            className="mb-0"
            bodyClassName="-mx-5 -mb-5 lg:-mx-6 lg:-mb-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 p-5 lg:p-6">
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
          </ChartContainer>
        </section>
      </div>
    </div>
  );
}
