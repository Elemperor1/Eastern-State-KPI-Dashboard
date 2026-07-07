"use client";

import { useMemo } from "react";
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
import { MONTH_LABELS, formatValue } from "@/lib/analytics";
import type { BreakdownEntryWithMeta, KPIWithCategory } from "@/lib/types";

interface Props {
  kpi: KPIWithCategory;
  /** All breakdown rows for this KPI, pre-filtered by kpi_id. */
  data: BreakdownEntryWithMeta[];
  currentYear: number;
  compareYear: number;
  currentMonth: number;
}

interface MonthlyRow {
  month: number;
  current: { referred: number; donors: number };
  compare: { referred: number; donors: number };
}

export function DonorConversionCard({
  kpi,
  data,
  currentYear,
  compareYear,
  currentMonth,
}: Props) {
  const monthsToShow = currentMonth;

  const monthlyRows: MonthlyRow[] = useMemo(() => {
    const rows: MonthlyRow[] = [];
    for (let m = 1; m <= monthsToShow; m++) {
      const curReferred =
        data.find(
          (b) =>
            b.year === currentYear &&
            b.month === m &&
            b.label === "Referred",
        )?.value ?? 0;
      const curDonors =
        data.find(
          (b) =>
            b.year === currentYear &&
            b.month === m &&
            b.label === "Donors",
        )?.value ?? 0;
      const cmpReferred =
        data.find(
          (b) =>
            b.year === compareYear &&
            b.month === m &&
            b.label === "Referred",
        )?.value ?? 0;
      const cmpDonors =
        data.find(
          (b) =>
            b.year === compareYear &&
            b.month === m &&
            b.label === "Donors",
        )?.value ?? 0;
      rows.push({
        month: m,
        current: { referred: curReferred, donors: curDonors },
        compare: { referred: cmpReferred, donors: cmpDonors },
      });
    }
    return rows;
  }, [data, currentYear, compareYear, monthsToShow]);

  // Aggregate totals
  const curTotalReferred = monthlyRows.reduce(
    (s, r) => s + r.current.referred,
    0,
  );
  const curTotalDonors = monthlyRows.reduce((s, r) => s + r.current.donors, 0);
  const curTotalPctNum =
    curTotalReferred > 0 ? (curTotalDonors / curTotalReferred) * 100 : null;
  const curTotalPct =
    curTotalPctNum !== null ? curTotalPctNum.toFixed(1) : "—";
  const cmpTotalReferred = monthlyRows.reduce(
    (s, r) => s + r.compare.referred,
    0,
  );
  const cmpTotalDonors = monthlyRows.reduce((s, r) => s + r.compare.donors, 0);
  const cmpTotalPctNum =
    cmpTotalReferred > 0 ? (cmpTotalDonors / cmpTotalReferred) * 100 : null;
  const cmpTotalPct =
    cmpTotalPctNum !== null ? cmpTotalPctNum.toFixed(1) : "—";
  const ppChange =
    curTotalPctNum !== null && cmpTotalPctNum !== null
      ? curTotalPctNum - cmpTotalPctNum
      : null;

  const showCompare = data.some((b) => b.year === compareYear);

  // Chart data — conversion rate per month for current year
  const chartData = monthlyRows.map((r) => ({
    month: MONTH_LABELS[r.month - 1],
    [`${currentYear}`]:
      r.current.referred > 0
        ? Number(((r.current.donors / r.current.referred) * 100).toFixed(1))
        : 0,
    ...(showCompare
      ? {
          [`${compareYear}`]:
            r.compare.referred > 0
              ? Number(
                  ((r.compare.donors / r.compare.referred) * 100).toFixed(1),
                )
              : 0,
        }
      : {}),
  }));

  return (
    <div>
      <div className="mb-5">
        <p className="section-eyebrow">Donor conversion</p>
        <h2 className="text-xl font-semibold text-ink-900">{kpi.name}</h2>
        <p className="mt-1 text-sm text-ink-600 text-pretty">
          Monthly referral and donor conversion data · {currentYear}
          {showCompare ? ` vs ${compareYear}` : ""}
        </p>
      </div>

      {/* Summary stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-lg border border-ink-200 bg-ink-50/50 p-4">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            Referred ({currentYear})
          </p>
          <p className="text-2xl font-medium tabular text-ink-900">
            {curTotalReferred}
          </p>
          <p className="text-xs text-ink-500">YTD total</p>
        </div>
        <div className="rounded-lg border border-ink-200 bg-ink-50/50 p-4">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            Donors ({currentYear})
          </p>
          <p className="text-2xl font-medium tabular text-ink-900">
            {curTotalDonors}
          </p>
          <p className="text-xs text-ink-500">YTD donors from referrals</p>
        </div>
        <div className="rounded-lg border border-ink-200 bg-ink-50/50 p-4">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            Conversion rate ({currentYear})
          </p>
          <p className="text-2xl font-medium tabular text-[var(--color-success-text)]">
            {curTotalPct}%
          </p>
          <p className="text-xs text-ink-500">
            {curTotalDonors}/{curTotalReferred} YTD
          </p>
        </div>
        {showCompare ? (
          <div className="rounded-lg border border-ink-200 bg-ink-50/50 p-4">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              Conversion rate ({compareYear})
            </p>
            <p className="text-2xl font-medium tabular text-ink-900">
              {cmpTotalPct}%
            </p>
            <p className="text-xs text-ink-500">
              {cmpTotalDonors}/{cmpTotalReferred} same period
            </p>
          </div>
        ) : null}
        {showCompare ? (
          <div className="rounded-lg border border-ink-200 bg-ink-50/50 p-4">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              Change (pp)
            </p>
            <p
              className={`text-2xl font-medium tabular ${ppChange === null ? "text-ink-900" : ppChange >= 0 ? "text-[var(--color-success-text)]" : "text-[var(--color-danger-text)]"}`}
            >
              {ppChange === null
                ? "—"
                : `${ppChange > 0 ? "+" : ""}${ppChange.toFixed(1)} pts`}
            </p>
            <p className="text-xs text-ink-500">
              {currentYear} vs {compareYear}
            </p>
          </div>
        ) : null}
      </div>

      {/* Conversion rate trend chart */}
      <div className="mb-6 h-64">
        <p className="mb-3 text-sm font-semibold text-ink-700">
          Monthly conversion rate %
        </p>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
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
            {showCompare ? (
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

      {/* Referred vs Donors bar chart */}
      <div className="mb-6 h-64">
        <p className="mb-3 text-sm font-semibold text-ink-700">
          Referred vs donors · {currentYear}
        </p>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={monthlyRows.map((r) => ({
              month: MONTH_LABELS[r.month - 1],
              Referred: r.current.referred,
              Donors: r.current.donors,
            }))}
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

      {/* Monthly table */}
      <Table minWidth="640px">
        <thead>
          <tr>
            <th className="text-left" scope="col">
              Month
            </th>
            <th className="text-right" scope="col">
              Referred ({currentYear})
            </th>
            <th className="text-right" scope="col">
              Donors ({currentYear})
            </th>
            <th className="text-right" scope="col">
              Conversion %
            </th>
            {showCompare ? (
              <>
                <th className="text-right" scope="col">
                  Referred ({compareYear})
                </th>
                <th className="text-right" scope="col">
                  Donors ({compareYear})
                </th>
                <th className="text-right" scope="col">
                  Conversion %
                </th>
                <th className="text-right" scope="col">
                  Change (pp)
                </th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {monthlyRows.map((r) => {
            const curPct =
              r.current.referred > 0
                ? (
                    (r.current.donors / r.current.referred) *
                    100
                  ).toFixed(1)
                : "—";
            const cmpPct =
              r.compare.referred > 0
                ? (
                    (r.compare.donors / r.compare.referred) *
                    100
                  ).toFixed(1)
                : "—";
            return (
              <tr
                key={r.month}
                className="transition-colors hover:bg-ink-50/70"
              >
                <td className="font-medium text-ink-900">
                  {MONTH_LABELS[r.month - 1]}
                </td>
                <td className="tabular text-ink-900 font-medium text-right">
                  {r.current.referred || "—"}
                </td>
                <td className="tabular text-ink-900 font-medium text-right">
                  {r.current.donors || "—"}
                </td>
                <td className="tabular text-ink-900 font-medium text-right">
                  {curPct}%
                </td>
                {showCompare ? (
                  <>
                    <td className="tabular text-ink-600 text-right">
                      {r.compare.referred || "—"}
                    </td>
                    <td className="tabular text-ink-600 text-right">
                      {r.compare.donors || "—"}
                    </td>
                    <td className="tabular text-ink-600 text-right">
                      {cmpPct}%
                    </td>
                    <td className="tabular text-right font-medium">
                      {curPct !== "—" && cmpPct !== "—"
                        ? (() => {
                            const d =
                              Number(curPct) - Number(cmpPct);
                            return (
                              <span
                                className={
                                  d >= 0
                                    ? "text-[var(--color-success-text)]"
                                    : "text-[var(--color-danger-text)]"
                                }
                              >
                                {d > 0 ? "+" : ""}
                                {d.toFixed(1)}
                              </span>
                            );
                          })()
                        : "—"}
                    </td>
                  </>
                ) : null}
              </tr>
            );
          })}
          {/* Yearend total row */}
          <tr className="border-t-2 border-ink-300 bg-ink-50/50 font-semibold">
            <td className="text-ink-900">YTD total</td>
            <td className="tabular text-ink-900 text-right">
              {curTotalReferred}
            </td>
            <td className="tabular text-ink-900 text-right">
              {curTotalDonors}
            </td>
            <td className="tabular text-ink-900 text-right">{curTotalPct}%</td>
            {showCompare ? (
              <>
                <td className="tabular text-ink-600 text-right">
                  {cmpTotalReferred}
                </td>
                <td className="tabular text-ink-600 text-right">
                  {cmpTotalDonors}
                </td>
                <td className="tabular text-ink-600 text-right">
                  {cmpTotalPct}%
                </td>
                <td
                  className={`tabular text-right ${ppChange === null ? "text-ink-900" : ppChange >= 0 ? "text-[var(--color-success-text)]" : "text-[var(--color-danger-text)]"}`}
                >
                  {ppChange === null
                    ? "—"
                    : `${ppChange > 0 ? "+" : ""}${ppChange.toFixed(1)} pts`}
                </td>
              </>
            ) : null}
          </tr>
        </tbody>
      </Table>
    </div>
  );
}
