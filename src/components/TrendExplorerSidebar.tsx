"use client";

import {
  Badge,
  Card,
  Checkbox,
  Chip,
  FormField,
  Select,
} from "@/components/ui";
import type { Category, KPIWithCategory } from "@/lib/types";

interface TrendExplorerSidebarProps {
  categories: Category[];
  visibleKpis: KPIWithCategory[];
  years: number[];
  categorySlug: string;
  selectedKpiSlugs: string[];
  selectedYears: number[];
  onCategoryChange: (categorySlug: string) => void;
  onToggleKpi: (slug: string) => void;
  onToggleYear: (year: number) => void;
}

export function TrendExplorerSidebar({
  categories,
  visibleKpis,
  years,
  categorySlug,
  selectedKpiSlugs,
  selectedYears,
  onCategoryChange,
  onToggleKpi,
  onToggleYear,
}: TrendExplorerSidebarProps) {
  return (
    <aside className="no-print">
      <Card className="overflow-hidden">
        <div className="p-5">
          <p className="section-eyebrow">Configure view</p>
          <h2 className="text-xl font-semibold text-ink-900">Trend selection</h2>
          <p className="mt-2 text-sm leading-6 text-ink-600 text-pretty">
            Choose the measures and years to place on the same timeline.
          </p>
        </div>

        <div className="border-t border-ink-100 p-5">
          <FormField htmlFor="trend-category" label="Category">
            <Select
              id="trend-category"
              value={categorySlug}
              onChange={(e) => onCategoryChange(e.target.value)}
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.slug}>{category.name}</option>
              ))}
            </Select>
          </FormField>
        </div>

        <div className="border-t border-ink-100 p-3">
          <div className="mb-2 flex items-center justify-between px-2">
            <p className="label mb-0">KPIs</p>
            <Badge variant="default" className="tabular">{selectedKpiSlugs.length} selected</Badge>
          </div>
          <div className="max-h-80 space-y-0.5 overflow-auto pr-1">
            {visibleKpis.map((kpi) => {
              const checked = selectedKpiSlugs.includes(kpi.slug);
              return (
                <Checkbox
                  key={kpi.id}
                  id={`trend-kpi-${kpi.slug}`}
                  label={kpi.name}
                  checked={checked}
                  onChange={() => onToggleKpi(kpi.slug)}
                />
              );
            })}
            {visibleKpis.length === 0 ? (
              <p className="px-2 py-3 text-sm leading-6 text-ink-500">No monthly KPIs in this category.</p>
            ) : null}
          </div>
        </div>

        <div className="border-t border-ink-100 p-5">
          <p className="label mb-2">Years</p>
          <div className="flex flex-wrap gap-2">
            {years.map((year) => {
              const checked = selectedYears.includes(year);
              return (
                <Chip
                  key={year}
                  active={checked}
                  onClick={() => onToggleYear(year)}
                  aria-pressed={checked}
                >
                  {year}
                </Chip>
              );
            })}
          </div>
        </div>
      </Card>
    </aside>
  );
}
