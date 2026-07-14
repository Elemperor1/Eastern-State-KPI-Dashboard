import type { Direction, KPIWithCategory, ReportingFrequency, UnitType } from "@/lib/types";
import { slugFromLabel } from "@/lib/slug";

export const CATALOG_UNIT_TYPES: UnitType[] = [
  "count",
  "percent",
  "currency",
  "attendance",
  "note",
  "breakdown",
];

export const CATALOG_REPORTING_FREQUENCIES: ReportingFrequency[] = [
  "monthly",
  "annual",
  "flexible",
];

export const CATALOG_DIRECTIONS: Direction[] = ["higher", "lower", "neutral"];

export interface CatalogFilters {
  query: string;
  categoryId: number | null;
}

export interface CreateKpiPayload extends Record<string, unknown> {
  category_id: number;
  slug: string;
  name: string;
  unit: string;
  unit_type: string;
  reporting_frequency: string;
  direction: string;
  description: string | null;
}

export function filterCatalogKpis(
  kpis: KPIWithCategory[],
  filters: CatalogFilters,
): KPIWithCategory[] {
  const needle = filters.query.trim().toLowerCase();
  return kpis.filter((kpi) => {
    if (filters.categoryId !== null && kpi.category_id !== filters.categoryId) {
      return false;
    }
    if (!needle) return true;
    return (
      kpi.name.toLowerCase().includes(needle) ||
      kpi.slug.toLowerCase().includes(needle)
    );
  });
}

export function formatCatalogDirection(direction: Direction): string {
  if (direction === "higher") return "higher is better";
  if (direction === "lower") return "lower is better";
  return "neutral";
}

export function buildCreateKpiPayload(form: FormData): CreateKpiPayload {
  const name = String(form.get("name") || "");
  return {
    category_id: Number(form.get("category_id")),
    slug: String(form.get("slug") || "") || slugFromLabel(name),
    name,
    unit: String(form.get("unit") || ""),
    unit_type: String(form.get("unit_type") || "count"),
    reporting_frequency: String(form.get("reporting_frequency") || "monthly"),
    direction: String(form.get("direction") || "higher"),
    description: String(form.get("description") || "") || null,
  };
}
