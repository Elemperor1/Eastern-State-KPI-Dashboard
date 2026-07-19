import {
  EXPLICIT_STRATEGY_REPORTING_FREQUENCIES,
  MEASUREMENT_TYPES,
  type ExplicitStrategyReportingFrequency,
  type MeasurementType,
} from "@/features/strategy";
import type { Direction, KPIWithCategory } from "@/lib/types";
import { slugFromLabel } from "@/lib/slug";

export const STRATEGIC_MEASURE_TYPES: MeasurementType[] = [...MEASUREMENT_TYPES];

export const STRATEGIC_MEASURE_FREQUENCIES:
  ExplicitStrategyReportingFrequency[] = [
    ...EXPLICIT_STRATEGY_REPORTING_FREQUENCIES,
  ];

export const CATALOG_DIRECTIONS: Direction[] = ["higher", "lower", "neutral"];

export interface CatalogFilters {
  query: string;
  categoryId: number | null;
}

export interface StrategicMeasureGoalOption {
  id: number;
  name: string;
  priorityName: string;
}

export interface CreateKpiPayload extends Record<string, unknown> {
  goal_id: number;
  reporting_year: number;
  slug: string;
  name: string;
  unit: string;
  measurement_type: string;
  reporting_frequency: string;
  direction: string;
  description: string | null;
}

/** Implements the filter catalog kpis operation. */
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

/** Formats catalog direction. */
export function formatCatalogDirection(direction: Direction): string {
  if (direction === "higher") return "higher is better";
  if (direction === "lower") return "lower is better";
  return "neutral";
}

/** Builds create kpi payload. */
export function buildCreateKpiPayload(form: FormData): CreateKpiPayload {
  const name = String(form.get("name") || "");
  return {
    goal_id: Number(form.get("goal_id")),
    reporting_year: Number(form.get("reporting_year")),
    slug: String(form.get("slug") || "") || slugFromLabel(name),
    name,
    unit: String(form.get("unit") || ""),
    measurement_type: String(form.get("measurement_type") || "count"),
    reporting_frequency: String(form.get("reporting_frequency") || "monthly"),
    direction: String(form.get("direction") || "higher"),
    description: String(form.get("description") || "") || null,
  };
}
