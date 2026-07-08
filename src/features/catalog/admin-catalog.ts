import type { Category, Direction, KPIWithCategory, ReportingFrequency, UnitType } from "@/lib/types";

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
export const CATALOG_SLUG_PATTERN = "[a-z0-9\\-]+";

export interface CatalogCategorySummary {
  id: number;
  name: string;
  kpiCount: number;
}

export interface CatalogFilters {
  query: string;
  categoryId: number | null;
}

export interface CatalogDeleteTarget {
  kind: "kpi" | "category";
  id: number;
  name: string;
}

export interface CatalogDeleteConfirmation {
  title: string;
  description: string;
  confirmLabel: string;
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

export interface CreateCategoryPayload extends Record<string, unknown> {
  slug: string;
  name: string;
  description: string | null;
}

export function buildCatalogCategorySummaries(
  categories: Category[],
  kpis: KPIWithCategory[],
): CatalogCategorySummary[] {
  const counts = new Map<number, number>();
  for (const kpi of kpis) {
    counts.set(kpi.category_id, (counts.get(kpi.category_id) ?? 0) + 1);
  }

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    kpiCount: counts.get(category.id) ?? 0,
  }));
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

export function buildCatalogDeleteConfirmation(
  target: CatalogDeleteTarget,
): CatalogDeleteConfirmation {
  if (target.kind === "kpi") {
    return {
      title: `Delete “${target.name}”?`,
      description:
        "This KPI can be deleted only after its monthly and breakdown entries are cleared. Clearing those entries first preserves their audit history.",
      confirmLabel: "Delete KPI",
    };
  }

  return {
    title: `Delete “${target.name}”?`,
    description:
      "This category can be deleted only after entries for all of its KPIs are cleared. Deleting the category then removes its KPI definitions while preserving recorded audit history.",
    confirmLabel: "Delete category",
  };
}

export function buildCreateKpiPayload(form: FormData): CreateKpiPayload {
  return {
    category_id: Number(form.get("category_id")),
    slug: String(form.get("slug") || ""),
    name: String(form.get("name") || ""),
    unit: String(form.get("unit") || ""),
    unit_type: String(form.get("unit_type") || "count"),
    reporting_frequency: String(form.get("reporting_frequency") || "monthly"),
    direction: String(form.get("direction") || "higher"),
    description: String(form.get("description") || "") || null,
  };
}

export function buildCreateCategoryPayload(form: FormData): CreateCategoryPayload {
  return {
    slug: String(form.get("slug") || ""),
    name: String(form.get("name") || ""),
    description: String(form.get("description") || "") || null,
  };
}
