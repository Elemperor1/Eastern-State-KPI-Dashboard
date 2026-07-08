"use client";

import { BreakdownChart } from "@/components/BreakdownChart";
import { Card } from "@/components/ui";
import type { CategoryBreakdownModel } from "@/features/reporting/types";

interface CategoryAnnualBreakdownsProps {
  sections: CategoryBreakdownModel[];
  currentYear: number;
  compareYear: number;
}

export function CategoryAnnualBreakdowns({
  sections,
  currentYear,
  compareYear,
}: CategoryAnnualBreakdownsProps) {
  if (sections.length === 0) return null;

  return (
    <section className="mb-10 space-y-6">
      <div className="section-head">
        <p className="section-eyebrow">Breakdowns</p>
        <h2 className="section-title">Composition metrics</h2>
      </div>
      {sections.map((section) => (
        <Card key={section.kpi.id} className="p-5 lg:p-6">
          <BreakdownChart
            kpi={section.kpi}
            data={section.breakdowns}
            currentYear={currentYear}
            compareYear={compareYear}
          />
        </Card>
      ))}
    </section>
  );
}
