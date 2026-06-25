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
import type { BreakdownEntryWithMeta, KPIWithCategory } from "@/lib/types";

interface Props {
  kpi: KPIWithCategory;
  breakdowns: BreakdownEntryWithMeta[];
  currentYear: number;
  compareYear: number;
}

export function BreakdownChart({ kpi, breakdowns, currentYear, compareYear }: Props) {
  const labels = Array.from(new Set(breakdowns.map((b) => b.label))).sort(
    (a, b) =>
      (breakdowns.find((d) => d.label === a)?.sort_order ?? 0) -
      (breakdowns.find((d) => d.label === b)?.sort_order ?? 0),
  );

  const data = labels.map((label) => {
    const cur = breakdowns.find((d) => d.label === label && d.year === currentYear);
    const cmp = breakdowns.find((d) => d.label === label && d.year === compareYear);
    return {
      label,
      [currentYear]: cur?.value ?? 0,
      [compareYear]: cmp?.value ?? 0,
    };
  });

  const totalCurrent = data.reduce((s, d) => s + (d[currentYear] as number), 0);
  const totalCompare = data.reduce((s, d) => s + (d[compareYear] as number), 0);
  const pctChange = totalCompare !== 0 ? ((totalCurrent - totalCompare) / totalCompare) * 100 : null;
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

      <div style={{ height: Math.max(280, data.length * 48) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
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
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey={String(compareYear)} fill="var(--chart-violet-mid)" radius={[0, 4, 4, 0]} maxBarSize={16} />
            <Bar dataKey={String(currentYear)} fill="var(--chart-primary)" radius={[0, 4, 4, 0]} maxBarSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6">
        <Table minWidth="480px">
          <thead>
            <tr>
              <th className="text-left" scope="col">Component</th>
              <th className="text-right" scope="col">{compareYear}</th>
              <th className="text-right" scope="col">{currentYear}</th>
              <th className="text-right" scope="col">Change</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => {
              const c = d[currentYear] as number;
              const p = d[compareYear] as number;
              const change = c - p;
              return (
                <tr key={d.label} className="transition-colors hover:bg-ink-50/70">
                  <td className="font-medium text-ink-900">{d.label}</td>
                  <td className="tabular text-ink-600">{formatValue(p, fmt)}</td>
                  <td className="tabular text-ink-900 font-medium">{formatValue(c, fmt)}</td>
                  <td
                    className={`tabular font-medium ${
                      change > 0
                        ? "text-[var(--color-success-text)]"
                        : change < 0
                          ? "text-[var(--color-danger-text)]"
                          : "text-ink-500"
                    }`}
                  >
                    {change > 0 ? "+" : ""}
                    {formatValue(change, fmt, { signed: true })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
