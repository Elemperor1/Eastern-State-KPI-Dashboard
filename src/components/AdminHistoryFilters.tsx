"use client";

import { Filter } from "lucide-react";
import { Button, Card, Select } from "@/components/ui";
import type { Category, KPIWithCategory } from "@/lib/types";

interface AdminHistoryFiltersProps {
  categories: Category[];
  kpis: KPIWithCategory[];
  years: number[];
  historyCount: number;
  categoryId: string;
  kpiId: string;
  year: string;
  showClear: boolean;
  onCategoryChange: (categoryId: string) => void;
  onKpiChange: (kpiId: string) => void;
  onYearChange: (year: string) => void;
  onClear: () => void;
}

export function AdminHistoryFilters({
  categories,
  kpis,
  years,
  historyCount,
  categoryId,
  kpiId,
  year,
  showClear,
  onCategoryChange,
  onKpiChange,
  onYearChange,
  onClear,
}: AdminHistoryFiltersProps) {
  return (
    <Card className="mb-6 p-5 lg:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Filter className="h-4 w-4 text-ink-500" aria-hidden />
        <h2 className="text-base font-semibold text-ink-900">Filter</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-700">Category</span>
          <Select value={categoryId} onChange={(event) => onCategoryChange(event.target.value)}>
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-700">KPI</span>
          <Select value={kpiId} onChange={(event) => onKpiChange(event.target.value)}>
            <option value="">All KPIs</option>
            {kpis.map((kpi) => (
              <option key={kpi.id} value={kpi.id}>
                {kpi.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-700">Year</span>
          <Select value={year} onChange={(event) => onYearChange(event.target.value)}>
            <option value="">All years</option>
            {years.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-ink-500">
          Showing {historyCount} change{historyCount === 1 ? "" : "s"}.
        </p>
        {showClear ? (
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
