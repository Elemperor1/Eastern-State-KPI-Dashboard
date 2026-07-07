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

// Historic year series cycle through the teal/navy family so the chart
// stays inside the brand palette. Order is "deeper → softer" so older
// years read as a fade rather than a hue shift.
const HISTORIC_COLORS = [
  "var(--chart-ink-soft)",
  "var(--chart-brand-mid)",
  "var(--chart-secondary)",
  "var(--chart-brand-soft)",
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
            formatter={(value, name) => {
              if (value === null || value === undefined) return ["—", name];
              const formatted = formatValue(Number(value), unitType);
              const label = unit ? `${formatted} ${unit}` : formatted;
              return [label, name];
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
                stroke={isRecent ? "var(--chart-tertiary)" : HISTORIC_COLORS[idx % HISTORIC_COLORS.length]}
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
