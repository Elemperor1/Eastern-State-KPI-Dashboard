"use client";

import { Search, Trash2 } from "lucide-react";
import { Card, Chip, IconButton, Input, Table } from "@/components/ui";
import type { CatalogCategorySummary } from "@/features/catalog/admin-catalog";
import type { KPIWithCategory } from "@/lib/types";

interface AdminKpisTableProps {
  kpis: KPIWithCategory[];
  totalKpis: number;
  totalCategories: number;
  categories: CatalogCategorySummary[];
  query: string;
  categoryFilter: number | null;
  onQueryChange: (query: string) => void;
  onCategoryFilterChange: (categoryId: number | null) => void;
  onDelete: (id: number, name: string) => void;
}

export function AdminKpisTable({
  kpis,
  totalKpis,
  totalCategories,
  categories,
  query,
  categoryFilter,
  onQueryChange,
  onCategoryFilterChange,
  onDelete,
}: AdminKpisTableProps) {
  return (
    <Card className="overflow-hidden">
      <div className="space-y-4 border-b border-ink-100 p-5">
        <div>
          <h2 className="text-xl font-semibold text-ink-900">Existing KPIs</h2>
          <p className="mt-1 text-sm text-ink-500">
            Showing {kpis.length} of {totalKpis} measures across {totalCategories} categories
          </p>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search by name or slug…"
              aria-label="Search KPIs by name or slug"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip
              type="button"
              active={categoryFilter === null}
              onClick={() => onCategoryFilterChange(null)}
            >
              All ({totalKpis})
            </Chip>
            {categories.map((category) => (
              <Chip
                key={category.id}
                type="button"
                active={categoryFilter === category.id}
                onClick={() =>
                  onCategoryFilterChange(categoryFilter === category.id ? null : category.id)
                }
              >
                {category.name} ({category.kpiCount})
              </Chip>
            ))}
          </div>
        </div>
      </div>
      <Table minWidth="640px">
        <thead>
          <tr>
            <th className="text-left" scope="col">Metric</th>
            <th className="text-left" scope="col">Category</th>
            <th className="text-left" scope="col">Type</th>
            <th className="text-left" scope="col">Frequency</th>
            <th className="text-left" scope="col">Direction</th>
            <th className="text-right" scope="col"></th>
          </tr>
        </thead>
        <tbody>
          {kpis.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-8 text-center text-sm text-ink-500">
                No KPIs match the current filters.
              </td>
            </tr>
          ) : null}
          {kpis.map((kpi) => (
            <tr key={kpi.id} className="transition-colors hover:bg-ink-50/70">
              <td className="py-3 pr-4">
                <span className="font-medium text-ink-900">{kpi.name}</span>
                <span className="block text-xs text-ink-400">{kpi.slug} · {kpi.unit}</span>
              </td>
              <td className="text-ink-700">{kpi.category_name}</td>
              <td className="text-ink-700">{kpi.unit_type}</td>
              <td className="text-ink-700">{kpi.reporting_frequency}</td>
              <td className="text-ink-700">{kpi.direction}</td>
              <td className="text-right">
                <IconButton
                  icon={Trash2}
                  label={`Delete KPI ${kpi.name}`}
                  variant="danger"
                  size="sm"
                  onClick={() => onDelete(kpi.id, kpi.name)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
