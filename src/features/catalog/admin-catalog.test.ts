import { describe, expect, it } from "vitest";
import {
  buildCreateKpiPayload,
  CATALOG_DIRECTIONS,
  STRATEGIC_MEASURE_FREQUENCIES,
  STRATEGIC_MEASURE_TYPES,
  filterCatalogKpis,
  formatCatalogDirection,
} from "./admin-catalog";
import type { KPIWithCategory } from "@/lib/types";

function kpi(id: number, name: string, categoryId: number, categoryName: string): KPIWithCategory {
  return {
    id,
    category_id: categoryId,
    parent_id: null,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    name,
    unit: "people",
    unit_type: "count",
    reporting_frequency: "monthly",
    direction: "higher",
    description: null,
    sort_order: id,
    is_active: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    category_name: categoryName,
    category_slug: categoryName.toLowerCase().replaceAll(" ", "-"),
  };
}

describe("admin catalog view helpers", () => {
  const kpis = [
    kpi(1, "Video views", 1, "Education"),
    kpi(2, "Webpage views", 1, "Education"),
    kpi(3, "Overall donors", 2, "Fundraising"),
  ];

  it("exposes the approved catalog form options in display order", () => {
    expect(STRATEGIC_MEASURE_TYPES).toContain("multi_component");
    expect(STRATEGIC_MEASURE_TYPES).toContain("distribution");
    expect(STRATEGIC_MEASURE_FREQUENCIES).toEqual([
      "monthly",
      "quarterly",
      "annual",
      "cumulative",
      "one_time",
    ]);
    expect(CATALOG_DIRECTIONS).toEqual(["higher", "lower", "neutral"]);
    expect(CATALOG_DIRECTIONS.map(formatCatalogDirection)).toEqual([
      "higher is better",
      "lower is better",
      "neutral",
    ]);
  });

  it("filters KPIs by category and by KPI name or slug", () => {
    expect(filterCatalogKpis(kpis, { query: "video", categoryId: null }).map((item) => item.id)).toEqual([1]);
    expect(filterCatalogKpis(kpis, { query: "webpage-views", categoryId: null }).map((item) => item.id)).toEqual([2]);
    expect(filterCatalogKpis(kpis, { query: "", categoryId: 1 }).map((item) => item.id)).toEqual([1, 2]);
    expect(filterCatalogKpis(kpis, { query: "fund", categoryId: null })).toEqual([]);
  });

  it("builds a strategic measure payload with a goal and reporting year", () => {
    const form = new FormData();
    form.set("goal_id", "14");
    form.set("reporting_year", "2026");
    form.set("slug", "virtual-attendees");
    form.set("name", "Virtual attendees");
    form.set("unit", "people");
    form.set("description", "");

    expect(buildCreateKpiPayload(form)).toEqual({
      goal_id: 14,
      reporting_year: 2026,
      slug: "virtual-attendees",
      name: "Virtual attendees",
      unit: "people",
      measurement_type: "count",
      reporting_frequency: "monthly",
      direction: "higher",
      description: null,
    });
  });

  it("creates the internal link name from the measure name", () => {
    const form = new FormData();
    form.set("goal_id", "14");
    form.set("reporting_year", "2026");
    form.set("name", "Café attendance & tours");
    form.set("unit", "people");

    expect(buildCreateKpiPayload(form).slug).toBe("cafe-attendance-tours");
  });
});
