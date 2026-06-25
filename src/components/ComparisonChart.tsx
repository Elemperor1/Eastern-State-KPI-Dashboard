"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS, formatValue, MONTH_FULL } from "@/lib/analytics";
import type { KPIAnalytics } from "@/lib/types";

interface Props {
  analyticsList: KPIAnalytics[];
}

export function ComparisonChart({ analyticsList }: Props) {
  if (analyticsList.length === 0) {
    return <p className="text-sm text-ink-500">No data to display.</p>;
  }
  const kpi = analyticsList[0].kpi;
  const month = analyticsList[0].monthlyComparison.currentMonth;
  const currentYear = analyticsList[0].monthlyComparison.currentYear;
  const compareYear = analyticsList[0].monthlyComparison.compareYear;

  const data = analyticsList.map((a, idx) => ({
    name: a.kpi.name,
    [compareYear]: a.monthlyComparison.compareValue,
    [currentYear]: a.monthlyComparison.currentValue,
    pct: a.monthlyComparison.pctChange ?? 0,
    color: CHART_COLORS[idx % CHART_COLORS.length],
  }));

  return (
    <div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-500 font-semibold">
            Monthly Comparison
          </p>
          <p className="text-sm text-ink-700 mt-1">
            {MONTH_FULL[month - 1]} {currentYear} <span className="text-ink-400 mx-1">vs</span>{" "}
            {MONTH_FULL[month - 1]} {compareYear}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-ink-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#94a3b8" }} />
            {compareYear}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: CHART_COLORS[0] }}
            />
            {currentYear}
          </span>
        </div>
      </div>
      <div className="h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={12} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "#475569" }}
              interval={0}
              angle={data.length > 3 ? -10 : 0}
              textAnchor={data.length > 3 ? "end" : "middle"}
              height={data.length > 3 ? 60 : 30}
            />
            <YAxis
              tickFormatter={(v) => formatValue(Number(v), kpi.format, { compact: true })}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "#475569" }}
              width={70}
            />
            <Tooltip
              cursor={{ fill: "rgba(15,23,42,0.04)" }}
              formatter={(value: number | string, name: string) => [
                formatValue(Number(value), kpi.format),
                name,
              ]}
            />
            <Bar dataKey={String(compareYear)} fill="#94a3b8" radius={[6, 6, 0, 0]} maxBarSize={48} />
            <Bar dataKey={String(currentYear)} radius={[6, 6, 0, 0]} maxBarSize={48}>
              {data.map((entry, idx) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
