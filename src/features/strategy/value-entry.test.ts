import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb } from "@/lib/db";
import { listStrategicAuditEvents } from "./audit";
import {
  archiveStrategyDistributionBand,
  createStrategyDistributionBand,
  deleteStrategyComponentEntry,
  deleteStrategyDistribution,
  deleteStrategyObservation,
  getStrategyComponentEntry,
  getStrategyDistribution,
  getStrategyObservation,
  listEffectiveDistributionBands,
  listStrategyComponentEntries,
  listStrategyDistributions,
  listStrategyObservations,
  reorderStrategyDistributionBands,
  restoreStrategyDistributionBand,
  StrategyValueEntryValidationError,
  upsertStrategyComponentEntry,
  upsertStrategyDistribution,
  upsertStrategyObservation,
  updateStrategyDistributionBand,
} from "./value-entry";
import type { MeasurementType, StrategyReportingFrequency } from "./types";

interface SeededKpi {
  kpiId: number;
  configurationId: number;
}

function seedKpi(
  slug: string,
  measurementType: MeasurementType,
  reportingFrequency: StrategyReportingFrequency,
  options: { fixedDenominator?: number; allowScoreOverMax?: boolean } = {},
): SeededKpi {
  const db = getDb();
  let category = db
    .prepare("SELECT id FROM categories WHERE slug = 'visitor-experience'")
    .get();
  if (!category) {
    const categoryId = Number(
      db.prepare(
        `INSERT INTO categories (slug, name, description, sort_order)
         VALUES ('visitor-experience', 'Reimagine Visitor Experience', '', 0)`,
      ).run().lastInsertRowid,
    );
    category = { id: categoryId };
  }
  const kpiId = Number(
    db.prepare(
      `INSERT INTO kpis (
         category_id, slug, name, unit, unit_type, reporting_frequency,
         direction, sort_order
       ) VALUES (?, ?, ?, 'people', 'count', 'annual', 'higher', 0)`,
    ).run(Number(category.id), slug, `KPI ${slug}`).lastInsertRowid,
  );
  const configurationId = Number(
    db.prepare(
      `INSERT INTO kpi_measurement_configs (
         kpi_id, effective_from_year, effective_to_year, measurement_type,
         unit, fixed_denominator, reporting_frequency, aggregation_method,
         board_level_status, configuration_status, allow_score_over_max
       ) VALUES (?, 2025, 2029, ?, 'people', ?, ?, 'none', 'not_reported',
                 'active', ?)`,
    ).run(
      kpiId,
      measurementType,
      options.fixedDenominator ?? null,
      reportingFrequency,
      options.allowScoreOverMax ? 1 : 0,
    ).lastInsertRowid,
  );
  return { kpiId, configurationId };
}

function seedComponent(
  configuration: SeededKpi,
  measurementType: MeasurementType,
  label = "Participants enrolled",
): number {
  return Number(
    getDb()
      .prepare(
        `INSERT INTO kpi_components (
           kpi_id, configuration_id, slug, label, measurement_type, unit,
           display_order, configuration_status
         ) VALUES (?, ?, 'participants-enrolled', ?, ?, 'people', 0, 'active')`,
      )
      .run(
        configuration.kpiId,
        configuration.configurationId,
        label,
        measurementType,
      ).lastInsertRowid,
  );
}

describe("strategy value-entry persistence", () => {
  let tmpDir: string;
  let originalDatabasePath: string | undefined;
  let databaseIndex = 0;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-value-entry-"));
    originalDatabasePath = process.env.DATABASE_PATH;
  });

  beforeEach(() => {
    resetDb();
    process.env.DATABASE_PATH = path.join(tmpDir, `value-${databaseIndex++}.db`);
  });

  afterAll(() => {
    resetDb();
    if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDatabasePath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("idempotently upserts raw monthly percentage inputs without storing a calculated percentage", () => {
    const { kpiId } = seedKpi("monthly-participation", "percentage", "monthly");
    const input = {
      kpi_id: kpiId,
      reporting_year: 2026,
      reporting_month: 7,
      numerator: 25,
      denominator: 40,
      source_reference: "July survey",
    };

    const first = upsertStrategyObservation(input, null);
    const second = upsertStrategyObservation(input, null);

    expect(second.id).toBe(first.id);
    expect(first).toMatchObject({
      period_type: "monthly",
      period_index: 7,
      scalar_value: null,
      numerator: 25,
      denominator: 40,
    });
    expect(
      getDb()
        .prepare("SELECT scalar_value, numerator, denominator FROM kpi_observations")
        .get(),
    ).toEqual({ scalar_value: null, numerator: 25, denominator: 40 });
    expect(listStrategicAuditEvents({ entity_type: "kpi_observation" })).toHaveLength(1);

    const updated = upsertStrategyObservation({ ...input, numerator: 30 }, null);
    expect(updated.id).toBe(first.id);
    expect(updated.numerator).toBe(30);
    expect(getStrategyObservation(updated.id).numerator).toBe(30);
    expect(
      listStrategyObservations({ kpi_id: kpiId, reporting_year: 2026 }),
    ).toEqual([updated]);
    expect(listStrategicAuditEvents({ entity_type: "kpi_observation" })).toHaveLength(2);
  });

  it("derives the internal annual period and never accepts user month zero", () => {
    const { kpiId } = seedKpi("annual-workshops", "count", "annual");
    const saved = upsertStrategyObservation(
      { kpi_id: kpiId, reporting_year: 2026, value: 14 },
      null,
    );

    expect(saved).toMatchObject({ period_type: "annual", period_index: 0 });
    expect(() =>
      upsertStrategyObservation(
        { kpi_id: kpiId, reporting_year: 2026, reporting_month: 0, value: 14 },
        null,
      ),
    ).toThrow(StrategyValueEntryValidationError);
    expect(() =>
      upsertStrategyObservation(
        { kpi_id: kpiId, reporting_year: 2026, reporting_month: 1, value: 14 },
        null,
      ),
    ).toThrowError(/reporting period/i);
  });

  it("preserves every raw average input and enforces the configuration over-max rule", () => {
    const { kpiId } = seedKpi("annual-satisfaction", "average", "annual");
    const saved = upsertStrategyObservation(
      {
        kpi_id: kpiId,
        reporting_year: 2026,
        average_inputs: {
          method: "total_score",
          respondent_count: 10,
          total_score: 40,
          max_score_per_respondent: 5,
          total_possible_score: 50,
        },
      },
      null,
    );
    expect(saved).toMatchObject({
      scalar_value: null,
      respondent_count: 10,
      total_score: 40,
      max_score_per_respondent: 5,
      total_possible_score: 50,
    });

    expect(() =>
      upsertStrategyObservation(
        {
          kpi_id: kpiId,
          reporting_year: 2027,
          average_inputs: {
            method: "total_score",
            respondent_count: 10,
            total_score: 51,
            total_possible_score: 50,
            allow_over_max: true,
          },
        },
        null,
      ),
    ).toThrowError(/invalid observation values/i);
  });

  it("upserts component entries against their effective parent configuration", () => {
    const config = seedKpi("workforce-participants", "multi_component", "annual");
    const componentId = seedComponent(config, "count");

    const first = upsertStrategyComponentEntry(
      { component_id: componentId, reporting_year: 2026, value: 35 },
      null,
    );
    const updated = upsertStrategyComponentEntry(
      { component_id: componentId, reporting_year: 2026, value: 38 },
      null,
    );

    expect(updated.id).toBe(first.id);
    expect(updated).toMatchObject({
      component_id: componentId,
      kpi_id: config.kpiId,
      scalar_value: 38,
      period_type: "annual",
      period_index: 0,
    });
    expect(getStrategyComponentEntry(updated.id)).toEqual(updated);
    expect(
      listStrategyComponentEntries({
        component_id: componentId,
        reporting_year: 2026,
      }),
    ).toEqual([updated]);
    expect(listStrategicAuditEvents({ entity_type: "kpi_component_entry" })).toHaveLength(2);
  });

  it("validates distributions, creates reusable bands, and keeps first-write label snapshots immutable", () => {
    const { kpiId } = seedKpi("audience-race", "distribution", "annual");
    const first = upsertStrategyDistribution(
      {
        kpi_id: kpiId,
        reporting_year: 2026,
        respondent_count: 10,
        mutually_exclusive: true,
        bands: [
          {
            slug: "white",
            label: "White",
            count: 6,
            display_order: 0,
            derived_group: "white",
          },
          {
            slug: "people-of-color",
            label: "People of color",
            count: 3,
            display_order: 1,
            derived_group: "non_white",
          },
          {
            slug: "declined",
            label: "Declined to answer",
            count: 1,
            display_order: 2,
            is_declined: true,
          },
        ],
      },
      null,
    );
    const colorBand = first.bands.find((band) => band.slug === "people-of-color")!;
    const colorDefinition = listEffectiveDistributionBands({
      kpi_id: kpiId,
      reporting_year: 2026,
    }).find((band) => band.id === colorBand.band_id)!;
    updateStrategyDistributionBand(
      {
        id: colorDefinition.id,
        kpi_id: colorDefinition.kpi_id,
        component_id: colorDefinition.component_id,
        slug: colorDefinition.slug,
        label: "Black, Indigenous, and people of color",
        effective_from_year: colorDefinition.effective_from_year,
        effective_to_year: colorDefinition.effective_to_year,
        display_order: colorDefinition.display_order,
        is_unknown: colorDefinition.is_unknown,
        is_declined: colorDefinition.is_declined,
        derived_group: colorDefinition.derived_group,
      },
      null,
    );

    const updated = upsertStrategyDistribution(
      {
        kpi_id: kpiId,
        reporting_year: 2026,
        respondent_count: 10,
        bands: first.bands.map((band) => ({
          band_id: band.band_id,
          slug: band.slug,
          label:
            band.band_id === colorBand.band_id
              ? "Black, Indigenous, and people of color"
              : band.current_label,
          count: band.count,
          display_order: band.display_order,
          is_unknown: band.is_unknown,
          is_declined: band.is_declined,
          derived_group: band.derived_group,
        })),
      },
      null,
    );
    const renamed = updated.bands.find((band) => band.band_id === colorBand.band_id)!;

    expect(updated.id).toBe(first.id);
    expect(renamed.current_label).toBe("Black, Indigenous, and people of color");
    expect(renamed.label_snapshot).toBe("People of color");
    expect(renamed.derived_group).toBe("non_white");
    expect(getStrategyDistribution(updated.id)).toEqual(updated);
    expect(
      listStrategyDistributions({ kpi_id: kpiId, reporting_year: 2026 }),
    ).toEqual([updated]);
    expect(listStrategicAuditEvents({ entity_type: "distribution_band" })).toHaveLength(4);
    expect(listStrategicAuditEvents({ entity_type: "distribution_observation" })).toHaveLength(1);
  });

  it("rejects invalid demographic totals and user-facing annual month zero", () => {
    const { kpiId } = seedKpi("audience-age", "distribution", "annual");
    const base = {
      kpi_id: kpiId,
      reporting_year: 2026,
      respondent_count: 10,
      bands: [
        { slug: "under-18", label: "Under 18", count: 4, display_order: 0 },
        { slug: "adult", label: "Adult", count: 5, display_order: 1 },
      ],
    };
    expect(() => upsertStrategyDistribution(base, null)).toThrowError(
      /invalid distribution values/i,
    );
    expect(() =>
      upsertStrategyDistribution(
        {
          ...base,
          reporting_month: 0,
          bands: [
            { slug: "under-18", label: "Under 18", count: 4, display_order: 0 },
            { slug: "adult", label: "Adult", count: 6, display_order: 1 },
          ],
        },
        null,
      ),
    ).toThrow(StrategyValueEntryValidationError);
  });

  it("rejects overlapping band versions and band IDs outside the observation year", () => {
    const { kpiId } = seedKpi("audience-band-integrity", "distribution", "annual");
    const original = createStrategyDistributionBand(
      {
        kpi_id: kpiId,
        effective_from_year: 2025,
        effective_to_year: 2026,
        slug: "white",
        label: "White",
        display_order: 0,
      },
      null,
    );
    const later = createStrategyDistributionBand(
      {
        kpi_id: kpiId,
        effective_from_year: 2027,
        effective_to_year: 2029,
        slug: "white",
        label: "White",
        display_order: 0,
      },
      null,
    );

    expect(() =>
      createStrategyDistributionBand(
        {
          kpi_id: kpiId,
          effective_from_year: 2026,
          effective_to_year: 2028,
          slug: "white",
          label: "White",
          display_order: 0,
        },
        null,
      ),
    ).toThrowError(/overlaps this effective period/i);
    expect(() =>
      updateStrategyDistributionBand(
        {
          id: later.id,
          kpi_id: later.kpi_id,
          component_id: later.component_id,
          slug: later.slug,
          label: later.label,
          effective_from_year: 2026,
          effective_to_year: later.effective_to_year,
          display_order: later.display_order,
          is_unknown: later.is_unknown,
          is_declined: later.is_declined,
          derived_group: later.derived_group,
        },
        null,
      ),
    ).toThrowError(/overlaps this effective period/i);

    const future = createStrategyDistributionBand(
      {
        kpi_id: kpiId,
        effective_from_year: 2028,
        effective_to_year: 2029,
        slug: "future-band",
        label: "Future band",
        display_order: 1,
      },
      null,
    );
    const expired = createStrategyDistributionBand(
      {
        kpi_id: kpiId,
        effective_from_year: 2025,
        effective_to_year: 2025,
        slug: "expired-band",
        label: "Expired band",
        display_order: 2,
      },
      null,
    );

    for (const band of [future, expired]) {
      expect(() =>
        upsertStrategyDistribution(
          {
            kpi_id: kpiId,
            reporting_year: 2026,
            respondent_count: 10,
            bands: [
              {
                band_id: band.id,
                slug: band.slug,
                label: band.label,
                count: 10,
                display_order: band.display_order,
              },
            ],
          },
          null,
        ),
      ).toThrowError(/not effective for this reporting year/i);
    }

    const boundaryYear = upsertStrategyDistribution(
      {
        kpi_id: kpiId,
        reporting_year: 2026,
        respondent_count: 10,
        bands: [
          {
            band_id: original.id,
            slug: original.slug,
            label: original.label,
            count: 10,
            display_order: original.display_order,
          },
        ],
      },
      null,
    );
    expect(boundaryYear.bands).toEqual([
      expect.objectContaining({ band_id: original.id }),
    ]);

    const { kpiId: implicitBandKpiId } = seedKpi(
      "audience-implicit-band-integrity",
      "distribution",
      "annual",
    );
    createStrategyDistributionBand(
      {
        kpi_id: implicitBandKpiId,
        effective_from_year: 2028,
        effective_to_year: 2029,
        slug: "white",
        label: "White",
        display_order: 0,
      },
      null,
    );
    expect(() =>
      upsertStrategyDistribution(
        {
          kpi_id: implicitBandKpiId,
          reporting_year: 2026,
          respondent_count: 10,
          bands: [{ slug: "white", label: "White", count: 10, display_order: 0 }],
        },
        null,
      ),
    ).toThrowError(/overlaps this effective period/i);

    const { kpiId: restoreKpiId } = seedKpi(
      "audience-restored-band-integrity",
      "distribution",
      "annual",
    );
    const archived = createStrategyDistributionBand(
      {
        kpi_id: restoreKpiId,
        effective_from_year: 2025,
        effective_to_year: 2029,
        slug: "white",
        label: "White",
        display_order: 0,
      },
      null,
    );
    archiveStrategyDistributionBand(archived.id, null);
    createStrategyDistributionBand(
      {
        kpi_id: restoreKpiId,
        effective_from_year: 2026,
        effective_to_year: 2028,
        slug: "white",
        label: "White",
        display_order: 0,
      },
      null,
    );
    expect(() => restoreStrategyDistributionBand(archived.id, null)).toThrowError(
      /overlaps this effective period/i,
    );

    expect(listEffectiveDistributionBands({ kpi_id: kpiId, reporting_year: 2026 })).toEqual([
      expect.objectContaining({ id: original.id }),
    ]);
  });

  it("exposes effective bands and supports audited create, update, reorder, archive, and restore", () => {
    const { kpiId } = seedKpi("audience-income-bands", "distribution", "annual");
    const low = createStrategyDistributionBand(
      {
        kpi_id: kpiId,
        effective_from_year: 2025,
        effective_to_year: 2029,
        slug: "lower-income",
        label: "Lower income",
        display_order: 0,
      },
      null,
    );
    const high = createStrategyDistributionBand(
      {
        kpi_id: kpiId,
        effective_from_year: 2025,
        effective_to_year: 2029,
        slug: "higher-income",
        label: "Higher income",
        display_order: 1,
      },
      null,
    );
    const renamed = updateStrategyDistributionBand(
      {
        id: high.id,
        kpi_id: high.kpi_id,
        component_id: high.component_id,
        slug: high.slug,
        label: "Higher income range",
        effective_from_year: high.effective_from_year,
        effective_to_year: high.effective_to_year,
        display_order: high.display_order,
        is_unknown: high.is_unknown,
        is_declined: high.is_declined,
        derived_group: high.derived_group,
      },
      null,
    );
    const reordered = reorderStrategyDistributionBands(
      {
        kpi_id: kpiId,
        reporting_year: 2026,
        ordered_band_ids: [renamed.id, low.id],
      },
      null,
    );

    expect(reordered.map((band) => [band.id, band.display_order])).toEqual([
      [renamed.id, 0],
      [low.id, 1],
    ]);
    const distribution = upsertStrategyDistribution(
      {
        kpi_id: kpiId,
        reporting_year: 2026,
        respondent_count: 10,
        bands: reordered.map((band, index) => ({
          band_id: band.id,
          slug: band.slug,
          label: band.label,
          count: index === 0 ? 6 : 4,
          display_order: band.display_order,
          is_unknown: band.is_unknown,
          is_declined: band.is_declined,
          derived_group: band.derived_group,
        })),
      },
      null,
    );
    expect(distribution.bands.map((band) => band.label_snapshot)).toEqual([
      "Higher income range",
      "Lower income",
    ]);

    archiveStrategyDistributionBand(renamed.id, null);
    expect(
      listEffectiveDistributionBands({ kpi_id: kpiId, reporting_year: 2026 }),
    ).toHaveLength(1);
    expect(
      listEffectiveDistributionBands({
        kpi_id: kpiId,
        reporting_year: 2026,
        include_archived: true,
      }),
    ).toHaveLength(2);
    expect(
      getDb()
        .prepare(
          "SELECT band_label_snapshot FROM distribution_values WHERE band_id = ?",
        )
        .get(renamed.id),
    ).toEqual({ band_label_snapshot: "Higher income range" });

    restoreStrategyDistributionBand(renamed.id, null);
    expect(
      listEffectiveDistributionBands({ kpi_id: kpiId, reporting_year: 2026 }),
    ).toHaveLength(2);
    const bandEvents = listStrategicAuditEvents({ entity_type: "distribution_band" });
    expect(bandEvents).toHaveLength(7);
    const lifecycleEvents = bandEvents.filter(
      (event) =>
        event.entity_id === renamed.id &&
        (event.event_type === "archive" || event.event_type === "restore"),
    );
    expect(lifecycleEvents.map((event) => event.event_type)).toEqual(
      expect.arrayContaining(["archive", "restore"]),
    );
    for (const event of lifecycleEvents) {
      expect(event.entity_display_name).toBe("Higher income range");
      expect(event.parent_priority_name).toBe("Reimagine Visitor Experience");
      expect(event.previous_value).not.toBeNull();
      expect(event.new_value).not.toBeNull();
      expect(event.occurred_at).toEqual(expect.any(String));
    }
  });

  it("deletes all three value types while retaining deletion-safe audit snapshots", () => {
    const scalar = seedKpi("visitor-upgrades", "cumulative", "cumulative");
    const observation = upsertStrategyObservation(
      { kpi_id: scalar.kpiId, reporting_year: 2026, value: 2 },
      null,
    );
    const multi = seedKpi("workforce-outcomes", "multi_component", "annual");
    const componentId = seedComponent(multi, "count", "Participants graduating");
    const component = upsertStrategyComponentEntry(
      { component_id: componentId, reporting_year: 2026, value: 12 },
      null,
    );
    const distributionKpi = seedKpi("visitor-income", "distribution", "annual");
    const distribution = upsertStrategyDistribution(
      {
        kpi_id: distributionKpi.kpiId,
        reporting_year: 2026,
        respondent_count: 5,
        bands: [
          { slug: "known", label: "Known income", count: 4, display_order: 0 },
          { slug: "unknown", label: "Unknown", count: 1, display_order: 1, is_unknown: true },
        ],
      },
      null,
    );

    deleteStrategyObservation(observation.id, null);
    deleteStrategyComponentEntry(component.id, null);
    deleteStrategyDistribution(distribution.id, null);

    expect(getDb().prepare("SELECT * FROM kpi_observations").all()).toEqual([]);
    expect(getDb().prepare("SELECT * FROM kpi_component_entries").all()).toEqual([]);
    expect(getDb().prepare("SELECT * FROM distribution_observations").all()).toEqual([]);
    expect(getDb().prepare("SELECT * FROM distribution_values").all()).toEqual([]);
    const deletes = listStrategicAuditEvents({ event_type: "delete" });
    expect(deletes).toHaveLength(3);
    expect(JSON.stringify(deletes)).toContain("Known income");
    expect(JSON.stringify(deletes)).toContain("Participants graduating");
    expect(JSON.stringify(deletes)).toContain("KPI visitor-upgrades");
  });
});
