"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  Badge,
  Card,
  Progress,
  ProgressToTarget,
  Table,
  type ProgressToTargetViewModel,
} from "@/components/ui";
import type {
  StrategicBoardKpiViewModel,
  TargetProgressViewModel,
} from "@/features/reporting/strategic-board-report";
import type { MetricDetailStrategicHistoryRow } from "@/features/reporting/metric-detail-history";
import {
  strategicHistoryPeriodLabel,
  strategicHistoryPeriodRank,
} from "./strategic-history-model";

export function StrategicKpiProgressPanel({
  kpi,
  history = [],
}: {
  kpi: StrategicBoardKpiViewModel;
  history?: MetricDetailStrategicHistoryRow[];
}) {
  const unresolved = kpi.unresolvedReasons.length > 0 ||
    kpi.configurationStatus === "needs_definition" ||
    kpi.configurationStatus === "needs_target";

  return (
    <section aria-labelledby="strategic-kpi-progress-title" className="mb-8">
      <Card as="section" variant="elevated" className="p-5 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-eyebrow">Strategic-plan measurement</p>
            <h2 id="strategic-kpi-progress-title" className="section-title">
              Current result and target
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">
              {label(kpi.measurementType)}
            </Badge>
            <Badge variant={unresolved ? "warning" : "success"}>
              {label(kpi.configurationStatus)}
            </Badge>
            <Badge variant="default">{label(kpi.boardStatus)}</Badge>
          </div>
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Definition label="Calculated result" value={kpi.result.displayValue} />
          <Definition label="Reporting frequency" value={label(kpi.reportingFrequency)} />
          <Definition label="Unit" value={kpi.unit ?? "Not set"} />
          <Definition label="Formula" value={kpi.result.formulaExplanation ?? "See calculation documentation."} />
        </dl>

        <RawInputs kpi={kpi} />

        {unresolved ? (
          <div
            className="mt-5 rounded-lg bg-accent-100 px-4 py-3 text-sm leading-6 text-ink-900"
            role="status"
          >
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="size-4" aria-hidden />
              Configuration needs attention
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {(kpi.unresolvedReasons.length > 0
                ? kpi.unresolvedReasons
                : [`Configuration status is ${label(kpi.configurationStatus)}.`]
              ).map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          </div>
        ) : (
          <p className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-success-text)]">
            <CheckCircle2 className="size-4" aria-hidden />
            Measurement and target configuration are ready for reporting.
          </p>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {kpi.annualProgress ? (
          <ProgressToTarget
            eyebrow="Selected-year performance"
            model={progressModel(kpi, kpi.annualProgress, "Annual progress")}
          />
        ) : null}
        {kpi.fullPlanProgress ? (
          <ProgressToTarget
            eyebrow="2025–2029 plan progress"
            model={progressModel(kpi, kpi.fullPlanProgress, "Full-plan progress")}
          />
        ) : null}
      </div>

      {history.length > 0 ? (
        <StrategicActualHistory kpi={kpi} history={history} />
      ) : null}
      {kpi.components.length > 0 ? <ComponentTable kpi={kpi} /> : null}
      {kpi.demographics ? <DemographicTable kpi={kpi} /> : null}
      {kpi.revenueBreakdown ? <RevenueTable kpi={kpi} /> : null}
    </section>
  );
}

function StrategicActualHistory({
  kpi,
  history,
}: {
  kpi: StrategicBoardKpiViewModel;
  history: MetricDetailStrategicHistoryRow[];
}) {
  const rows = [...history].sort(
    (left, right) =>
      right.year - left.year ||
      strategicHistoryPeriodRank(right.periodType) - strategicHistoryPeriodRank(left.periodType) ||
      right.periodIndex - left.periodIndex,
  );
  return (
    <Card as="section" className="mt-4 overflow-hidden" data-pdf-keep-together>
      <div className="border-b border-ink-100 p-5">
        <p className="section-eyebrow">Strategic result history</p>
        <h3 className="text-xl font-semibold text-ink-900">
          Calculated and retained results
        </h3>
        <p className="mt-1 text-sm leading-6 text-ink-600">
          {historyDescription(history)}
        </p>
      </div>
      <Table aria-label={`${kpi.name} strategic observation history`}>
        <thead>
          <tr>
            <th>Reporting period</th>
            <th>Calculated result</th>
            <th>Raw basis</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((actual) => (
            <tr key={`${actual.year}-${actual.periodType}-${actual.periodIndex}`}>
              <td className="font-semibold text-ink-900">
                {strategicHistoryPeriodLabel(actual)}
              </td>
              <td>{historyResultLabel(actual, kpi.unit)}</td>
              <td>{historyRawBasis(actual)}</td>
              <td>
                <Badge
                  variant={
                    actual.calculation.state === "ok"
                      ? "success"
                      : actual.calculation.state === "invalid"
                        ? "error"
                        : "warning"
                  }
                >
                  {label(actual.calculation.state)}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function historyResultLabel(
  actual: MetricDetailStrategicHistoryRow,
  unit: string | null,
): string {
  if (actual.calculation.value !== null) {
    const value = finiteLabel(actual.calculation.value);
    if (actual.calculation.measurementType === "binary") {
      return actual.calculation.value >= 1 ? "Complete" : "Not complete";
    }
    if (actual.calculation.measurementType === "year_over_year") {
      return `${actual.calculation.value > 0 ? "+" : ""}${value}%`;
    }
    if (unit?.trim() === "%") return `${value}%`;
    return unit ? `${value} ${unit}` : value;
  }
  if (actual.calculation.distribution) {
    return `${actual.calculation.distribution.respondentTotal} respondents`;
  }
  if (actual.calculation.components) {
    return `${actual.calculation.components.length} component results`;
  }
  return "Not reported";
}

function historyRawBasis(actual: MetricDetailStrategicHistoryRow): string {
  const { calculation } = actual;
  if (actual.historySource === "legacy_retained") {
    return calculation.calculationProvenance === "legacy_direct_percentage"
      ? "Retained compatibility percentage"
      : "Retained compatibility value";
  }
  if (
    calculation.measurementType === "year_over_year" &&
    calculation.numerator !== null &&
    calculation.denominator !== null
  ) {
    return `${finiteLabel(calculation.denominator + calculation.numerator)} current / ${finiteLabel(calculation.denominator)} prior`;
  }
  if (calculation.numerator !== null || calculation.denominator !== null) {
    return `${finiteLabel(calculation.numerator)} / ${finiteLabel(calculation.denominator)}`;
  }
  if (calculation.respondentCount !== null) {
    return `${finiteLabel(calculation.respondentCount)} respondents`;
  }
  if (calculation.components) return "Component observations";
  return "Retained scalar input";
}

function historyDescription(history: MetricDetailStrategicHistoryRow[]): string {
  const hasRecalculatedLegacy = history.some(
    (actual) => actual.historySource === "legacy_recalculated",
  );
  const hasRetainedLegacy = history.some(
    (actual) => actual.historySource === "legacy_retained",
  );
  if (hasRecalculatedLegacy && hasRetainedLegacy) {
    return "Calculated results use retained raw inputs where available; compatibility values are labeled when the original formula inputs are unavailable.";
  }
  if (hasRecalculatedLegacy) {
    return "Calculated results use the retained current and prior raw inputs for each reporting period.";
  }
  if (hasRetainedLegacy) {
    return "These compatibility values are retained from legacy annual reporting; the original formula inputs are unavailable.";
  }
  return "Results are recalculated from retained first-class raw inputs for each reporting period.";
}

function RawInputs({ kpi }: { kpi: StrategicBoardKpiViewModel }) {
  const rows = [
    ["Numerator", finiteLabel(kpi.result.numerator)],
    ["Denominator", finiteLabel(kpi.result.denominator)],
    ["Respondents", finiteLabel(kpi.result.respondentCount)],
  ].filter(([, value]) => value !== "Not reported");
  if (rows.length === 0) return null;
  return (
    <div className="mt-5">
      <p className="section-eyebrow">Raw calculation inputs</p>
      <dl className="mt-2 grid gap-3 sm:grid-cols-3">
        {rows.map(([name, value]) => (
          <Definition key={name} label={name} value={value} />
        ))}
      </dl>
    </div>
  );
}

function ComponentTable({ kpi }: { kpi: StrategicBoardKpiViewModel }) {
  return (
    <Card as="section" className="mt-4 overflow-hidden p-5" data-pdf-keep-together>
      <p className="section-eyebrow">KPI components</p>
      <h3 className="text-xl font-semibold text-ink-900">Component results</h3>
      <div className="mt-4">
        <Table aria-label={`${kpi.name} component results`}>
          <thead>
            <tr><th>Component</th><th>Type</th><th>Result</th><th>Target</th><th>Status</th></tr>
          </thead>
          <tbody>
            {kpi.components.map((component) => (
              <tr key={component.id}>
                <td className="font-semibold text-ink-900">{component.label}</td>
                <td>{label(component.measurementType)}</td>
                <td>{component.result.displayValue}</td>
                <td>{component.progress?.targetDisplayText ?? "Target not finalized"}</td>
                <td>{label(component.configurationStatus)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Card>
  );
}

function DemographicTable({ kpi }: { kpi: StrategicBoardKpiViewModel }) {
  const distribution = kpi.demographics!;
  return (
    <Card as="section" className="mt-4 overflow-hidden p-5" data-pdf-keep-together>
      <p className="section-eyebrow">Demographic distribution</p>
      <h3 className="text-xl font-semibold text-ink-900">
        {distribution.respondentTotal ?? "Unreported"} respondents
      </h3>
      <p className="mt-2 text-sm leading-6 text-ink-600">
        {distribution.populationCaveat ?? "This distribution describes the configured respondent population."}
      </p>
      {distribution.derivedNonWhitePercentage !== null ? (
        <p className="mt-2 text-sm font-semibold text-ink-900">
          Derived non-white respondent share: {distribution.derivedNonWhitePercentage}%
        </p>
      ) : null}
      {distribution.bands.length > 0 ? (
        <ul
          className="mt-4 grid gap-3"
          aria-label={`${kpi.name} demographic distribution chart`}
        >
          {distribution.bands.map((band) => (
            <li key={band.id} className="grid gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold text-ink-900">{band.label}</span>
                <span className="tabular text-ink-600">
                  {band.percentage === null ? "Not reported" : `${band.percentage}%`}
                </span>
              </div>
              {band.percentage === null ? (
                <div
                  className="h-2 rounded-full bg-ink-100"
                  role="status"
                  aria-label={`${band.label}: not reported`}
                />
              ) : (
                <Progress
                  value={band.percentage}
                  className="h-2"
                  aria-label={`${band.label}: ${band.percentage}% of respondents`}
                  aria-valuetext={`${band.label}: ${band.percentage}% of respondents`}
                />
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4">
        <Table aria-label={`${kpi.name} demographic distribution`}>
          <thead><tr><th>Category</th><th>Count</th><th>Percentage</th></tr></thead>
          <tbody>
            {distribution.bands.length > 0 ? distribution.bands.map((band) => (
              <tr key={band.id}>
                <td className="font-semibold text-ink-900">{band.label}</td>
                <td>{finiteLabel(band.count)}</td>
                <td>{band.percentage === null ? "Not reported" : `${band.percentage}%`}</td>
              </tr>
            )) : (
              <tr><td colSpan={3}>Category bands are not yet configured.</td></tr>
            )}
          </tbody>
        </Table>
      </div>
    </Card>
  );
}

function RevenueTable({ kpi }: { kpi: StrategicBoardKpiViewModel }) {
  const revenue = kpi.revenueBreakdown!;
  return (
    <Card as="section" className="mt-4 overflow-hidden p-5" data-pdf-keep-together>
      <p className="section-eyebrow">Revenue composition</p>
      <h3 className="text-xl font-semibold text-ink-900">Revenue by stream</h3>
      <div className="mt-4">
        <Table aria-label={`${kpi.name} revenue streams`}>
          <thead><tr><th>Stream</th><th>Value</th><th>Share</th></tr></thead>
          <tbody>
            {revenue.streams.map((stream) => (
              <tr key={stream.id}>
                <td className="font-semibold text-ink-900">{stream.label}</td>
                <td>{finiteLabel(stream.value)}</td>
                <td>{stream.sharePercentage === null ? "Not reported" : `${stream.sharePercentage}%`}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Card>
  );
}

function Definition({ label: term, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-ink-50 px-4 py-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">{term}</dt>
      <dd className="mt-1 break-words text-sm font-semibold leading-5 text-ink-900">{value}</dd>
    </div>
  );
}

function progressModel(
  kpi: StrategicBoardKpiViewModel,
  progress: TargetProgressViewModel,
  scope: string,
): ProgressToTargetViewModel {
  return {
    status: progressStatus(progress.status),
    currentAmount: progress.actualValue,
    targetAmount: progress.targetValue,
    actualProgressPercentage: progress.actualProgressPercentage,
    displayProgressPercentage: progress.displayProgressPercentage,
    unit: kpi.unit,
    targetYear: progress.targetYear,
    targetDescription: progress.targetDescription,
    pacingStatus:
      progress.pacingStatus === null
        ? "Not assessed"
        : progress.pacingTarget === null
          ? label(progress.pacingStatus)
          : `${label(progress.pacingStatus)} against ${finiteLabel(progress.pacingTarget)} year to date`,
    boardStatus: label(kpi.boardStatus),
    accessibleLabel: `${scope} for ${kpi.name}`,
  };
}

function progressStatus(status: TargetProgressViewModel["status"]): ProgressToTargetViewModel["status"] {
  if (status === "complete" || status === "exceeded" || status === "not_started" || status === "target_not_finalized" || status === "needs_definition") return status;
  if (status === "not_reported") return "not_started";
  if (status === "not_applicable") return "needs_definition";
  return "in_progress";
}

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function finiteLabel(value: number | null): string {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)
    : "Not reported";
}
