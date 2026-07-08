import { MONTH_LABELS } from "@/features/metrics";
import type { EntryHistoryWithMeta, KPIWithCategory } from "@/lib/types";
import { isAnnualEntryMonth } from "@/features/metrics";

export interface AdminHistoryFilterState {
  categoryId: string;
  kpiId: string;
  year: string;
}

export type AdminHistoryFilterPatch = Partial<AdminHistoryFilterState>;

export interface ActiveHistoryFilter {
  category_id?: number;
  kpi_id?: number;
  year?: number;
}

export function buildAdminHistoryFilterState(filter: ActiveHistoryFilter): AdminHistoryFilterState {
  return {
    categoryId: filter.category_id ? String(filter.category_id) : "",
    kpiId: filter.kpi_id ? String(filter.kpi_id) : "",
    year: filter.year ? String(filter.year) : "",
  };
}

export function hasActiveAdminHistoryFilter(filter: ActiveHistoryFilter): boolean {
  return Boolean(filter.category_id || filter.kpi_id || filter.year);
}

export function filterAdminHistoryKpisByCategory(
  kpis: KPIWithCategory[],
  categoryId: string,
): KPIWithCategory[] {
  if (!categoryId) return kpis;
  const selectedCategory = Number(categoryId);
  return kpis.filter((kpi) => kpi.category_id === selectedCategory);
}

export function listAdminHistoryYears(history: EntryHistoryWithMeta[]): number[] {
  const years = new Set<number>();
  for (const row of history) years.add(row.year);
  return Array.from(years).sort((a, b) => b - a);
}

export function buildAdminHistoryHref(
  state: AdminHistoryFilterState,
  patch: AdminHistoryFilterPatch = {},
): string {
  const next = { ...state, ...patch };
  const params = new URLSearchParams();
  if (next.categoryId) params.set("category_id", next.categoryId);
  if (next.kpiId) params.set("kpi_id", next.kpiId);
  if (next.year) params.set("year", next.year);
  const query = params.toString();
  return query ? `/admin/history?${query}` : "/admin/history";
}

export function formatAdminHistoryChangedAt(changedAt: string): string {
  return new Date(changedAt).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function describeAdminHistoryPeriod(row: Pick<EntryHistoryWithMeta, "entry_type" | "month_or_label">): string {
  if (row.entry_type === "breakdown") {
    return describeBreakdownHistoryPeriod(row.month_or_label);
  }

  const month = Number(row.month_or_label);
  if (!Number.isFinite(month)) return row.month_or_label;
  if (isAnnualEntryMonth(month)) return "Annual";
  return MONTH_LABELS[month - 1] ?? `Month ${month}`;
}

export function formatAdminHistoryValue(value: number | null): string {
  if (value === null) return "—";
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function getAdminHistoryChangeLabel(
  row: Pick<EntryHistoryWithMeta, "prev_value" | "new_value">,
): "Created" | "Updated" | "Deleted" {
  if (row.new_value === null) return "Deleted";
  return row.prev_value !== row.new_value ? "Updated" : "Created";
}

export function getAdminHistoryEntryTypeLabel(
  row: Pick<EntryHistoryWithMeta, "entry_type">,
): "Monthly" | "Breakdown" {
  return row.entry_type === "monthly" ? "Monthly" : "Breakdown";
}

export function getAdminHistoryKpiLabel(row: Pick<EntryHistoryWithMeta, "kpi_name">): string {
  return row.kpi_name ?? "Deleted KPI";
}

export function getAdminHistoryCategoryLabel(row: Pick<EntryHistoryWithMeta, "category_name">): string {
  return row.category_name ?? "Deleted category";
}

export function getAdminHistoryActorLabel(row: Pick<EntryHistoryWithMeta, "changed_by_email">): string {
  return row.changed_by_email ?? "—";
}

function describeBreakdownHistoryPeriod(monthOrLabel: string): string {
  const separator = monthOrLabel.indexOf("|");
  if (separator === -1) return `Label: ${monthOrLabel}`;

  const month = Number(monthOrLabel.slice(0, separator));
  const label = monthOrLabel.slice(separator + 1);
  if (!Number.isFinite(month)) return `Label: ${monthOrLabel}`;
  if (isAnnualEntryMonth(month)) return `Label: ${label}`;
  return `${MONTH_LABELS[month - 1] ?? `Month ${month}`} · ${label}`;
}
