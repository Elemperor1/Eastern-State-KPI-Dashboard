"use client";

import { FilterToolbar, FormField, Select } from "@/components/ui";
import type { Category, KPIWithCategory } from "@/lib/types";

interface AdminDataFiltersProps {
  categories: Category[];
  filteredKpis: KPIWithCategory[];
  years: number[];
  categorySlug: string;
  kpiSlug: string;
  year: number;
  onCategoryChange: (categorySlug: string) => void;
  onKpiChange: (kpiSlug: string) => void;
  onYearChange: (year: number) => void;
}

export function AdminDataFilters({
  categories,
  filteredKpis,
  years,
  categorySlug,
  kpiSlug,
  year,
  onCategoryChange,
  onKpiChange,
  onYearChange,
}: AdminDataFiltersProps) {
  return (
    <FilterToolbar className="mb-6">
      <FormField htmlFor="admin-category" label="Category" className="w-full md:w-auto md:min-w-[180px]">
        <Select
          id="admin-category"
          value={categorySlug}
          onChange={(event) => onCategoryChange(event.target.value)}
        >
          <option value="all">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.slug}>{category.name}</option>
          ))}
        </Select>
      </FormField>

      <FormField htmlFor="admin-kpi" label="Metric" className="w-full md:min-w-[220px] md:flex-1">
        <Select
          id="admin-kpi"
          value={kpiSlug}
          onChange={(event) => onKpiChange(event.target.value)}
        >
          <option value="">Select a metric…</option>
          {filteredKpis.map((kpi) => (
            <option key={kpi.slug} value={kpi.slug}>
              {kpi.name} ({kpi.unit_type})
            </option>
          ))}
        </Select>
      </FormField>

      <FormField htmlFor="admin-year" label="Year" className="w-full md:w-auto md:min-w-[120px]">
        <Select
          id="admin-year"
          value={year}
          onChange={(event) => onYearChange(Number(event.target.value))}
        >
          {years.map((optionYear) => (
            <option key={optionYear} value={optionYear}>{optionYear}</option>
          ))}
        </Select>
      </FormField>
    </FilterToolbar>
  );
}
