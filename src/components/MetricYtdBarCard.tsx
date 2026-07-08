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
import { Card } from "@/components/ui";
import { formatValue } from "@/lib/analytics";
import type { UnitType } from "@/lib/types";

interface MetricYtdBarCardProps {
  eyebrow: string;
  title: string;
  data: Array<Record<string, string | number>>;
  currentYear: number;
  compareYear: number;
  unitType: UnitType;
  maxBarSize: number;
}

export function MetricYtdBarCard({
  eyebrow,
  title,
  data,
  currentYear,
  compareYear,
  unitType,
  maxBarSize,
}: MetricYtdBarCardProps) {
  return (
    <Card className="p-5 lg:p-6 mb-10">
      <div className="mb-5">
        <p className="section-eyebrow">{eyebrow}</p>
        <h2 className="section-title">{title}</h2>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--chart-axis)" }} />
            <YAxis
              tickFormatter={(v) => formatValue(Number(v), unitType, { compact: true })}
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              width={70}
            />
            <Tooltip formatter={(v: number) => formatValue(Number(v), unitType)} cursor={{ fill: "var(--chart-cursor)" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
            <Bar dataKey={String(compareYear)} fill="var(--chart-secondary)" radius={[6, 6, 0, 0]} maxBarSize={maxBarSize} />
            <Bar dataKey={String(currentYear)} fill="var(--chart-primary)" radius={[6, 6, 0, 0]} maxBarSize={maxBarSize} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
