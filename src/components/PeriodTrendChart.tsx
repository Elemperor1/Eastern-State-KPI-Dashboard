"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBoardReportMetricValue } from "./strategic-board-report-presentation";
import type { PeriodTrendSeries } from "@/features/reporting/period-trend";

/**
 * Prior reporting years, most recent first. The selected year always draws in
 * `--chart-primary`, so these only ever back it up.
 */
const HISTORY_STROKES = [
  "var(--chart-history-1)",
  "var(--chart-history-2)",
  "var(--chart-history-3)",
];

/** Stroke for one year line, given its position in the oldest-first series. */
function strokeForYear(index: number, total: number): string {
  const yearsBack = total - 1 - index;
  if (yearsBack === 0) return "var(--chart-primary)";
  return HISTORY_STROKES[(yearsBack - 1) % HISTORY_STROKES.length]!;
}

/**
 * Plot a measure's within-year results, one line per reporting year.
 *
 * The metric page lists the same results underneath, so this chart is the
 * visual reading of a table that is already present rather than the only
 * record of the data.
 */
export function PeriodTrendChart({
  series,
  unit,
  measureName,
}: {
  series: PeriodTrendSeries;
  unit: string | null;
  measureName: string;
}) {
  const granularityLabel =
    series.granularity === "monthly" ? "monthly" : "quarterly";

  return (
    <div
      className="h-80 tabular-nums"
      aria-label={`${measureName} ${granularityLabel} results by reporting year`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          accessibilityLayer={false}
          data={series.points}
          margin={{ top: 12, right: 18, bottom: 8, left: 8 }}
        >
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            tickFormatter={(label: string) =>
              series.granularity === "monthly" ? label.slice(0, 3) : label
            }
          />
          <YAxis tickLine={false} axisLine={false} width={72} />
          <Tooltip
            formatter={(value, name) => [
              // Recharts widens tooltip values to string | number | array, so a
              // non-finite reading degrades to the "Not reported" wording rather
              // than rendering NaN.
              formatBoardReportMetricValue(
                Number.isFinite(Number(value)) ? Number(value) : null,
                unit,
              ),
              name,
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
          {series.years.map((year, index) => (
            <Line
              key={year}
              dataKey={String(year)}
              name={String(year)}
              stroke={strokeForYear(index, series.years.length)}
              strokeWidth={index === series.years.length - 1 ? 2.5 : 1.75}
              dot={{ r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
