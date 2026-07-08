import { describe, expect, it } from "vitest";
import {
  buildCatalogCategorySummaries,
  buildCatalogDeleteConfirmation,
  buildCreateCategoryPayload,
  buildCreateKpiPayload,
  CATALOG_DIRECTIONS,
  CATALOG_REPORTING_FREQUENCIES,
  CATALOG_SLUG_PATTERN,
  CATALOG_UNIT_TYPES,
  filterCatalogKpis,
  formatCatalogDirection,
} from "./admin-catalog";
import type { Category, KPIWithCategory } from "@/lib/types";

function category(id: number, name: string): Category {
  return {
    id,
    name,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    description: null,
    sort_order: id,
  };
}

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
  const categories = [
    category(1, "Education"),
    category(2, "Fundraising"),
    category(3, "Museum"),
  ];
  const kpis = [
    kpi(1, "Video views", 1, "Education"),
    kpi(2, "Webpage views", 1, "Education"),
    kpi(3, "Overall donors", 2, "Fundraising"),
  ];

  it("exposes the approved catalog form options in display order", () => {
    expect(CATALOG_UNIT_TYPES).toEqual(["count", "percent", "currency", "attendance", "note", "breakdown"]);
    expect(CATALOG_REPORTING_FREQUENCIES).toEqual(["monthly", "annual", "flexible"]);
    expect(CATALOG_DIRECTIONS).toEqual(["higher", "lower", "neutral"]);
    expect(CATALOG_DIRECTIONS.map(formatCatalogDirection)).toEqual([
      "higher is better",
      "lower is better",
      "neutral",
    ]);
  });

  it("keeps the catalog slug pattern compatible with browser validation", () => {
    expect(() => new RegExp(CATALOG_SLUG_PATTERN, "v")).not.toThrow();
    const slugPattern = new RegExp(`^(?:${CATALOG_SLUG_PATTERN})$`, "v");
    expect(slugPattern.test("virtual-attendees-2026")).toBe(true);
    expect(slugPattern.test("Virtual attendees")).toBe(false);
  });

  it("builds category chip summaries from the server-provided category order", () => {
    expect(buildCatalogCategorySummaries(categories, kpis)).toEqual([
      { id: 1, name: "Education", kpiCount: 2 },
      { id: 2, name: "Fundraising", kpiCount: 1 },
      { id: 3, name: "Museum", kpiCount: 0 },
    ]);
  });

  it("filters KPIs by category and by KPI name or slug", () => {
    expect(filterCatalogKpis(kpis, { query: "video", categoryId: null }).map((item) => item.id)).toEqual([1]);
    expect(filterCatalogKpis(kpis, { query: "webpage-views", categoryId: null }).map((item) => item.id)).toEqual([2]);
    expect(filterCatalogKpis(kpis, { query: "", categoryId: 1 }).map((item) => item.id)).toEqual([1, 2]);
    expect(filterCatalogKpis(kpis, { query: "fund", categoryId: null })).toEqual([]);
  });

  it("describes the guarded KPI deletion workflow without promising entry cascades", () => {
    expect(
      buildCatalogDeleteConfirmation({
        kind: "kpi",
        id: 3,
        name: "Overall donors",
      }),
    ).toEqual({
      title: "Delete “Overall donors”?",
      description:
        "This KPI can be deleted only after its monthly and breakdown entries are cleared. Clearing those entries first preserves their audit history.",
      confirmLabel: "Delete KPI",
    });
  });

  it("describes the guarded category deletion workflow and its KPI metadata cascade", () => {
    expect(
      buildCatalogDeleteConfirmation({
        kind: "category",
        id: 2,
        name: "Fundraising",
      }),
    ).toEqual({
      title: "Delete “Fundraising”?",
      description:
        "This category can be deleted only after entries for all of its KPIs are cleared. Deleting the category then removes its KPI definitions while preserving recorded audit history.",
      confirmLabel: "Delete category",
    });
  });

  it("builds create-KPI payloads with the existing defaults", () => {
    const form = new FormData();
    form.set("category_id", "1");
    form.set("slug", "virtual-attendees");
    form.set("name", "Virtual attendees");
    form.set("unit", "people");
    form.set("description", "");

    expect(buildCreateKpiPayload(form)).toEqual({
      category_id: 1,
      slug: "virtual-attendees",
      name: "Virtual attendees",
      unit: "people",
      unit_type: "count",
      reporting_frequency: "monthly",
      direction: "higher",
      description: null,
    });
  });

  it("builds create-category payloads and preserves optional descriptions", () => {
    const form = new FormData();
    form.set("slug", "community");
    form.set("name", "Community");
    form.set("description", "Public programs");

    expect(buildCreateCategoryPayload(form)).toEqual({
      slug: "community",
      name: "Community",
      description: "Public programs",
    });
  });
});
