"use client";

import { Card } from "@/components/ui";
import { TrendChart } from "@/components/TrendChart";
import type { ComparisonPoint, UnitType } from "@/lib/types";

interface MetricTrendCardProps {
  data: ComparisonPoint[];
  years: number[];
  unitType: UnitType;
  unit: string;
}

export function MetricTrendCard({
  data,
  years,
  unitType,
  unit,
}: MetricTrendCardProps) {
  return (
    <Card className="p-5 lg:p-6 mb-10">
      <div className="mb-5">
        <p className="section-eyebrow">Trend</p>
        <h2 className="section-title">Monthly trend</h2>
      </div>
      <TrendChart
        data={data}
        years={years}
        unitType={unitType}
        unit={unit}
      />
    </Card>
  );
}
