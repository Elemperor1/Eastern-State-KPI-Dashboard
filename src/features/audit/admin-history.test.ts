import { describe, expect, it } from "vitest";
import type { EntryHistoryWithMeta, KPIWithCategory } from "@/lib/types";
import {
  buildAdminHistoryFilterState,
  buildAdminHistoryHref,
  describeAdminHistoryPeriod,
  filterAdminHistoryKpisByCategory,
  formatAdminHistoryValue,
  getAdminHistoryActorLabel,
  getAdminHistoryCategoryLabel,
  getAdminHistoryChangeLabel,
  getAdminHistoryEntryTypeLabel,
  getAdminHistoryKpiLabel,
  hasActiveAdminHistoryFilter,
  listAdminHistoryYears,
} from "./admin-history";

/** Supports the history test scenario. */
function history(overrides: Partial<EntryHistoryWithMeta>): EntryHistoryWithMeta {
  return {
    id: 1,
    entry_type: "monthly",
    entry_id: 10,
    kpi_id: 11,
    year: 2026,
    month_or_label: "1",
    prev_value: null,
    new_value: 10,
    prev_notes: null,
    new_notes: null,
    changed_by: 1,
    changed_at: "2026-07-08T12:30:00.000Z",
    kpi_name: "Visitors",
    kpi_slug: "visitors",
    kpi_unit: "count",
    category_id: 2,
    category_name: "Museum",
    category_slug: "museum",
    changed_by_email: "admin@example.test",
    kpi_current_name: "Visitors",
    kpi_current_slug: "visitors",
    category_current_name: "Museum",
    category_current_slug: "museum",
    metadata_deleted: false,
    metadata_renamed: false,
    ...overrides,
  };
}

/** Supports the kpi test scenario. */
function kpi(id: number, categoryId: number): KPIWithCategory {
  return {
    id,
    category_id: categoryId,
    parent_id: null,
    slug: `kpi-${id}`,
    name: `KPI ${id}`,
    unit: "count",
    unit_type: "count",
    reporting_frequency: "monthly",
    direction: "higher",
    description: null,
    sort_order: id,
    is_active: 1,
    created_at: "",
    category_name: `Category ${categoryId}`,
    category_slug: `category-${categoryId}`,
  };
}

describe("admin history helpers", () => {
  it("normalizes active filters into client state and detects clearable filters", () => {
    expect(buildAdminHistoryFilterState({ category_id: 2, kpi_id: 3, year: 2026 })).toEqual({
      categoryId: "2",
      kpiId: "3",
      year: "2026",
    });
    expect(buildAdminHistoryFilterState({})).toEqual({ categoryId: "", kpiId: "", year: "" });
    expect(hasActiveAdminHistoryFilter({ category_id: 2 })).toBe(true);
    expect(hasActiveAdminHistoryFilter({})).toBe(false);
  });

  it("builds the deep-link href for composed filters", () => {
    const state = { categoryId: "2", kpiId: "5", year: "2026" };
    expect(buildAdminHistoryHref(state)).toBe("/setup?area=activity&category_id=2&kpi_id=5&year=2026");
    expect(buildAdminHistoryHref(state, { categoryId: "3", kpiId: "" })).toBe("/setup?area=activity&category_id=3&year=2026");
    expect(buildAdminHistoryHref({ categoryId: "", kpiId: "", year: "" })).toBe("/setup?area=activity");
  });

  it("filters KPI options by selected category and lists history years descending", () => {
    const kpis = [kpi(1, 10), kpi(2, 20), kpi(3, 10)];
    expect(filterAdminHistoryKpisByCategory(kpis, "")).toEqual(kpis);
    expect(filterAdminHistoryKpisByCategory(kpis, "10").map((item) => item.id)).toEqual([1, 3]);
    expect(listAdminHistoryYears([
      history({ id: 1, year: 2024 }),
      history({ id: 2, year: 2026 }),
      history({ id: 3, year: 2024 }),
      history({ id: 4, year: 2025 }),
    ])).toEqual([2026, 2025, 2024]);
  });

  it("describes monthly, annual, and breakdown periods", () => {
    expect(describeAdminHistoryPeriod(history({ entry_type: "monthly", month_or_label: "0" }))).toBe("Annual");
    expect(describeAdminHistoryPeriod(history({ entry_type: "monthly", month_or_label: "2" }))).toBe("Feb");
    expect(describeAdminHistoryPeriod(history({ entry_type: "monthly", month_or_label: "13" }))).toBe("Month 13");
    expect(describeAdminHistoryPeriod(history({ entry_type: "monthly", month_or_label: "custom" }))).toBe("custom");
    expect(describeAdminHistoryPeriod(history({ entry_type: "breakdown", month_or_label: "0|Group A" }))).toBe("Label: Group A");
    expect(describeAdminHistoryPeriod(history({ entry_type: "breakdown", month_or_label: "3|Group A" }))).toBe("Mar · Group A");
    expect(describeAdminHistoryPeriod(history({ entry_type: "breakdown", month_or_label: "Group A" }))).toBe("Label: Group A");
  });

  it("formats values and preserves existing change-label semantics", () => {
    expect(formatAdminHistoryValue(null)).toBe("—");
    expect(formatAdminHistoryValue(1200)).toBe("1,200");
    expect(formatAdminHistoryValue(12.345)).toBe("12.35");
    expect(getAdminHistoryChangeLabel(history({ prev_value: 12, new_value: null }))).toBe("Deleted");
    expect(getAdminHistoryChangeLabel(history({ prev_value: null, new_value: 12 }))).toBe("Updated");
    expect(getAdminHistoryChangeLabel(history({ prev_value: 12, new_value: 12 }))).toBe("Created");
  });

  it("builds table labels for deleted metadata and missing actors", () => {
    expect(getAdminHistoryEntryTypeLabel(history({ entry_type: "monthly" }))).toBe("Monthly");
    expect(getAdminHistoryEntryTypeLabel(history({ entry_type: "breakdown" }))).toBe("Breakdown");
    expect(getAdminHistoryKpiLabel(history({ kpi_name: null }))).toBe("Deleted KPI");
    expect(getAdminHistoryCategoryLabel(history({ category_name: null }))).toBe("Deleted category");
    expect(getAdminHistoryActorLabel(history({ changed_by_email: null }))).toBe("—");
  });
});
