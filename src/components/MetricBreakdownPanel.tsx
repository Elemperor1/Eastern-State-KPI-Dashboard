"use client";

import { BreakdownChart } from "@/components/BreakdownChart";
import { DonorConversionCard } from "@/components/DonorConversionCard";
import { Card } from "@/components/ui";
import type { MetricDetailBreakdownModel } from "@/features/reporting/types";
import type { KPIWithCategory } from "@/lib/types";

interface MetricBreakdownPanelProps {
  kpi: KPIWithCategory;
  breakdown: MetricDetailBreakdownModel | null;
  currentYear: number;
  compareYear: number;
  currentMonth: number;
}

export function MetricBreakdownPanel({
  kpi,
  breakdown,
  currentYear,
  compareYear,
  currentMonth,
}: MetricBreakdownPanelProps) {
  return (
    <Card className="p-5 lg:p-6 mb-10">
      {breakdown?.kind === "donor-conversion" ? (
        <DonorConversionCard
          kpi={kpi}
          data={breakdown.breakdowns}
          currentYear={currentYear}
          compareYear={compareYear}
          currentMonth={currentMonth}
        />
      ) : (
        <BreakdownChart
          kpi={kpi}
          data={breakdown?.breakdowns ?? []}
          currentYear={currentYear}
          compareYear={compareYear}
        />
      )}
    </Card>
  );
}
