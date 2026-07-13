"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LegacyExportPDFButton } from "@/components/LegacyExportPDFButton";
import { DashboardControls, type CompareState } from "@/components/DashboardControls";
import { MetricBreakdownPanel } from "@/components/MetricBreakdownPanel";
import { MetricComparisonStats } from "@/components/MetricComparisonStats";
import { MetricGoalPanel, type GoalDisplayMode } from "@/components/MetricGoalPanel";
import { MetricTrendCard } from "@/components/MetricTrendCard";
import { MetricValuesTable } from "@/components/MetricValuesTable";
import { MetricYtdBarCard } from "@/components/MetricYtdBarCard";
import { StrategicKpiProgressPanel } from "@/components/StrategicKpiProgressPanel";
import { StrategicAuditTable } from "@/components/StrategicAuditTable";
import { Breadcrumb, ExportCSVButton, ExportPNGButton, PageHeader, PrintButton, PrintReportFooter, PrintReportHeader } from "@/components/ui";
import { SampleDataBadge } from "@/components/SampleDataBadge";
import { buildMetricDetailModel } from "@/features/reporting/metric-detail";
import { resolveMetricDetailCadence } from "@/features/reporting/metric-detail-cadence";
import { buildMetricDetailStrategicHistory } from "@/features/reporting/metric-detail-history";
import { buildMetricCsvExport } from "@/features/reporting/csv";
import {
  buildStrategicBoardCsvExport,
  type StrategicBoardCsvRow,
} from "@/features/reporting/strategic-board-report";
import { MONTH_FULL } from "@/features/metrics";
import type { DashboardData } from "@/features/reporting/types";

export function MetricDetailClient({
  data,
  kpiSlug,
  initialState,
  initialGoalDisplay,
  legacyPdfEnabled,
}: {
  data: DashboardData;
  kpiSlug: string;
  initialState: CompareState;
  initialGoalDisplay?: GoalDisplayMode;
  legacyPdfEnabled: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<CompareState>(initialState);
  const [goalDisplay, setGoalDisplay] = useState<GoalDisplayMode>(
    initialGoalDisplay ?? "both",
  );

  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  // Sync goalDisplay from URL when the server component re-renders.
  useEffect(() => {
    if (initialGoalDisplay && initialGoalDisplay !== goalDisplay) {
      setGoalDisplay(initialGoalDisplay);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGoalDisplay]);

  const model = useMemo(
    () => buildMetricDetailModel(data, kpiSlug, state),
    [data, kpiSlug, state],
  );

  function updateState(next: Partial<CompareState>) {
    const merged = { ...state, ...next };
    setState(merged);
    const search = new URLSearchParams();
    search.set("currentYear", String(merged.currentYear));
    search.set("compareYear", String(merged.compareYear));
    search.set("currentMonth", String(merged.currentMonth));
    if (goalDisplay !== "both") search.set("goalDisplay", goalDisplay);
    router.replace(`/dashboard/metric/${kpiSlug}?${search.toString()}`, { scroll: false });
  }

  function updateGoalDisplay(mode: GoalDisplayMode) {
    setGoalDisplay(mode);
    const search = new URLSearchParams();
    search.set("currentYear", String(state.currentYear));
    search.set("compareYear", String(state.compareYear));
    search.set("currentMonth", String(state.currentMonth));
    if (mode !== "both") search.set("goalDisplay", mode);
    router.replace(`/dashboard/metric/${kpiSlug}?${search.toString()}`, { scroll: false });
  }

  if (!model.kpi || !model.category || !model.analytics) return null;

  const {
    kpi,
    category,
    analytics,
    isAnnual,
    isBreakdown,
    trendYears,
    trendPoints,
    ytdBar,
    favorableMonthly,
    favorableYtd,
    goal,
    goalIsAnnual,
    tableRows,
    directionLabel,
    breakdown,
  } = model;
  const ytd = analytics.ytdComparison;
  const hasGoal = goal != null;

  // Whether to show the comparison stats and/or goal progress sections.
  // When a goal exists, the user can toggle between three display modes.
  // Without a goal, always show the comparison stats.
  const showCompare = goalDisplay !== "goal" || !hasGoal;

  const printId = `metric-${kpiSlug}-print`;

  const csvExport = buildMetricCsvExport({ kpi, rows: tableRows, period: state });
  const strategicKpi = data.strategicBoardReport.priorities
    .flatMap((priority) => priority.goals)
    .flatMap((strategicGoal) => strategicGoal.kpis)
    .find((candidate) => candidate.id === String(kpi.id));
  const strategicHistory = buildMetricDetailStrategicHistory({
    kpiId: kpi.id,
    throughYear: state.currentYear,
    firstClassHistory: data.strategicActuals ?? [],
    legacyEntries: data.entries,
    measurementType: strategicKpi?.measurementType ?? null,
    reportingFrequency: strategicKpi?.reportingFrequency ?? null,
    legacyUnit: kpi.unit,
  });
  const boardCsv = buildStrategicBoardCsvExport(data.strategicBoardReport);
  const boardCsvRows = strategicKpi
    ? strategicBoardRowsForKpi(boardCsv.rows, strategicKpi.id)
    : [];
  const cadence = resolveMetricDetailCadence({
    legacyIsAnnual: isAnnual,
    strategicMeasurementType: strategicKpi?.measurementType ?? null,
    strategicReportingFrequency: strategicKpi?.reportingFrequency ?? null,
    hasStrategicHistory: strategicHistory.length > 0,
  });
  const showLegacyHistory = cadence.legacyHistoryKind !== null;

  return (
    <div className="page-content page-enter">
      <div id={printId}>
        <PrintReportHeader
          eyebrow={category.name}
          title={kpi.name}
          subtitle={kpi.description}
          filters={[
            { label: "Current Year", value: String(state.currentYear) },
            { label: "Compare Year", value: String(state.compareYear) },
            ...(cadence.allowMonth ? [{ label: "Through Month", value: MONTH_FULL[state.currentMonth - 1] }] : []),
            ...(goal ? [{ label: "Goal", value: `${goal.target_value > 0 ? "+" : ""}${goal.target_value}${goal.goal_type === "pct" ? "%" : ""}` }] : []),
          ]}
        />
        <Breadcrumb href={`/dashboard/category/${category.slug}`} label={category.name} />

        <PageHeader
          className="no-print"
          eyebrow={category.name}
          title={kpi.name}
          subtitle={
            <>
              {kpi.description}{" "}
              <span className="text-ink-500">· {cadence.label} · {kpi.unit_type} · {directionLabel}</span>
            </>
          }
          actions={
            <>
              <SampleDataBadge sample={data.sampleData} />
              {strategicKpi ? (
                <ExportCSVButton
                  rows={boardCsvRows}
                  columns={[...boardCsv.columns]}
                  filename={`eastern-state-${kpiSlug}-board-${state.currentYear}.csv`}
                  label="Export board CSV"
                />
              ) : null}
              {showLegacyHistory ? (
                <ExportCSVButton rows={csvExport.rows} columns={csvExport.columns} filename={csvExport.filename} label="Export history CSV" />
              ) : null}
              <PrintButton />
              <ExportPNGButton
                targetId={printId}
                fileName={`eastern-state-${kpiSlug}.png`}
              />
              <LegacyExportPDFButton
                targetId={printId}
                fileName={`eastern-state-${kpiSlug}.pdf`}
                enabled={legacyPdfEnabled}
              />
            </>
          }
        />

        <DashboardControls
          state={state}
          availableYears={data.years}
          onChange={updateState}
          allowMonth={cadence.allowMonth}
        />

        {strategicKpi ? (
          <StrategicKpiProgressPanel
            kpi={strategicKpi}
            history={strategicHistory}
          />
        ) : null}

        {!isBreakdown && showCompare && showLegacyHistory ? (
          <MetricComparisonStats
            analytics={analytics}
            favorableMonthly={favorableMonthly}
            favorableYtd={favorableYtd}
            yearOverYearMeasurement={strategicKpi?.measurementType === "year_over_year"}
          />
        ) : null}

        {goal ? (
          <MetricGoalPanel
            goal={goal}
            goalIsAnnual={goalIsAnnual}
            currentMonth={state.currentMonth}
            goalDisplay={goalDisplay}
            onGoalDisplayChange={updateGoalDisplay}
          />
        ) : null}

        {showLegacyHistory ? isBreakdown ? (
          <MetricBreakdownPanel
            kpi={kpi}
            breakdown={breakdown}
            currentYear={state.currentYear}
            compareYear={state.compareYear}
            currentMonth={state.currentMonth}
          />
        ) : cadence.legacyHistoryKind === "annual" ? (
          <MetricYtdBarCard
            eyebrow={strategicKpi?.measurementType === "year_over_year" ? "Year-over-year measurement" : "Annual history"}
            title={strategicKpi?.measurementType === "year_over_year" ? "Year-over-year result" : "Annual results by reporting year"}
            data={ytdBar}
            currentYear={ytd.currentYear}
            compareYear={ytd.compareYear}
            unitType={kpi.unit_type}
            maxBarSize={64}
          />
        ) : (
          <>
            <MetricTrendCard
              data={trendPoints}
              years={trendYears}
              unitType={kpi.unit_type}
              unit={kpi.unit}
            />

            <MetricYtdBarCard
              eyebrow="Year-to-date"
              title={`Through ${MONTH_FULL[state.currentMonth - 1]} · ${state.currentYear} vs ${state.compareYear}`}
              data={ytdBar}
              currentYear={ytd.currentYear}
              compareYear={ytd.compareYear}
              unitType={kpi.unit_type}
              maxBarSize={120}
            />
          </>
        ) : null}

        {!isBreakdown && showLegacyHistory ? (
          <MetricValuesTable
            rows={tableRows}
            unitType={kpi.unit_type}
            currentYear={state.currentYear}
            compareYear={state.compareYear}
            isAnnual={cadence.legacyHistoryKind === "annual"}
          />
        ) : null}
        {data.strategicAuditEvents && data.strategicAuditEvents.length > 0 ? (
          <div className="mb-10">
            <StrategicAuditTable events={data.strategicAuditEvents} />
          </div>
        ) : null}
        <PrintReportFooter />
      </div>
    </div>
  );
}

export function strategicBoardRowsForKpi(
  rows: StrategicBoardCsvRow[],
  kpiId: string,
): StrategicBoardCsvRow[] {
  return rows.filter((row) => String(row["KPI ID"]) === kpiId);
}
