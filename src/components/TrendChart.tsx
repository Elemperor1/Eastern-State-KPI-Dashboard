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
import { formatValue } from "@/lib/analytics";
import type { ComparisonPoint, UnitType } from "@/lib/types";

interface Props {
  data: ComparisonPoint[];
  years: number[];
  unitType: UnitType;
  unit?: string;
}

const HISTORIC_COLORS = [
  "var(--chart-ink-soft)",
  "var(--chart-violet-mid)",
  "var(--chart-violet)",
  "var(--chart-pink-soft)",
];

export function TrendChart({ data, years, unitType, unit }: Props) {
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--chart-axis)" }} />
          <YAxis
            tickFormatter={(v) => formatValue(Number(v), unitType, { compact: true })}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
            width={70}
          />
          <Tooltip
            formatter={(value) => {
              if (value === null || value === undefined) return ["—", ""];
              return [formatValue(Number(value), unitType), unit ?? ""];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
          {years.map((year, idx) => {
            const isRecent = idx === years.length - 1;
            return (
              <Line
                key={year}
                type="monotone"
                dataKey={String(year)}
                name={String(year)}
                stroke={isRecent ? "var(--chart-lime)" : HISTORIC_COLORS[idx % HISTORIC_COLORS.length]}
                strokeWidth={isRecent ? 3 : 1.75}
                strokeDasharray={isRecent ? undefined : "4 4"}
                dot={{ r: isRecent ? 4 : 3, strokeWidth: 0 }}
                activeDot={{ r: 6 }}
                connectNulls={false}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
