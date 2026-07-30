"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Alert,
  ChartContainer,
  EmptyState,
  ExportCSVButton,
  FormField,
  Select,
  Table,
} from "@/components/ui";
import type { StrategicTrendReportData } from "@/features/reporting/types";

const RESTORED_HIDDEN_DATA_WARNING =
  "Data changed while this measure was archived; review the restored values.";

/** Retrieves strategic trend selection. */
export function resolveStrategicTrendSelection(
  series: Array<{
    kpiId: number;
    points: Array<{ value: number | null }>;
  }>,
  selectedId: number,
): number {
  if (series.some((item) => item.kpiId === selectedId)) return selectedId;
  return series.find((item) =>
    item.points.some((point) => point.value !== null),
  )?.kpiId ?? series[0]?.kpiId ?? 0;
}

/** Builds a trend CSV with the same lifecycle disclosures as the visible report. */
export function buildStrategicTrendCsvRows(
  data: StrategicTrendReportData,
  selected: StrategicTrendReportData["series"][number] | null,
  reportingPeriod: string,
): Array<Record<string, string | number | null>> {
  const excluded = data.excludedMeasures
    .map((measure) => `${measure.priorityName}: ${measure.kpiName}`)
    .join("; ");
  const lifecycleWarning = selected?.restoredWithHiddenData
    ? RESTORED_HIDDEN_DATA_WARNING
    : "";
  if (!selected) {
    return excluded
      ? [{
          "Measure ID": null,
          Measure: null,
          "Strategic Priority": null,
          "Reporting Year": null,
          "Reporting Period": reportingPeriod,
          Value: null,
          Unit: null,
          "Lifecycle warning": "",
          "Archived measures excluded": excluded,
        }]
      : [];
  }
  return selected.points.map((point) => ({
    "Measure ID": selected.kpiId,
    Measure: selected.kpiName,
    "Strategic Priority": selected.priorityName,
    "Reporting Year": point.year,
    "Reporting Period": reportingPeriod,
    Value: point.value,
    Unit: selected.unit,
    "Lifecycle warning": lifecycleWarning,
    "Archived measures excluded": excluded,
  }));
}

/** Renders the strategic trends view interface. */
export function StrategicTrendsView({
  data,
  reportingPeriod,
}: {
  data: StrategicTrendReportData;
  reportingPeriod: string;
}) {
  const [selectedId, setSelectedId] = useState(
    resolveStrategicTrendSelection(data.series, 0),
  );
  const resolvedSelectedId = resolveStrategicTrendSelection(
    data.series,
    selectedId,
  );
  useEffect(() => {
    if (resolvedSelectedId !== selectedId) {
      setSelectedId(resolvedSelectedId);
    }
  }, [resolvedSelectedId, selectedId]);
  const selected = data.series.find(
    (item) => item.kpiId === resolvedSelectedId,
  ) ?? null;
  const csvRows = useMemo(
    () => buildStrategicTrendCsvRows(data, selected, reportingPeriod),
    [data, reportingPeriod, selected],
  );

  return (
    <div>
      {data.excludedMeasures.length > 0 ? (
        <Alert className="mb-5">
          <p className="font-semibold">Archived measures excluded from Trends</p>
          <p className="mt-1">
            These archived measures are kept for historical reference, but
            their results are not shown in Trends:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {data.excludedMeasures.map((measure) => (
              <li key={measure.kpiId}>
                {measure.priorityName}: {measure.kpiName}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <FormField label="Measure" htmlFor="trend-measure" className="w-full max-w-xl">
          <Select
            id="trend-measure"
            value={resolvedSelectedId}
            onChange={(event) => setSelectedId(Number(event.target.value))}
          >
            {data.series.map((item) => (
              <option key={item.kpiId} value={item.kpiId}>{item.kpiName}</option>
            ))}
          </Select>
        </FormField>
        <ExportCSVButton
          rows={csvRows}
          filename={`${data.organizationSlug}-trend-${selected?.kpiId ?? "report"}.csv`}
        />
      </div>

      {selected?.restoredWithHiddenData ? (
        <Alert className="mb-5">
          <p className="font-semibold">Review restored measure data</p>
          <p className="mt-1">{RESTORED_HIDDEN_DATA_WARNING}</p>
        </Alert>
      ) : null}

      {selected ? (
        <ChartContainer
          title={selected.kpiName}
          subtitle={`${selected.priorityName} · ${reportingPeriod} · ${selected.unit ?? "Value"}`}
        >
          {selected.points.some((point) => point.value !== null) ? (
            <>
              <div className="h-96 tabular-nums" aria-label={`${selected.kpiName} trend chart`}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    accessibilityLayer={false}
                    data={selected.points}
                    margin={{ top: 12, right: 18, bottom: 8, left: 8 }}
                  >
                    <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="year" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Line dataKey="value" name={selected.unit ?? "Value"} stroke="var(--chart-primary)" strokeWidth={2.5} connectNulls={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <Table minWidth="420px">
                <thead><tr><th>Reporting year</th><th>Value</th></tr></thead>
                <tbody>
                  {selected.points.map((point) => (
                    <tr key={point.year}>
                      <td className="tabular-nums">{point.year}</td>
                      <td className="tabular-nums">{point.value ?? "Not reported"}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          ) : (
            <EmptyState title="No results reported" description="This measure has no saved results for the selected years." />
          )}
        </ChartContainer>
      ) : (
        <EmptyState title="No measures available" description="Finish setting up a measure before opening Trends." />
      )}
    </div>
  );
}
