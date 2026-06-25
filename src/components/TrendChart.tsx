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
import { CHART_COLORS, formatValue, MONTH_LABELS } from "@/lib/analytics";
import type { ComparisonPoint } from "@/lib/types";

interface Props {
  data: ComparisonPoint[];
  years: number[];
  format?: "number" | "currency" | "percent";
  unit?: string;
}

export function TrendChart({ data, years, format = "number", unit = "" }: Props) {
  return (
    <div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-500 font-semibold">
            Trend
          </p>
          <p className="text-sm text-ink-700 mt-1">
            Monthly progression across {years.join(" and ")} {unit ? `(${unit})` : ""}
          </p>
        </div>
      </div>
      <div className="h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "#475569" }}
            />
            <YAxis
              tickFormatter={(v) => formatValue(Number(v), format, { compact: true })}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "#475569" }}
              width={70}
            />
            <Tooltip
              formatter={(value, name) => {
                if (value === null || value === undefined) return ["—", String(name ?? "")];
                return [formatValue(Number(value), format), String(name ?? "")];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: "#475569" }} iconType="circle" />
            {years.map((year, idx) => (
              <Line
                key={year}
                type="monotone"
                dataKey={String(year)}
                name={String(year)}
                stroke={idx === years.length - 1 ? CHART_COLORS[0] : "#94a3b8"}
                strokeWidth={idx === years.length - 1 ? 2.5 : 2}
                strokeDasharray={idx === years.length - 1 ? undefined : "4 4"}
                dot={{ r: idx === years.length - 1 ? 4 : 3, strokeWidth: 0 }}
                activeDot={{ r: 6 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-ink-400 mt-2 text-center">
        Solid line: most recent year · Dashed: comparison year
      </p>
    </div>
  );
}
