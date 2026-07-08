import type { DonorConversionModel } from "@/features/reporting/donor-conversion";

interface DonorConversionSummaryCardsProps {
  model: DonorConversionModel;
  currentYear: number;
  compareYear: number;
}

export function DonorConversionSummaryCards({
  model,
  currentYear,
  compareYear,
}: DonorConversionSummaryCardsProps) {
  const {
    currentTotal,
    compareTotal,
    pointChange,
    showCompare,
  } = model;
  const curTotalPct = formatPct(currentTotal.conversionPct);
  const cmpTotalPct = formatPct(compareTotal.conversionPct);

  return (
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
      <SummaryCard
        label={`Referred (${currentYear})`}
        value={currentTotal.referred}
        description="YTD total"
      />
      <SummaryCard
        label={`Donors (${currentYear})`}
        value={currentTotal.donors}
        description="YTD donors from referrals"
      />
      <SummaryCard
        label={`Conversion rate (${currentYear})`}
        value={`${curTotalPct}%`}
        description={`${currentTotal.donors}/${currentTotal.referred} YTD`}
        valueClassName="text-[var(--color-success-text)]"
      />
      {showCompare ? (
        <SummaryCard
          label={`Conversion rate (${compareYear})`}
          value={`${cmpTotalPct}%`}
          description={`${compareTotal.donors}/${compareTotal.referred} same period`}
        />
      ) : null}
      {showCompare ? (
        <SummaryCard
          label="Change (pp)"
          value={pointChange === null
            ? "—"
            : `${pointChange > 0 ? "+" : ""}${pointChange.toFixed(1)} pts`}
          description={`${currentYear} vs ${compareYear}`}
          valueClassName={pointChange === null
            ? "text-ink-900"
            : pointChange >= 0
              ? "text-[var(--color-success-text)]"
              : "text-[var(--color-danger-text)]"}
        />
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  description,
  valueClassName = "text-ink-900",
}: {
  label: string;
  value: number | string;
  description: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50/50 p-4">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
        {label}
      </p>
      <p className={`text-2xl font-medium tabular ${valueClassName}`}>
        {value}
      </p>
      <p className="text-xs text-ink-500">{description}</p>
    </div>
  );
}

function formatPct(value: number | null): string {
  return value !== null ? value.toFixed(1) : "—";
}
