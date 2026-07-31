import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb } from "@/lib/db";
import { bootstrapTestInstallation } from "@/features/installation/test-fixture";
import { listCalculatedStrategyActuals } from "@/features/reporting/strategy-actuals-server";
import {
  buildStrategicDataEntryMutation,
  buildStrategicDataEntryRequests,
  deleteEndpointForRecord,
  initialStrategicDataEntryDrafts,
  PRIMARY_DATA_ENTRY_DRAFT,
  savedStrategicDataEntryRecords,
  type StrategicDataEntryDraft,
} from "@/components/strategic-data-entry-model";
import { listStrategicAuditEvents } from "./audit";
import { loadStrategicDataEntryPageData } from "./data-entry-server";
import {
  deleteStrategyComponentEntry,
  deleteStrategyDistribution,
  deleteStrategyObservation,
  upsertStrategyComponentEntry,
  upsertStrategyDistribution,
  upsertStrategyMultiComponentBatch,
  upsertStrategyObservation,
} from "./value-entry";
import type { MeasurementType, StrategyReportingFrequency } from "./types";

/**
 * End-to-end cover for monthly reporting. Every case drives the real client
 * view model (`loadStrategicDataEntryPageData` → drafts → mutation) into the
 * real write path, so a break anywhere along the Data Entry seam fails here
 * rather than in production.
 */

interface SeedOptions {
  fixedDenominator?: number;
  numeratorLabel?: string;
  denominatorLabel?: string;
}

/** Seeds an active KPI attached to a goal so Data Entry can see it. */
function seedMeasure(
  slug: string,
  measurementType: MeasurementType,
  reportingFrequency: StrategyReportingFrequency,
  options: SeedOptions = {},
): { kpiId: number; configurationId: number } {
  const db = getDb();
  const priorityId =
    Number(
      db
        .prepare("SELECT id FROM categories WHERE slug = 'visitor-experience'")
        .get()?.id,
    ) ||
    Number(
      db.prepare(
        `INSERT INTO categories (plan_id, slug, name, description, sort_order)
         VALUES ((SELECT id FROM strategic_plans WHERE status = 'active'),
                 'visitor-experience', 'Reimagine Visitor Experience', '', 0)`,
      ).run().lastInsertRowid,
    );
  const goalId =
    Number(
      db
        .prepare("SELECT id FROM strategic_goals WHERE slug = 'reporting-goal'")
        .get()?.id,
    ) ||
    Number(
      db.prepare(
        `INSERT INTO strategic_goals (
           priority_id, slug, name, plan_start_year, plan_end_year,
           configuration_status
         ) VALUES (?, 'reporting-goal', 'Reporting goal', 2025, 2029, 'active')`,
      ).run(priorityId).lastInsertRowid,
    );
  const kpiId = Number(
    db.prepare(
      `INSERT INTO kpis (
         category_id, slug, name, unit, unit_type, reporting_frequency,
         direction, sort_order
       ) VALUES (?, ?, ?, 'people', 'count', 'annual', 'higher', 0)`,
    ).run(priorityId, slug, `KPI ${slug}`).lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO goal_kpis (goal_id, kpi_id, effective_from_year, effective_to_year)
     VALUES (?, ?, 2025, 2029)`,
  ).run(goalId, kpiId);
  const configurationId = Number(
    db.prepare(
      `INSERT INTO kpi_measurement_configs (
         kpi_id, effective_from_year, effective_to_year, measurement_type,
         unit, numerator_label, denominator_label, fixed_denominator,
         reporting_frequency, aggregation_method, board_level_status,
         configuration_status, calculation_precision
       ) VALUES (?, 2025, 2029, ?, 'people', ?, ?, ?, ?, 'none',
                 'not_reported', 'active', 1)`,
    ).run(
      kpiId,
      measurementType,
      options.numeratorLabel ?? null,
      options.denominatorLabel ?? null,
      options.fixedDenominator ?? null,
      reportingFrequency,
    ).lastInsertRowid,
  );
  return { kpiId, configurationId };
}

/** Seeds an atomic component under a multi-component configuration. */
function seedComponent(
  owner: { kpiId: number; configurationId: number },
  measurementType: MeasurementType,
  slug: string,
  label: string,
  displayOrder: number,
): number {
  return Number(
    getDb().prepare(
      `INSERT INTO kpi_components (
         kpi_id, configuration_id, slug, label, measurement_type, unit,
         display_order, configuration_status
       ) VALUES (?, ?, ?, ?, ?, 'people', ?, 'active')`,
    ).run(
      owner.kpiId,
      owner.configurationId,
      slug,
      label,
      measurementType,
      displayOrder,
    ).lastInsertRowid,
  );
}

/** Seeds a distribution reporting group. */
function seedBand(
  kpiId: number,
  componentId: number | null,
  slug: string,
  label: string,
  displayOrder: number,
): void {
  getDb().prepare(
    `INSERT INTO distribution_bands (
       kpi_id, component_id, slug, label, effective_from_year, display_order
     ) VALUES (?, ?, ?, ?, 2025, ?)`,
  ).run(kpiId, componentId, slug, label, displayOrder);
}

/** Dispatches a built mutation to the server entry point its route uses. */
function save(endpoint: string, body: Record<string, unknown>): void {
  if (endpoint === "/api/strategy/observations") {
    if ("submission_type" in body) {
      upsertStrategyMultiComponentBatch(body, null);
      return;
    }
    upsertStrategyObservation(body, null);
    return;
  }
  if (endpoint === "/api/strategy/component-entries") {
    upsertStrategyComponentEntry(body, null);
    return;
  }
  upsertStrategyDistribution(body, null);
}

/** Loads one Data Entry period exactly as the route and client would. */
function openPeriod(kpiId: number, period: string, reportingYear = 2026) {
  const data = loadStrategicDataEntryPageData({
    reportingYear,
    reportingPeriod: period,
    requestedKpiId: kpiId,
  });
  const drafts = data.selectedKpi
    ? initialStrategicDataEntryDrafts(
        data.selectedKpi,
        data.reportingYear,
        data.reportingPeriod,
        data.records,
      )
    : {};
  return { data, drafts };
}

/** Builds and saves the primary draft with the supplied field edits. */
function enter(
  kpiId: number,
  period: string,
  patch: Partial<StrategicDataEntryDraft>,
  reportingYear = 2026,
): void {
  const { data, drafts } = openPeriod(kpiId, period, reportingYear);
  expect(data.loadError, period).toBeNull();
  const built = buildStrategicDataEntryMutation(
    data.selectedKpi!,
    data.reportingYear,
    { ...drafts[PRIMARY_DATA_ENTRY_DRAFT]!, ...patch },
  );
  expect(built.errors, period).toEqual({});
  save(built.mutation!.endpoint, built.mutation!.body);
}

describe("monthly Data Entry", () => {
  let tmpDir: string;
  let originalDatabasePath: string | undefined;
  let databaseIndex = 0;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-monthly-"));
    originalDatabasePath = process.env.DATABASE_PATH;
  });

  beforeEach(() => {
    resetDb();
    process.env.DATABASE_PATH = path.join(tmpDir, `monthly-${databaseIndex++}.db`);
    bootstrapTestInstallation();
  });

  afterAll(() => {
    resetDb();
    if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDatabasePath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("records all twelve calendar months as distinct periods", () => {
    const { kpiId } = seedMeasure("monthly-count", "count", "monthly");
    for (let month = 1; month <= 12; month += 1) {
      enter(kpiId, `monthly:${month}`, { value: String(month * 10) });
    }
    const rows = getDb()
      .prepare(
        `SELECT period_type, period_index, scalar_value FROM kpi_observations
         WHERE kpi_id = ? ORDER BY period_index`,
      )
      .all(kpiId);
    expect(rows).toHaveLength(12);
    expect(rows.every((row) => row.period_type === "monthly")).toBe(true);
    expect(rows.map((row) => Number(row.period_index))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(rows.map((row) => Number(row.scalar_value))).toEqual([
      10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120,
    ]);
  });

  it("marks a month complete only for the month that was entered", () => {
    const { kpiId } = seedMeasure("monthly-checklist", "count", "monthly");
    enter(kpiId, "monthly:3", { value: "5" });

    expect(openPeriod(kpiId, "monthly:3").data.kpis[0]?.checklistStatus).toBe(
      "complete",
    );
    expect(openPeriod(kpiId, "monthly:4").data.kpis[0]?.checklistStatus).toBe(
      "not_started",
    );
  });

  it("reloads every measurement type into an unchanged, re-savable draft", () => {
    const cases: Array<{
      slug: string;
      type: MeasurementType;
      patch: Partial<StrategicDataEntryDraft>;
      options?: SeedOptions;
    }> = [
      { slug: "m-count", type: "count", patch: { value: "42" } },
      { slug: "m-currency", type: "currency", patch: { value: "1250.5" } },
      { slug: "m-cumulative", type: "cumulative", patch: { value: "7" } },
      { slug: "m-yoy", type: "year_over_year", patch: { value: "-3" } },
      { slug: "m-binary", type: "binary", patch: { binaryValue: "1" } },
      { slug: "m-milestone", type: "milestone", patch: { value: "55" } },
      {
        slug: "m-percentage",
        type: "percentage",
        patch: { numerator: "25", denominator: "80" },
        options: { numeratorLabel: "Reached", denominatorLabel: "Total" },
      },
      {
        slug: "m-percentage-fixed",
        type: "percentage",
        patch: { numerator: "30" },
        options: { numeratorLabel: "Reached", fixedDenominator: 100 },
      },
      {
        slug: "m-ratio",
        type: "ratio",
        patch: { numerator: "9", denominator: "4" },
        options: { numeratorLabel: "Top", denominatorLabel: "Bottom" },
      },
      {
        slug: "m-average-total",
        type: "average",
        patch: {
          averageMethod: "total_score",
          respondentCount: "10",
          totalScore: "40",
          totalPossibleScore: "50",
        },
      },
      {
        slug: "m-average-score",
        type: "average",
        patch: {
          averageMethod: "average_score",
          respondentCount: "10",
          averageScore: "4",
          maxScorePerRespondent: "5",
        },
      },
      {
        slug: "m-average-positive",
        type: "average",
        patch: {
          averageMethod: "percent_positive",
          positiveResponseCount: "7",
          totalResponseCount: "10",
        },
      },
    ];

    for (const testCase of cases) {
      const { kpiId } = seedMeasure(
        testCase.slug,
        testCase.type,
        "monthly",
        testCase.options,
      );
      const opened = openPeriod(kpiId, "monthly:4");
      const built = buildStrategicDataEntryMutation(opened.data.selectedKpi!, 2026, {
        ...opened.drafts[PRIMARY_DATA_ENTRY_DRAFT]!,
        ...testCase.patch,
      });
      expect(built.errors, testCase.slug).toEqual({});
      save(built.mutation!.endpoint, built.mutation!.body);

      const reloaded = openPeriod(kpiId, "monthly:4");
      expect(reloaded.data.records, testCase.slug).toHaveLength(1);
      const rebuilt = buildStrategicDataEntryMutation(
        reloaded.data.selectedKpi!,
        2026,
        reloaded.drafts[PRIMARY_DATA_ENTRY_DRAFT]!,
      );
      expect(rebuilt.errors, testCase.slug).toEqual({});
      expect(rebuilt.mutation!.body, testCase.slug).toEqual(built.mutation!.body);
    }
  });

  it("updates rather than duplicates when a saved month is edited", () => {
    const { kpiId } = seedMeasure("monthly-edit", "count", "monthly");
    enter(kpiId, "monthly:8", { value: "13" });
    expect(openPeriod(kpiId, "monthly:8").drafts[PRIMARY_DATA_ENTRY_DRAFT]!.value)
      .toBe("13");
    enter(kpiId, "monthly:8", { value: "21" });

    const rows = getDb()
      .prepare("SELECT scalar_value FROM kpi_observations WHERE kpi_id = ?")
      .all(kpiId);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.scalar_value)).toBe(21);
  });

  it("commits a monthly multi-component measure as one batched request", () => {
    const owner = seedMeasure("monthly-multi", "multi_component", "monthly");
    seedComponent(owner, "count", "adults", "Adults", 0);
    const ages = seedComponent(owner, "distribution", "ages", "Ages", 1);
    seedBand(owner.kpiId, ages, "under-18", "Under 18", 0);
    seedBand(owner.kpiId, ages, "adult", "Adult", 1);

    const { data, drafts } = openPeriod(owner.kpiId, "monthly:6");
    expect(data.loadError).toBeNull();
    expect(Object.keys(drafts)).toHaveLength(2);
    const bandIds = data.selectedKpi!.bands.map((band) => String(band.id));
    const mutations = Object.values(drafts).map((draft) => {
      const built = buildStrategicDataEntryMutation(data.selectedKpi!, 2026, {
        ...draft,
        value: "12",
        respondentCount: "9",
        bandCounts: { [bandIds[0]!]: "4", [bandIds[1]!]: "5" },
      });
      expect(built.errors).toEqual({});
      return built.mutation!;
    });

    const requests = buildStrategicDataEntryRequests(mutations);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.endpoint).toBe("/api/strategy/observations");
    save(requests[0]!.endpoint, requests[0]!.body);

    const reloaded = openPeriod(owner.kpiId, "monthly:6");
    expect(reloaded.data.records).toHaveLength(2);
    expect(reloaded.data.kpis[0]?.checklistStatus).toBe("complete");
  });

  it("stores a monthly distribution against the selected month", () => {
    const owner = seedMeasure("monthly-dist", "distribution", "monthly");
    seedBand(owner.kpiId, null, "adult", "Adult", 0);
    seedBand(owner.kpiId, null, "youth", "Youth", 1);

    const { data, drafts } = openPeriod(owner.kpiId, "monthly:2");
    const bandIds = data.selectedKpi!.bands.map((band) => String(band.id));
    const built = buildStrategicDataEntryMutation(data.selectedKpi!, 2026, {
      ...drafts[PRIMARY_DATA_ENTRY_DRAFT]!,
      respondentCount: "10",
      bandCounts: { [bandIds[0]!]: "6", [bandIds[1]!]: "4" },
    });
    expect(built.errors).toEqual({});
    save(built.mutation!.endpoint, built.mutation!.body);

    const reloaded = openPeriod(owner.kpiId, "monthly:2");
    expect(reloaded.data.records).toHaveLength(1);
    expect(reloaded.data.records[0]).toMatchObject({
      periodType: "monthly",
      periodIndex: 2,
      respondentCount: 10,
    });
  });

  it("keeps monthly checkpoints and the full-year result on an annual measure", () => {
    const { kpiId } = seedMeasure("annual-checkpoints", "count", "annual");
    for (const period of ["monthly:1", "monthly:2", "annual:0"]) {
      enter(kpiId, period, { value: "11" });
    }
    const rows = getDb()
      .prepare(
        `SELECT period_type, period_index FROM kpi_observations
         WHERE kpi_id = ? ORDER BY period_type, period_index`,
      )
      .all(kpiId);
    expect(
      rows.map((row) => `${String(row.period_type)}:${Number(row.period_index)}`),
    ).toEqual(["annual:0", "monthly:1", "monthly:2"]);
  });

  it("carries monthly entries through to the calculated actuals Reports use", () => {
    const { kpiId } = seedMeasure("monthly-reported", "count", "monthly");
    for (const month of [1, 2, 3]) {
      enter(kpiId, `monthly:${month}`, { value: String(month) });
    }
    const actuals = listCalculatedStrategyActuals({
      kpiIds: [kpiId],
      throughYear: 2026,
    });
    expect(actuals.map((actual) => actual.periodType)).toEqual([
      "monthly",
      "monthly",
      "monthly",
    ]);
    expect(actuals.map((actual) => actual.periodIndex)).toEqual([1, 2, 3]);
    expect(actuals.map((actual) => actual.value)).toEqual([1, 2, 3]);
  });

  it("offers one unambiguous period option per cadence in the selector", () => {
    seedMeasure("cadence-monthly", "count", "monthly");
    seedMeasure("cadence-quarterly", "count", "quarterly");
    seedMeasure("cadence-annual", "count", "annual");
    seedMeasure("cadence-cumulative", "count", "cumulative");
    seedMeasure("cadence-one-time", "count", "one_time");

    const data = loadStrategicDataEntryPageData({
      reportingYear: 2026,
      reportingPeriod: "monthly:7",
      requestedKpiId: null,
    });
    const values = data.reportingPeriods.map((option) => option.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values).toEqual(
      expect.arrayContaining([
        "monthly:7",
        "quarterly:2",
        "annual:0",
        "cumulative:0",
        "one_time:0",
      ]),
    );
    // July is due only for the monthly measure and the annual measure's
    // monthly checkpoint.
    expect(data.kpis.map((kpi) => kpi.name).sort()).toEqual([
      "KPI cadence-annual",
      "KPI cadence-monthly",
    ]);
  });

  it("keeps existing monthly data enterable after a cadence change", () => {
    const { kpiId, configurationId } = seedMeasure(
      "cadence-switch",
      "count",
      "annual",
    );
    enter(kpiId, "monthly:5", { value: "8" });
    getDb()
      .prepare(
        "UPDATE kpi_measurement_configs SET reporting_frequency = 'monthly' WHERE id = ?",
      )
      .run(configurationId);

    const { data, drafts } = openPeriod(kpiId, "monthly:5");
    expect(data.loadError).toBeNull();
    expect(data.records).toHaveLength(1);
    expect(data.kpis[0]?.checklistStatus).toBe("complete");
    const rebuilt = buildStrategicDataEntryMutation(
      data.selectedKpi!,
      2026,
      drafts[PRIMARY_DATA_ENTRY_DRAFT]!,
    );
    expect(rebuilt.errors).toEqual({});
    expect(() =>
      save(rebuilt.mutation!.endpoint, rebuilt.mutation!.body),
    ).not.toThrow();
  });

  it("clears one month without disturbing the others", () => {
    const { kpiId } = seedMeasure("monthly-clear", "count", "monthly");
    for (const month of [4, 5, 6]) {
      enter(kpiId, `monthly:${month}`, { value: String(month) });
    }

    const may = openPeriod(kpiId, "monthly:5");
    const saved = savedStrategicDataEntryRecords(
      may.data.selectedKpi!,
      may.data.records,
    )[PRIMARY_DATA_ENTRY_DRAFT];
    expect(saved).toBeDefined();
    expect(deleteEndpointForRecord(saved!)).toBe("/api/strategy/observations");
    deleteStrategyObservation(saved!.id, null);

    const cleared = openPeriod(kpiId, "monthly:5");
    expect(cleared.data.records).toHaveLength(0);
    expect(cleared.data.kpis[0]?.checklistStatus).toBe("not_started");
    expect(cleared.drafts[PRIMARY_DATA_ENTRY_DRAFT]!.value).toBe("");
    // The neighbouring months are untouched.
    expect(openPeriod(kpiId, "monthly:4").data.records).toHaveLength(1);
    expect(openPeriod(kpiId, "monthly:6").data.records).toHaveLength(1);

    // The removal is recorded as immutable Activity.
    const deletions = listStrategicAuditEvents({
      entity_type: "kpi_observation",
      event_type: "delete",
    });
    expect(deletions).toHaveLength(1);
    expect(deletions[0]?.entity_id).toBe(saved!.id);
  });

  it("clears one component of a monthly multi-component measure", () => {
    const owner = seedMeasure("monthly-clear-multi", "multi_component", "monthly");
    const adults = seedComponent(owner, "count", "adults", "Adults", 0);
    seedComponent(owner, "count", "youth", "Youth", 1);

    const opened = openPeriod(owner.kpiId, "monthly:6");
    for (const [key, draft] of Object.entries(opened.drafts)) {
      const built = buildStrategicDataEntryMutation(
        opened.data.selectedKpi!,
        2026,
        { ...draft, value: "4" },
      );
      expect(built.errors, key).toEqual({});
      save(built.mutation!.endpoint, built.mutation!.body);
    }

    const filled = openPeriod(owner.kpiId, "monthly:6");
    expect(filled.data.kpis[0]?.checklistStatus).toBe("complete");
    const saved = savedStrategicDataEntryRecords(
      filled.data.selectedKpi!,
      filled.data.records,
    )[String(adults)];
    expect(saved).toBeDefined();
    expect(deleteEndpointForRecord(saved!)).toBe(
      "/api/strategy/component-entries",
    );
    deleteStrategyComponentEntry(saved!.id, null);

    const cleared = openPeriod(owner.kpiId, "monthly:6");
    expect(cleared.data.records).toHaveLength(1);
    expect(cleared.data.records[0]?.componentId).not.toBe(adults);
    // One missing input makes the whole measure incomplete again.
    expect(cleared.data.kpis[0]?.checklistStatus).toBe("not_started");
  });

  it("clears a monthly distribution through its own route", () => {
    const owner = seedMeasure("monthly-clear-dist", "distribution", "monthly");
    seedBand(owner.kpiId, null, "adult", "Adult", 0);
    seedBand(owner.kpiId, null, "youth", "Youth", 1);

    const opened = openPeriod(owner.kpiId, "monthly:2");
    const bandIds = opened.data.selectedKpi!.bands.map((band) => String(band.id));
    const built = buildStrategicDataEntryMutation(
      opened.data.selectedKpi!,
      2026,
      {
        ...opened.drafts[PRIMARY_DATA_ENTRY_DRAFT]!,
        respondentCount: "10",
        bandCounts: { [bandIds[0]!]: "6", [bandIds[1]!]: "4" },
      },
    );
    save(built.mutation!.endpoint, built.mutation!.body);

    const filled = openPeriod(owner.kpiId, "monthly:2");
    const saved = savedStrategicDataEntryRecords(
      filled.data.selectedKpi!,
      filled.data.records,
    )[PRIMARY_DATA_ENTRY_DRAFT];
    expect(deleteEndpointForRecord(saved!)).toBe("/api/strategy/distributions");
    deleteStrategyDistribution(saved!.id, null);

    const cleared = openPeriod(owner.kpiId, "monthly:2");
    expect(cleared.data.records).toHaveLength(0);
    expect(cleared.data.kpis[0]?.checklistStatus).toBe("not_started");
    // The band definitions survive the value removal.
    expect(cleared.data.selectedKpi!.bands).toHaveLength(2);
  });

  it("can re-enter a month after clearing it", () => {
    const { kpiId } = seedMeasure("monthly-reenter", "count", "monthly");
    enter(kpiId, "monthly:5", { value: "9" });
    const opened = openPeriod(kpiId, "monthly:5");
    const saved = savedStrategicDataEntryRecords(
      opened.data.selectedKpi!,
      opened.data.records,
    )[PRIMARY_DATA_ENTRY_DRAFT];
    deleteStrategyObservation(saved!.id, null);

    enter(kpiId, "monthly:5", { value: "17" });
    const rows = getDb()
      .prepare("SELECT scalar_value FROM kpi_observations WHERE kpi_id = ?")
      .all(kpiId);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.scalar_value)).toBe(17);
  });

  /**
   * CALC-001: the checklist calls a period complete as soon as a record
   * exists, so Data Entry must never accept inputs the calculation kernel
   * can only render invalid. Anything savable has to compute.
   */
  it("never accepts a monthly value the kernel can only render invalid", () => {
    const withBands = seedMeasure("invariant-dist", "distribution", "monthly");
    seedBand(withBands.kpiId, null, "a", "A", 0);
    seedBand(withBands.kpiId, null, "b", "B", 1);
    const average = seedMeasure("invariant-avg", "average", "monthly");
    const percentage = seedMeasure("invariant-pct", "percentage", "monthly", {
      numeratorLabel: "Reached",
      denominatorLabel: "Total",
    });

    const distributionBands = openPeriod(withBands.kpiId, "monthly:3")
      .data.selectedKpi!.bands.map((band) => String(band.id));
    const degenerate: Array<{ kpiId: number; patch: Partial<StrategicDataEntryDraft> }> = [
      {
        kpiId: withBands.kpiId,
        patch: {
          respondentCount: "0",
          bandCounts: {
            [distributionBands[0]!]: "0",
            [distributionBands[1]!]: "0",
          },
        },
      },
      {
        kpiId: average.kpiId,
        patch: {
          averageMethod: "percent_positive",
          positiveResponseCount: "0",
          totalResponseCount: "0",
        },
      },
      { kpiId: percentage.kpiId, patch: { numerator: "5", denominator: "0" } },
    ];

    for (const { kpiId, patch } of degenerate) {
      const opened = openPeriod(kpiId, "monthly:3");
      const built = buildStrategicDataEntryMutation(
        opened.data.selectedKpi!,
        2026,
        { ...opened.drafts[PRIMARY_DATA_ENTRY_DRAFT]!, ...patch },
      );
      // Refused at entry with a field error the form can focus...
      expect(built.ok, JSON.stringify(patch)).toBe(false);
      expect(Object.keys(built.errors).length).toBeGreaterThan(0);
      // ...and refused again at the write boundary, so an API caller cannot
      // bypass the form to persist it.
      expect(() =>
        upsertStrategyObservation(
          {
            kpi_id: kpiId,
            reporting_year: 2026,
            reporting_month: 3,
            ...(patch.numerator === undefined
              ? {}
              : { numerator: Number(patch.numerator) }),
            ...(patch.denominator === undefined
              ? {}
              : { denominator: Number(patch.denominator) }),
            ...(patch.averageMethod === undefined
              ? {}
              : {
                  average_inputs: {
                    method: patch.averageMethod,
                    positive_response_count: 0,
                    total_response_count: 0,
                  },
                }),
          },
          null,
        ),
      ).toThrow();
    }

    // Nothing degenerate reached storage, so no period is falsely complete.
    for (const { kpiId } of degenerate) {
      expect(openPeriod(kpiId, "monthly:3").data.kpis
        .find((kpi) => kpi.id === kpiId)?.checklistStatus).toBe("not_started");
    }
    expect(
      listCalculatedStrategyActuals({
        kpiIds: degenerate.map(({ kpiId }) => kpiId),
        throughYear: 2026,
      }),
    ).toEqual([]);
  });

  it("refuses a zero respondent total at the distribution write boundary", () => {
    const owner = seedMeasure("zero-respondents", "distribution", "monthly");
    seedBand(owner.kpiId, null, "a", "A", 0);
    const band = openPeriod(owner.kpiId, "monthly:3").data.selectedKpi!.bands[0]!;

    expect(() =>
      upsertStrategyDistribution(
        {
          kpi_id: owner.kpiId,
          reporting_year: 2026,
          reporting_month: 3,
          respondent_count: 0,
          mutually_exclusive: true,
          bands: [
            {
              band_id: band.id,
              slug: band.slug,
              label: band.label,
              count: 0,
              display_order: band.displayOrder,
            },
          ],
        },
        null,
      ),
    ).toThrowError(/invalid strategy value entry/i);
  });

  it("refuses a monthly entry outside the active plan years", () => {
    const { kpiId } = seedMeasure("out-of-plan", "count", "monthly");
    expect(() =>
      upsertStrategyObservation(
        { kpi_id: kpiId, reporting_year: 2031, reporting_month: 3, value: 5 },
        null,
      ),
    ).toThrowError(/active strategic plan/);
  });
});
