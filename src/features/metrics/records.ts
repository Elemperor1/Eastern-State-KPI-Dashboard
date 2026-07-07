import { ANNUAL_ENTRY_MONTH } from "./period-rules";
import type {
  BreakdownEntry,
  BreakdownEntryWithMeta,
  MonthlyEntry,
  MonthlyEntryWithMeta,
  UnitType,
} from "@/lib/types";

export function asEntry(row: Record<string, unknown>): MonthlyEntry {
  return {
    id: Number(row.id),
    kpi_id: Number(row.kpi_id),
    year: Number(row.year),
    month: Number(row.month),
    value: Number(row.value),
    notes: row.notes == null ? null : String(row.notes),
    updated_by: row.updated_by == null ? null : Number(row.updated_by),
    updated_at: String(row.updated_at),
  };
}

export function asEntryWithMeta(row: Record<string, unknown>): MonthlyEntryWithMeta {
  const entry = asEntry(row);
  return {
    ...entry,
    kpi_name: String(row.kpi_name),
    kpi_unit: String(row.kpi_unit ?? ""),
    kpi_unit_type: row.kpi_unit_type as UnitType,
    category_id: Number(row.category_id),
    category_name: String(row.category_name),
    category_slug: String(row.category_slug),
  };
}

export function asBreakdown(row: Record<string, unknown>): BreakdownEntry {
  return {
    id: Number(row.id),
    kpi_id: Number(row.kpi_id),
    year: Number(row.year),
    month: Number(row.month ?? ANNUAL_ENTRY_MONTH),
    label: String(row.label),
    value: Number(row.value),
    sort_order: Number(row.sort_order ?? 0),
    notes: row.notes == null ? null : String(row.notes),
    updated_by: row.updated_by == null ? null : Number(row.updated_by),
    updated_at: String(row.updated_at),
  };
}

export function asBreakdownWithMeta(row: Record<string, unknown>): BreakdownEntryWithMeta {
  const entry = asBreakdown(row);
  return {
    ...entry,
    kpi_name: String(row.kpi_name),
    kpi_unit: String(row.kpi_unit ?? ""),
    category_id: Number(row.category_id),
    category_name: String(row.category_name),
    category_slug: String(row.category_slug),
  };
}
