import { Table } from "@/components/ui";
import type { DonorConversionModel } from "@/features/reporting/donor-conversion";

interface DonorConversionTableProps {
  model: DonorConversionModel;
  currentYear: number;
  compareYear: number;
}

export function DonorConversionTable({
  model,
  currentYear,
  compareYear,
}: DonorConversionTableProps) {
  const {
    monthlyRows,
    currentTotal,
    compareTotal,
    pointChange,
    showCompare,
  } = model;
  const curTotalPct = formatPct(currentTotal.conversionPct);
  const cmpTotalPct = formatPct(compareTotal.conversionPct);

  return (
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
        {monthlyRows.map((row) => (
          <MonthlyDonorConversionRow
            key={row.month}
            row={row}
            showCompare={showCompare}
          />
        ))}
        <tr className="border-t-2 border-ink-300 bg-ink-50/50 font-semibold">
          <td className="text-ink-900">YTD total</td>
          <td className="tabular text-ink-900 text-right">
            {currentTotal.referred}
          </td>
          <td className="tabular text-ink-900 text-right">
            {currentTotal.donors}
          </td>
          <td className="tabular text-ink-900 text-right">{curTotalPct}%</td>
          {showCompare ? (
            <>
              <td className="tabular text-ink-600 text-right">
                {compareTotal.referred}
              </td>
              <td className="tabular text-ink-600 text-right">
                {compareTotal.donors}
              </td>
              <td className="tabular text-ink-600 text-right">
                {cmpTotalPct}%
              </td>
              <td
                className={`tabular text-right ${pointChange === null ? "text-ink-900" : pointChange >= 0 ? "text-[var(--color-success-text)]" : "text-[var(--color-danger-text)]"}`}
              >
                {pointChange === null
                  ? "—"
                  : `${pointChange > 0 ? "+" : ""}${pointChange.toFixed(1)} pts`}
              </td>
            </>
          ) : null}
        </tr>
      </tbody>
    </Table>
  );
}

function MonthlyDonorConversionRow({
  row,
  showCompare,
}: {
  row: DonorConversionModel["monthlyRows"][number];
  showCompare: boolean;
}) {
  const curPct = formatPct(row.current.conversionPct);
  const cmpPct = formatPct(row.compare.conversionPct);

  return (
    <tr className="transition-colors hover:bg-ink-50/70">
      <td className="font-medium text-ink-900">
        {row.monthLabel}
      </td>
      <td className="tabular text-ink-900 font-medium text-right">
        {row.current.referred || "—"}
      </td>
      <td className="tabular text-ink-900 font-medium text-right">
        {row.current.donors || "—"}
      </td>
      <td className="tabular text-ink-900 font-medium text-right">
        {curPct}%
      </td>
      {showCompare ? (
        <>
          <td className="tabular text-ink-600 text-right">
            {row.compare.referred || "—"}
          </td>
          <td className="tabular text-ink-600 text-right">
            {row.compare.donors || "—"}
          </td>
          <td className="tabular text-ink-600 text-right">
            {cmpPct}%
          </td>
          <td className="tabular text-right font-medium">
            {row.pointChange !== null
              ? (
                  <span
                    className={
                      row.pointChange >= 0
                        ? "text-[var(--color-success-text)]"
                        : "text-[var(--color-danger-text)]"
                    }
                  >
                    {row.pointChange > 0 ? "+" : ""}
                    {row.pointChange.toFixed(1)}
                  </span>
                )
              : "—"}
          </td>
        </>
      ) : null}
    </tr>
  );
}

function formatPct(value: number | null): string {
  return value !== null ? value.toFixed(1) : "—";
}
