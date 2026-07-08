import { DonorConversionCharts } from "@/components/DonorConversionCharts";
import { DonorConversionSummaryCards } from "@/components/DonorConversionSummaryCards";
import { DonorConversionTable } from "@/components/DonorConversionTable";
import { buildDonorConversionModel } from "@/features/reporting/donor-conversion";
import type { BreakdownEntryWithMeta, KPIWithCategory } from "@/lib/types";

interface Props {
  kpi: KPIWithCategory;
  /** All breakdown rows for this KPI, pre-filtered by kpi_id. */
  data: BreakdownEntryWithMeta[];
  currentYear: number;
  compareYear: number;
  currentMonth: number;
}

export function DonorConversionCard({
  kpi,
  data,
  currentYear,
  compareYear,
  currentMonth,
}: Props) {
  const model = buildDonorConversionModel({
    breakdowns: data,
    currentYear,
    compareYear,
    currentMonth,
  });

  return (
    <div>
      <div className="mb-5">
        <p className="section-eyebrow">Donor conversion</p>
        <h2 className="text-xl font-semibold text-ink-900">{kpi.name}</h2>
        <p className="mt-1 text-sm text-ink-600 text-pretty">
          Monthly referral and donor conversion data · {currentYear}
          {model.showCompare ? ` vs ${compareYear}` : ""}
        </p>
      </div>

      <DonorConversionSummaryCards
        model={model}
        currentYear={currentYear}
        compareYear={compareYear}
      />
      <DonorConversionCharts
        model={model}
        currentYear={currentYear}
        compareYear={compareYear}
      />
      <DonorConversionTable
        model={model}
        currentYear={currentYear}
        compareYear={compareYear}
      />
    </div>
  );
}
