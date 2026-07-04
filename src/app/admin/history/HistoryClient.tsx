"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Filter, History } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  PageHeader,
  Select,
  Table,
} from "@/components/ui";
import type {
  Category,
  EntryHistoryWithMeta,
  KPIWithCategory,
} from "@/lib/types";

interface HistoryClientProps {
  history: EntryHistoryWithMeta[];
  kpis: KPIWithCategory[];
  categories: Category[];
  activeFilter: {
    kpi_id?: number;
    category_id?: number;
    year?: number;
  };
}

/**
 * Read-only audit-trail browser for KPI admin actions.
 *
 * Filters compose a URL query so a deep link preserves the view; clear filters
 * to return to the full feed (newest first).
 */
export function HistoryClient({ history, kpis, categories, activeFilter }: HistoryClientProps) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState<string>(activeFilter.category_id ? String(activeFilter.category_id) : "");
  const [kpiId, setKpiId] = useState<string>(activeFilter.kpi_id ? String(activeFilter.kpi_id) : "");
  const [year, setYear] = useState<string>(activeFilter.year ? String(activeFilter.year) : "");

  const kpisForCategory = useMemo(() => {
    if (!categoryId) return kpis;
    return kpis.filter((k) => k.category_id === Number(categoryId));
  }, [kpis, categoryId]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const row of history) years.add(row.year);
    return Array.from(years).sort((a, b) => b - a);
  }, [history]);

  function applyFilters(next: { categoryId?: string; kpiId?: string; year?: string }) {
    const params = new URLSearchParams();
    const c = next.categoryId ?? categoryId;
    const k = next.kpiId ?? kpiId;
    const y = next.year ?? year;
    if (c) params.set("category_id", c);
    if (k) params.set("kpi_id", k);
    if (y) params.set("year", y);
    const qs = params.toString();
    router.replace(qs ? `/admin/history?${qs}` : "/admin/history", { scroll: false });
  }

  function clearFilters() {
    setCategoryId("");
    setKpiId("");
    setYear("");
    router.replace("/admin/history", { scroll: false });
  }

  return (
    <div className="page-content page-content-wide page-enter">
      <PageHeader
        eyebrow="Admin · History"
        title="Edit history"
        subtitle="Every change to a monthly or breakdown entry leaves a before/after row here. Read-only — entries cannot be replayed from this view."
      />

      <Card className="mb-6 p-5 lg:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Filter className="w-4 h-4 text-ink-500" aria-hidden />
          <h2 className="text-base font-semibold text-ink-900">Filter</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-700">Category</span>
            <Select
              value={categoryId}
              onChange={(event) => {
                const next = event.target.value;
                setCategoryId(next);
                // Reset KPI filter when category changes so we don't filter by a KPI
                // that doesn't belong to the new category.
                setKpiId("");
                applyFilters({ categoryId: next, kpiId: "" });
              }}
            >
              <option value="">All categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-700">KPI</span>
            <Select
              value={kpiId}
              onChange={(event) => {
                const next = event.target.value;
                setKpiId(next);
                applyFilters({ kpiId: next });
              }}
            >
              <option value="">All KPIs</option>
              {kpisForCategory.map((kpi) => (
                <option key={kpi.id} value={kpi.id}>{kpi.name}</option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-700">Year</span>
            <Select
              value={year}
              onChange={(event) => {
                const next = event.target.value;
                setYear(next);
                applyFilters({ year: next });
              }}
            >
              <option value="">All years</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>
          </label>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-ink-500">
            Showing {history.length} change{history.length === 1 ? "" : "s"}.
          </p>
          {activeFilter.kpi_id || activeFilter.category_id || activeFilter.year ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-ink-100 p-5">
          <h2 className="text-xl font-semibold text-ink-900">Activity</h2>
          <p className="mt-1 text-sm text-ink-500">Most recent first.</p>
        </div>
        {history.length === 0 ? (
          <EmptyState
            icon={History}
            title="No history yet"
            description="Once someone edits a KPI entry, every before/after change will appear here."
          />
        ) : (
          <Table minWidth="900px">
            <thead>
              <tr>
                <th scope="col" className="text-left">When</th>
                <th scope="col" className="text-left">KPI</th>
                <th scope="col" className="text-left">Period</th>
                <th scope="col" className="text-left">Change</th>
                <th scope="col" className="text-left">By</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id} className="align-top transition-colors hover:bg-ink-50/70">
                  <td className="whitespace-nowrap text-xs text-ink-500">
                    {new Date(row.changed_at).toLocaleString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>
                    <div className="font-medium text-ink-900">
                      {row.kpi_name ?? <span className="text-ink-400">Deleted KPI</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge variant="default">{row.entry_type === "monthly" ? "Monthly" : "Breakdown"}</Badge>
                      <Chip>
                        {row.category_name ?? "Deleted category"}
                      </Chip>
                      {row.metadata_deleted ? (
                        <Badge variant="error">Metadata deleted</Badge>
                      ) : row.metadata_renamed ? (
                        <Badge variant="warning" title="The KPI has been renamed since this change. The label shown is the historical one.">
                          Renamed
                          {row.kpi_current_name ? ` → ${row.kpi_current_name}` : ""}
                        </Badge>
                      ) : null}
                    </div>
                  </td>
                  <td className="text-sm tabular text-ink-700">
                    <div>{row.year}</div>
                    <div className="text-xs text-ink-500">{describePeriod(row)}</div>
                  </td>
                  <td className="text-sm">
                    <div className="flex items-center gap-2 tabular">
                      <span className="text-ink-500 line-through">{formatValue(row.prev_value)}</span>
                      <span className="text-ink-400">→</span>
                      <span className="font-medium text-ink-900">{formatValue(row.new_value)}</span>
                    </div>
                    {row.new_value === null ? (
                      <Badge variant="error" className="mt-1">Deleted</Badge>
                    ) : row.prev_value !== row.new_value ? (
                      <Badge variant="info" className="mt-1">Updated</Badge>
                    ) : (
                      <Badge variant="default" className="mt-1">Created</Badge>
                    )}
                  </td>
                  <td className="text-xs text-ink-700">
                    {row.changed_by_email ?? <span className="text-ink-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function describePeriod(row: EntryHistoryWithMeta): string {
  if (row.entry_type === "breakdown") {
    const parts = row.month_or_label.split("|");
    const month = Number(parts[0]);
    if (parts.length === 2 && Number.isFinite(month)) {
      if (month === 0) return `Label: ${parts[1]}`;
      const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${labels[month - 1] ?? `Month ${month}`} · ${parts[1]}`;
    }
    return `Label: ${row.month_or_label}`;
  }
  const month = Number(row.month_or_label);
  if (!Number.isFinite(month)) return row.month_or_label;
  if (month === 0) return "Annual";
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return labels[month - 1] ?? `Month ${month}`;
}

function formatValue(value: number | null): string {
  if (value === null) return "—";
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}