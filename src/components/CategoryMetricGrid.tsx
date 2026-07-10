"use client";

import { MetricCard } from "@/components/MetricCard";
import { CHART_COLORS } from "@/lib/analytics";
import type { CategoryMetricGroupModel } from "@/features/reporting/types";

interface CategoryMetricGridProps {
  groups: CategoryMetricGroupModel[];
  title: string;
  onMetricSelect: (slug: string) => void;
}

export function CategoryMetricGrid({
  groups,
  title,
  onMetricSelect,
}: CategoryMetricGridProps) {
  if (groups.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="section-head">
        <p className="section-eyebrow">Metrics</p>
        <h2 className="section-title">{title}</h2>
      </div>
      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.goal} aria-labelledby={`goal-${group.goal.replaceAll(" ", "-")}`}>
            <h3
              id={`goal-${group.goal.replaceAll(" ", "-")}`}
              className="mb-3 text-sm font-semibold uppercase tracking-[0.06em] text-ink-600"
            >
              {group.goal}
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {group.metrics.map((metric, idx) => (
                <MetricCard
                  key={metric.kpi.id}
                  analytics={metric.analytics}
                  accentColor={CHART_COLORS[idx % CHART_COLORS.length]}
                  onSelect={() => onMetricSelect(metric.kpi.slug)}
                  goal={metric.goal}
                  strategic={metric.strategic}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
