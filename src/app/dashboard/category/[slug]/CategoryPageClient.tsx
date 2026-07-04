"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LegacyExportPDFButton } from "@/components/LegacyExportPDFButton";
import { DashboardControls, type CompareState } from "@/components/DashboardControls";
import { MetricCard } from "@/components/MetricCard";
import { BreakdownChart } from "@/components/BreakdownChart";
import { DonorConversionCard } from "@/components/DonorConversionCard";
import { Breadcrumb, Card, ExportCSVButton, PageHeader, PrintButton } from "@/components/ui";
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

  // Build a kpi_id -> goal lookup for the selected year.
  const goalsByKpiId = useMemo(() => {
    const map = new Map(
      data.goals
        .filter((g) => g.target_year === state.currentYear)
        .map((g) => [g.kpi_id, g]),
    );
    return map;
  }, [data.goals, state.currentYear]);

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
  const monthlyBreakdownKpis = breakdownKpis.filter((k) =>
    data.breakdowns.some((b) => b.kpi_id === k.id && b.month > 0),
  );
  const annualBreakdownKpis = breakdownKpis.filter((k) =>
    !data.breakdowns.some((b) => b.kpi_id === k.id && b.month > 0),
  );

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

  // Long-format CSV: one row per (kpi, period, kind). Keeps the file
  // pivot-friendly in Excel / Sheets while still matching what the user
  // can see on the category page (current-vs-compare through the active
  // month, plus breakdown composition for both years).
  type CsvRow = Record<string, string | number | null>;
  const csvRows: CsvRow[] = [];
  for (const kpi of monthlyKpis) {
    const a = analyticsFor(kpi);
    if (kpi.reporting_frequency === "annual") {
      for (const y of a.years) {
        csvRows.push({
          KPI: kpi.name,
          Unit: kpi.unit_type,
          Reporting: "annual",
          Year: y.year,
          Period: "full year",
          Value: y.fullYearValue ?? "",
          Compare_Value: "",
          Notes: "",
        });
      }
    } else {
      const monthsToShow = Math.min(state.currentMonth, 12);
      for (let m = 1; m <= 12; m++) {
        const cur = data.entries.find(
          (e) => e.kpi_id === kpi.id && e.year === state.currentYear && e.month === m,
        );
        const cmp = data.entries.find(
          (e) => e.kpi_id === kpi.id && e.year === state.compareYear && e.month === m,
        );
        if (cur || cmp || m <= monthsToShow) {
          csvRows.push({
            KPI: kpi.name,
            Unit: kpi.unit_type,
            Reporting: "monthly",
            Year: m <= monthsToShow ? state.currentYear : "",
            Period: MONTH_FULL[m - 1],
            Value: cur?.value ?? "",
            Compare_Value: cmp?.value ?? "",
            Compare_Year: m <= monthsToShow ? state.compareYear : "",
            Notes: cur?.notes ?? "",
          });
        }
      }
    }
  }
  for (const kpi of breakdownKpis) {
    const rows = data.breakdowns.filter(
      (b) => b.kpi_id === kpi.id && (b.year === state.currentYear || b.year === state.compareYear),
    );
    for (const r of rows) {
      csvRows.push({
        KPI: kpi.name,
        Unit: kpi.unit_type,
        Reporting: r.month > 0 ? "monthly breakdown" : "breakdown",
        Year: r.year,
        Period: r.month > 0 ? `${MONTH_FULL[r.month - 1]} - ${r.label}` : r.label,
        Value: r.value,
        Compare_Value: "",
        Notes: "",
      });
    }
  }
  const csvColumns = [
    "KPI",
    "Unit",
    "Reporting",
    "Year",
    "Period",
    "Value",
    "Compare_Year",
    "Compare_Value",
    "Notes",
  ];
  const csvFilename = `eastern-state-${categorySlug}-${state.currentYear}-vs-${state.compareYear}.csv`;

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
              <ExportCSVButton rows={csvRows} columns={csvColumns} filename={csvFilename} />
              <PrintButton />
              <LegacyExportPDFButton
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
                    goal={goalsByKpiId.get(kpi.id) ?? null}
                  />
                );
              })}
            </div>
          </section>
        ) : null}

        {monthlyBreakdownKpis.length > 0 ? (
          <section className="mb-10 space-y-6">
            <div className="section-head">
              <p className="section-eyebrow">Monthly breakdowns</p>
              <h2 className="section-title">
                Through {MONTH_FULL[state.currentMonth - 1]} {state.currentYear}
              </h2>
            </div>
            {monthlyBreakdownKpis.map((kpi) => (
              <Card key={kpi.id} className="p-5 lg:p-6">
                <DonorConversionCard
                  kpi={kpi}
                  data={data.breakdowns.filter((b) => b.kpi_id === kpi.id)}
                  currentYear={state.currentYear}
                  compareYear={state.compareYear}
                  currentMonth={state.currentMonth}
                />
              </Card>
            ))}
          </section>
        ) : null}

        {annualBreakdownKpis.length > 0 ? (
          <section className="mb-10 space-y-6">
            <div className="section-head">
              <p className="section-eyebrow">Breakdowns</p>
              <h2 className="section-title">Composition metrics</h2>
            </div>
            {annualBreakdownKpis.map((kpi) => (
              <Card key={kpi.id} className="p-5 lg:p-6">
                <BreakdownChart
                  kpi={kpi}
                  data={data.breakdowns.filter(
                    (b) =>
                      b.kpi_id === kpi.id &&
                      b.month === 0 &&
                      (b.year === state.currentYear || b.year === state.compareYear),
                  )}
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
