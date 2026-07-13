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
import { Table } from "@/components/ui";
import { formatValue } from "@/lib/analytics";
import { buildBreakdownComparisonModel } from "@/features/reporting/breakdown-comparison";
import type { BreakdownEntryWithMeta, KPIWithCategory } from "@/lib/types";

interface Props {
  kpi: KPIWithCategory;
  /** Caller-supplied, pre-filtered rows. The chart trusts this set as-is. */
  data: BreakdownEntryWithMeta[];
  currentYear: number;
  compareYear: number;
}

export function BreakdownChart({ kpi, data: breakdowns, currentYear, compareYear }: Props) {
  const model = buildBreakdownComparisonModel({ breakdowns, currentYear, compareYear });
  const { chartData, pctChange, rows, showCompare, totalCurrent } = model;
  const fmt = kpi.unit_type === "currency" ? "currency" : "number";

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <p className="section-eyebrow">
            Breakdown
          </p>
          <h2 className="text-xl font-semibold text-ink-900">{kpi.name}</h2>
          <p className="mt-1 text-sm text-ink-600 text-pretty">
            Component comparison · {currentYear} vs {compareYear}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">Total {currentYear}</p>
          <p className="mt-1 text-2xl font-medium tabular text-ink-900">
            {formatValue(totalCurrent, fmt)}
          </p>
          {pctChange !== null ? (
            <p
              className={`text-xs tabular font-medium ${
                pctChange > 0
                  ? "text-[var(--color-success-text)]"
                  : pctChange < 0
                    ? "text-[var(--color-danger-text)]"
                    : "text-ink-500"
              }`}
            >
              {pctChange > 0 ? "+" : ""}
              {pctChange.toFixed(1)}% vs {compareYear}
            </p>
          ) : null}
        </div>
      </div>

      <div style={{ height: Math.max(280, chartData.length * 48) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              tickLine={false}
              axisLine={false}
              width={142}
            />
            <Tooltip
              formatter={(v: number) => formatValue(v, fmt)}
              cursor={{ fill: "var(--chart-cursor)" }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
            {showCompare ? (
              <Bar dataKey={String(compareYear)} fill="var(--chart-secondary)" radius={[0, 4, 4, 0]} maxBarSize={16} />
            ) : null}
            <Bar dataKey={String(currentYear)} fill="var(--chart-primary)" radius={[0, 4, 4, 0]} maxBarSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6">
        <Table minWidth="480px">
          <thead>
            <tr>
              <th className="text-left" scope="col">Component</th>
              {showCompare ? <th className="text-right" scope="col">{compareYear}</th> : null}
              <th className="text-right" scope="col">{currentYear}</th>
              {showCompare ? <th className="text-right" scope="col">Change</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              return (
                <tr key={row.label} className="transition-colors hover:bg-ink-50/70">
                  <td className="font-medium text-ink-900">{row.label}</td>
                  {showCompare ? <td className="text-right tabular text-ink-600">{formatValue(row.compareValue, fmt)}</td> : null}
                  <td className="text-right tabular text-ink-900 font-medium">{formatValue(row.currentValue, fmt)}</td>
                  {showCompare ? (
                    <td
                      className={`text-right tabular font-medium ${
                        row.delta > 0
                          ? "text-[var(--color-success-text)]"
                          : row.delta < 0
                            ? "text-[var(--color-danger-text)]"
                            : "text-ink-500"
                      }`}
                    >
                      {formatValue(row.delta, fmt, { signed: true })}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
