"use client";

import { Card, Table } from "@/components/ui";
import { formatValue } from "@/lib/analytics";
import type { MetricValueRow } from "@/features/reporting/types";
import type { UnitType } from "@/lib/types";

interface MetricValuesTableProps {
  rows: MetricValueRow[];
  unitType: UnitType;
  currentYear: number;
  compareYear: number;
  isAnnual: boolean;
}

export function MetricValuesTable({
  rows,
  unitType,
  currentYear,
  compareYear,
  isAnnual,
}: MetricValuesTableProps) {
  return (
    <Card className="p-5 lg:p-6 mb-10">
      <div className="section-head">
        <p className="section-eyebrow">Values</p>
        <h2 className="section-title">
          {isAnnual ? "Annual values" : `Monthly values · ${currentYear}`}
        </h2>
      </div>
      <Table minWidth="520px">
        <thead>
          <tr>
            <th className="text-left" scope="col">Period</th>
            <th className="text-right" scope="col">Value</th>
            {!isAnnual ? <th className="text-right" scope="col">{compareYear}</th> : null}
            <th className="text-left" scope="col">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="transition-colors hover:bg-ink-50/70">
              <td className="font-medium text-ink-900">{row.period}</td>
              <td className="text-right tabular text-ink-900 font-medium">
                {row.value === undefined || row.value === null ? "—" : formatValue(Number(row.value), unitType)}
              </td>
              {!isAnnual ? (
                <td className="text-right tabular text-ink-500">
                  {row.compare === undefined || row.compare === null ? "—" : formatValue(Number(row.compare), unitType)}
                </td>
              ) : null}
              <td className="text-ink-500 text-xs">{row.notes ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
