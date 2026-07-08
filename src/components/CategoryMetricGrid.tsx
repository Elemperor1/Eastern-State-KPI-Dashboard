"use client";

import { MetricCard } from "@/components/MetricCard";
import { CHART_COLORS } from "@/lib/analytics";
import type { CategoryMetricCardModel } from "@/features/reporting/types";

interface CategoryMetricGridProps {
  metrics: CategoryMetricCardModel[];
  title: string;
  onMetricSelect: (slug: string) => void;
}

export function CategoryMetricGrid({
  metrics,
  title,
  onMetricSelect,
}: CategoryMetricGridProps) {
  if (metrics.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="section-head">
        <p className="section-eyebrow">Metrics</p>
        <h2 className="section-title">{title}</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric, idx) => (
          <MetricCard
            key={metric.kpi.id}
            analytics={metric.analytics}
            accentColor={CHART_COLORS[idx % CHART_COLORS.length]}
            onSelect={() => onMetricSelect(metric.kpi.slug)}
            goal={metric.goal}
          />
        ))}
      </div>
    </section>
  );
}
