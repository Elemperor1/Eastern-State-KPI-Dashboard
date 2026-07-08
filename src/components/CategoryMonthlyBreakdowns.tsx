"use client";

import { DonorConversionCard } from "@/components/DonorConversionCard";
import { Card } from "@/components/ui";
import type { CategoryBreakdownModel } from "@/features/reporting/types";

interface CategoryMonthlyBreakdownsProps {
  sections: CategoryBreakdownModel[];
  title: string;
  currentYear: number;
  compareYear: number;
  currentMonth: number;
}

export function CategoryMonthlyBreakdowns({
  sections,
  title,
  currentYear,
  compareYear,
  currentMonth,
}: CategoryMonthlyBreakdownsProps) {
  if (sections.length === 0) return null;

  return (
    <section className="mb-10 space-y-6">
      <div className="section-head">
        <p className="section-eyebrow">Monthly breakdowns</p>
        <h2 className="section-title">{title}</h2>
      </div>
      {sections.map((section) => (
        <Card key={section.kpi.id} className="p-5 lg:p-6">
          <DonorConversionCard
            kpi={section.kpi}
            data={section.breakdowns}
            currentYear={currentYear}
            compareYear={compareYear}
            currentMonth={currentMonth}
          />
        </Card>
      ))}
    </section>
  );
}
