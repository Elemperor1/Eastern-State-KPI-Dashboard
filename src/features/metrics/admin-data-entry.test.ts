import { describe, expect, it } from "vitest";
import {
  addBlankBreakdownDraft,
  applySavedBreakdownDraft,
  applySavedEntryDraft,
  buildAdminDataSelectionModel,
  buildBreakdownDrafts,
  buildDeleteEntryPayload,
  buildEntryDrafts,
  clearSavedEntryDraft,
  formatAdminDataPeriod,
  isMonthlyBreakdownKpi,
  listBreakdownEditMonths,
  markBreakdownDraftSaving,
  markEntryDraftSaving,
  patchBreakdownDraft,
  patchEntryDraft,
  readSavedBreakdownMutation,
  readSavedEntryMutation,
  removeBreakdownDraft,
  resolveBreakdownEditMonth,
} from "./admin-data-entry";
import { ANNUAL_ENTRY_MONTH } from "./period-rules";
import type {
  BreakdownEntryWithMeta,
  KPIWithCategory,
  MonthlyEntryWithMeta,
} from "@/lib/types";

function kpi(overrides: Partial<KPIWithCategory> = {}): KPIWithCategory {
  return {
    id: 1,
    category_id: 10,
    parent_id: null,
    slug: "visitors",
    name: "Visitors",
    unit: "people",
    unit_type: "count",
    reporting_frequency: "monthly",
    direction: "higher",
    description: null,
    sort_order: 1,
    is_active: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    category_name: "Museum",
    category_slug: "museum",
    ...overrides,
  };
}

function entry(overrides: Partial<MonthlyEntryWithMeta>): MonthlyEntryWithMeta {
  return {
    id: overrides.id ?? 1,
    kpi_id: overrides.kpi_id ?? 1,
    year: overrides.year ?? 2026,
    month: overrides.month ?? 1,
    value: overrides.value ?? 100,
    notes: overrides.notes ?? null,
    updated_by: null,
    updated_at: "2026-01-01T00:00:00.000Z",
    kpi_name: "Visitors",
    kpi_unit: "people",
    kpi_unit_type: "count",
    category_id: 10,
    category_name: "Museum",
    category_slug: "museum",
  };
}

function breakdown(overrides: Partial<BreakdownEntryWithMeta>): BreakdownEntryWithMeta {
  return {
    id: overrides.id ?? 1,
    kpi_id: overrides.kpi_id ?? 1,
    year: overrides.year ?? 2026,
    month: overrides.month ?? ANNUAL_ENTRY_MONTH,
    label: overrides.label ?? "Foundations",
    value: overrides.value ?? 10,
    sort_order: overrides.sort_order ?? 1,
    notes: overrides.notes ?? null,
    updated_by: null,
    updated_at: "2026-01-01T00:00:00.000Z",
    kpi_name: "Funders",
    kpi_unit: "funders",
    category_id: 10,
    category_name: "Fundraising",
    category_slug: "fundraising",
  };
}

describe("admin data-entry draft helpers", () => {
  it("builds one annual draft from the month-zero snapshot", () => {
    const annualKpi = kpi({ reporting_frequency: "annual" });
    const drafts = buildEntryDrafts({
      kpi: annualKpi,
      year: 2026,
      entries: [
        entry({ id: 1, month: ANNUAL_ENTRY_MONTH, value: 25, notes: "final" }),
        entry({ id: 2, month: 1, value: 999, notes: "stray" }),
      ],
    });

    expect(Object.keys(drafts)).toEqual(["0"]);
    expect(drafts["0"]).toEqual({
      id: 1,
      value: "25",
      notes: "final",
      saved: 25,
      dirty: false,
    });
  });

  it("builds twelve monthly drafts and preserves zero-valued saved months", () => {
    const drafts = buildEntryDrafts({
      kpi: kpi(),
      year: 2026,
      entries: [
        entry({ id: 1, month: 1, value: 0, notes: "real zero" }),
        entry({ id: 2, month: 3, value: 15 }),
        entry({ id: 3, year: 2025, month: 1, value: 999 }),
        entry({ id: 4, month: ANNUAL_ENTRY_MONTH, value: 888 }),
      ],
    });

    expect(Object.keys(drafts)).toHaveLength(12);
    expect(drafts["1"]).toMatchObject({ id: 1, value: "0", notes: "real zero", saved: 0 });
    expect(drafts["2"]).toMatchObject({ id: null, value: "", notes: "", saved: null });
    expect(drafts["3"]).toMatchObject({ id: 2, value: "15", notes: "", saved: 15 });
    expect(drafts["0"]).toBeUndefined();
  });

  it("builds the selected KPI and breakdown period view model", () => {
    const monthlyBreakdown = kpi({
      id: 7,
      category_slug: "fundraising",
      slug: "donor-conversion",
      unit_type: "breakdown",
    });
    const otherKpi = kpi({ id: 8, category_slug: "attendance", slug: "visitors" });
    const model = buildAdminDataSelectionModel({
      breakdownMonth: 2,
      breakdowns: [
        breakdown({ kpi_id: 7, year: 2026, month: 1 }),
        breakdown({ kpi_id: 7, year: 2026, month: 2 }),
        breakdown({ kpi_id: 7, year: 2025, month: 12 }),
      ],
      categorySlug: "fundraising",
      kpiSlug: "donor-conversion",
      kpis: [monthlyBreakdown, otherKpi],
      year: 2026,
    });

    expect(model.filteredKpis).toEqual([monthlyBreakdown]);
    expect(model.kpi).toBe(monthlyBreakdown);
    expect(model.selectedBreakdownIsMonthly).toBe(true);
    expect(model.selectedBreakdownMonths).toEqual([1, 2]);
    expect(model.selectedBreakdownPeriod).toBe("February 2026");
  });

  it("formats annual and monthly admin periods without duplicating the year", () => {
    expect(formatAdminDataPeriod(ANNUAL_ENTRY_MONTH, 2026)).toBe("2026");
    expect(formatAdminDataPeriod(3, 2026)).toBe("March 2026");
  });

  it("classifies and lists monthly breakdown edit months by selected KPI and year", () => {
    const breakdownKpi = kpi({ id: 7, unit_type: "breakdown", reporting_frequency: "flexible" });
    const rows = [
      breakdown({ id: 1, kpi_id: 7, year: 2026, month: 2 }),
      breakdown({ id: 2, kpi_id: 7, year: 2026, month: 1 }),
      breakdown({ id: 3, kpi_id: 7, year: 2026, month: 2 }),
      breakdown({ id: 4, kpi_id: 7, year: 2025, month: 12 }),
      breakdown({ id: 5, kpi_id: 99, year: 2026, month: 3 }),
      breakdown({ id: 6, kpi_id: 7, year: 2026, month: ANNUAL_ENTRY_MONTH }),
    ];

    expect(isMonthlyBreakdownKpi(breakdownKpi, rows)).toBe(true);
    expect(listBreakdownEditMonths({ kpi: breakdownKpi, breakdowns: rows, year: 2026 })).toEqual([1, 2]);
    expect(isMonthlyBreakdownKpi(kpi({ unit_type: "count" }), rows)).toBe(false);
  });

  it("keeps monthly breakdown editing away from the annual month-zero slot", () => {
    expect(resolveBreakdownEditMonth({
      isMonthlyBreakdown: true,
      requestedMonth: ANNUAL_ENTRY_MONTH,
      availableMonths: [2, 4],
      fallbackMonth: 7,
    })).toBe(2);

    expect(resolveBreakdownEditMonth({
      isMonthlyBreakdown: true,
      requestedMonth: ANNUAL_ENTRY_MONTH,
      availableMonths: [],
      fallbackMonth: 7,
    })).toBe(7);

    expect(resolveBreakdownEditMonth({
      isMonthlyBreakdown: true,
      requestedMonth: 5,
      availableMonths: [],
      fallbackMonth: 7,
    })).toBe(5);

    expect(resolveBreakdownEditMonth({
      isMonthlyBreakdown: false,
      requestedMonth: 5,
      availableMonths: [5],
      fallbackMonth: 7,
    })).toBe(ANNUAL_ENTRY_MONTH);
  });

  it("builds monthly breakdown drafts for only the selected month", () => {
    const breakdownKpi = kpi({ id: 7, unit_type: "breakdown", reporting_frequency: "flexible" });
    const rows = [
      breakdown({ id: 1, kpi_id: 7, year: 2026, month: 2, label: "Referred", value: 20 }),
      breakdown({ id: 2, kpi_id: 7, year: 2026, month: 2, label: "Donors", value: 5, notes: "confirmed" }),
      breakdown({ id: 3, kpi_id: 7, year: 2026, month: 3, label: "Referred", value: 30 }),
      breakdown({ id: 4, kpi_id: 7, year: 2026, month: ANNUAL_ENTRY_MONTH, label: "Annual", value: 99 }),
    ];

    expect(buildBreakdownDrafts({
      kpi: breakdownKpi,
      breakdowns: rows,
      year: 2026,
      month: 2,
      isMonthlyBreakdown: true,
    })).toEqual([
      {
        id: 1,
        label: "Referred",
        value: "20",
        notes: "",
        savedValue: 20,
        dirty: false,
      },
      {
        id: 2,
        label: "Donors",
        value: "5",
        notes: "confirmed",
        savedValue: 5,
        dirty: false,
      },
    ]);
  });

  it("builds annual breakdown drafts from the selected year", () => {
    const breakdownKpi = kpi({ id: 7, unit_type: "breakdown", reporting_frequency: "annual" });
    const rows = [
      breakdown({ id: 1, kpi_id: 7, year: 2026, month: ANNUAL_ENTRY_MONTH, label: "Foundations", value: 10 }),
      breakdown({ id: 2, kpi_id: 7, year: 2025, month: ANNUAL_ENTRY_MONTH, label: "Foundations", value: 8 }),
    ];

    expect(buildBreakdownDrafts({
      kpi: breakdownKpi,
      breakdowns: rows,
      year: 2026,
      month: ANNUAL_ENTRY_MONTH,
      isMonthlyBreakdown: false,
    })).toMatchObject([
      { id: 1, label: "Foundations", value: "10", savedValue: 10 },
    ]);
  });

  it("updates entry drafts immutably through edit, saving, saved, and cleared states", () => {
    const drafts = buildEntryDrafts({
      kpi: kpi(),
      year: 2026,
      entries: [entry({ month: 1, value: 12, notes: "old" })],
    });

    const edited = patchEntryDraft(drafts, 1, { value: "15" });
    expect(edited).not.toBe(drafts);
    expect(edited["1"]).toMatchObject({
      value: "15",
      notes: "old",
      saved: 12,
      dirty: true,
    });
    expect(drafts["1"]).toMatchObject({ value: "12", dirty: false });

    const saving = markEntryDraftSaving(edited, 1, true);
    expect(saving["1"].saving).toBe(true);

    const saved = applySavedEntryDraft(saving, 1, { id: 1, value: 15, notes: "new" });
    expect(saved["1"]).toEqual({
      id: 1,
      value: "15",
      notes: "new",
      saved: 15,
      dirty: false,
      saving: false,
    });

    const cleared = clearSavedEntryDraft(saved, 1);
    expect(cleared["1"]).toEqual({
      id: null,
      value: "",
      notes: "",
      saved: null,
      dirty: false,
      saving: false,
    });
  });

  it("creates missing entry drafts when a field changes", () => {
    expect(patchEntryDraft({}, 4, { notes: "late note" })).toEqual({
      "4": {
        id: null,
        value: "",
        notes: "late note",
        saved: null,
        dirty: true,
        saving: false,
      },
    });
  });

  it("deletes saved entries by their durable row identity, including zero values", () => {
    const drafts = buildEntryDrafts({
      kpi: kpi(),
      year: 2026,
      entries: [entry({ id: 44, month: 1, value: 0 })],
    });

    expect(buildDeleteEntryPayload(drafts["1"])).toEqual({ id: 44 });
    expect(buildDeleteEntryPayload(drafts["2"])).toBeNull();
  });

  it("reads saved entry mutations from the entry response contract", () => {
    expect(readSavedEntryMutation({
      entry: { id: 44, value: 0, notes: null },
    })).toEqual({
      id: 44,
      value: 0,
      notes: null,
    });
    expect(readSavedEntryMutation({ entry: { id: 0, value: 10 } })).toBeNull();
    expect(readSavedEntryMutation({ entry: { id: 44, value: Number.NaN } })).toBeNull();
    expect(readSavedEntryMutation({ breakdown: { id: 44, value: 10 } })).toBeNull();
  });

  it("reads saved breakdown mutations from the breakdown response contract", () => {
    expect(readSavedBreakdownMutation({
      breakdown: {
        id: 55,
        label: "Donors",
        value: 0,
        notes: "confirmed",
      },
    })).toEqual({
      id: 55,
      label: "Donors",
      value: 0,
      notes: "confirmed",
    });
    expect(readSavedBreakdownMutation({
      entry: { id: 55, label: "Donors", value: 10 },
    })).toBeNull();
    expect(readSavedBreakdownMutation({
      breakdown: { id: 55, label: "", value: 10 },
    })).toBeNull();
    expect(readSavedBreakdownMutation({
      breakdown: { id: 55, label: "Donors", value: "10" },
    })).toBeNull();
  });

  it("updates breakdown drafts immutably through edit, saving, saved, add, and remove states", () => {
    const drafts = buildBreakdownDrafts({
      kpi: kpi({ id: 7, unit_type: "breakdown", reporting_frequency: "annual" }),
      breakdowns: [breakdown({ id: 1, kpi_id: 7, label: "Foundations", value: 10, notes: "old" })],
      year: 2026,
      month: ANNUAL_ENTRY_MONTH,
      isMonthlyBreakdown: false,
    });

    const edited = patchBreakdownDraft(drafts, 0, { value: "12" });
    expect(edited).not.toBe(drafts);
    expect(edited[0]).toMatchObject({
      id: 1,
      label: "Foundations",
      value: "12",
      notes: "old",
      savedValue: 10,
      dirty: true,
    });
    expect(drafts[0]).toMatchObject({ value: "10", dirty: false });

    const saving = markBreakdownDraftSaving(edited, 0, true);
    expect(saving[0].saving).toBe(true);

    const saved = applySavedBreakdownDraft(saving, 0, {
      id: 2,
      label: "Major donors",
      value: 20,
      notes: null,
    });
    expect(saved[0]).toEqual({
      id: 2,
      label: "Major donors",
      value: "20",
      notes: "",
      savedValue: 20,
      dirty: false,
      saving: false,
    });

    const withBlank = addBlankBreakdownDraft(saved);
    expect(withBlank[1]).toEqual({
      id: null,
      label: "",
      value: "",
      notes: "",
      savedValue: null,
      dirty: true,
    });

    expect(removeBreakdownDraft(withBlank, 0)).toEqual([withBlank[1]]);
  });

  it("ignores out-of-range breakdown draft updates", () => {
    const drafts = [breakdown({ id: 1, label: "Foundations" })].map((row) => ({
      id: row.id,
      label: row.label,
      value: String(row.value),
      notes: row.notes ?? "",
      savedValue: row.value,
      dirty: false,
    }));

    expect(patchBreakdownDraft(drafts, 5, { value: "99" })).toBe(drafts);
    expect(markBreakdownDraftSaving(drafts, 5, true)).toBe(drafts);
  });
});
