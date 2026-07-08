"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatValue } from "@/lib/analytics";
import type { DonorConversionModel } from "@/features/reporting/donor-conversion";

interface DonorConversionChartsProps {
  model: DonorConversionModel;
  currentYear: number;
  compareYear: number;
}

export function DonorConversionCharts({
  model,
  currentYear,
  compareYear,
}: DonorConversionChartsProps) {
  return (
    <>
      <div className="mb-6 h-64">
        <p className="mb-3 text-sm font-semibold text-ink-700">
          Monthly conversion rate %
        </p>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={model.conversionChartData}
            margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--chart-grid)"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
            />
            <YAxis
              domain={[0, "auto"]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              width={50}
            />
            <Tooltip
              formatter={(v: number) => `${v.toFixed(1)}%`}
              cursor={{ fill: "var(--chart-cursor)" }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
            {model.showCompare ? (
              <Bar
                dataKey={String(compareYear)}
                fill="var(--chart-secondary)"
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
            ) : null}
            <Bar
              dataKey={String(currentYear)}
              fill="var(--chart-primary)"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mb-6 h-64">
        <p className="mb-3 text-sm font-semibold text-ink-700">
          Referred vs donors · {currentYear}
        </p>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={model.volumeChartData}
            margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--chart-grid)"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              width={50}
            />
            <Tooltip
              formatter={(v: number) => formatValue(v, "count")}
              cursor={{ fill: "var(--chart-cursor)" }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
            <Bar
              dataKey="Referred"
              fill="var(--chart-primary)"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
            <Bar
              dataKey="Donors"
              fill="var(--chart-secondary)"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
