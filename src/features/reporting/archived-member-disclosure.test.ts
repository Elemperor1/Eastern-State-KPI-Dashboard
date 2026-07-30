import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb } from "@/lib/db";
import { bootstrapTestInstallation } from "@/features/installation/test-fixture";
import {
  archiveCategory,
  archiveKPI,
  restoreCategory,
  restoreKPI,
} from "@/features/catalog/server";
import {
  listKpiIdsWithArchivedIntervalValues,
  listStrategicGoals,
  listStrategicGoalsForReportingDisclosure,
  upsertStrategyComponentEntry,
  upsertStrategyDistribution,
  upsertStrategyObservation,
} from "@/features/strategy/server";
import {
  listStrategicAuditEvents,
  recordStrategicAuditEvent,
} from "@/features/strategy/audit";
import { buildStrategicDashboardSummary } from "./strategy-summary";

describe("archived-member disclosure (NOV-C5)", () => {
  let tmpDir: string;
  let originalDbPath: string | undefined;
  let databaseIndex = 0;
  let categoryId: number;
  let kpiId: number;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-disclosure-test-"));
    originalDbPath = process.env.DATABASE_PATH;
  });

  beforeEach(() => {
    resetDb();
    process.env.DATABASE_PATH = path.join(tmpDir, `disclosure-${databaseIndex++}.db`);
    bootstrapTestInstallation();
    const db = getDb();
    categoryId = Number(
      db
        .prepare(
          `INSERT INTO categories (plan_id, slug, name, sort_order)
           VALUES ((SELECT id FROM strategic_plans WHERE status = 'active'),
                   'visitor-experience', 'Visitor Experience', 1)`,
        )
        .run().lastInsertRowid,
    );
    kpiId = Number(
      db
        .prepare(
          `INSERT INTO kpis (
             category_id, slug, name, unit, unit_type, reporting_frequency,
             direction, sort_order
           ) VALUES (?, 'guided-tours', 'Guided tours', 'tours', 'count',
                     'annual', 'higher', 1)`,
        )
        .run(categoryId).lastInsertRowid,
    );
    const configurationId = Number(
      db
        .prepare(
          `INSERT INTO kpi_measurement_configs (
             kpi_id, effective_from_year, effective_to_year, measurement_type,
             unit, reporting_frequency, aggregation_method,
             configuration_status
           ) VALUES (?, 2025, 2029, 'count', 'tours', 'annual', 'none', 'active')`,
        )
        .run(kpiId).lastInsertRowid,
    );
    const goalId = Number(
      db
        .prepare(
          `INSERT INTO strategic_goals (
             priority_id, slug, name, plan_start_year, plan_end_year,
             configuration_status
           ) VALUES (?, 'tour-goal', 'Tour goal', 2025, 2029, 'active')`,
        )
        .run(categoryId).lastInsertRowid,
    );
    db.prepare(
      `INSERT INTO goal_kpis (goal_id, kpi_id, effective_from_year, effective_to_year)
       VALUES (?, ?, 2025, 2029)`,
    ).run(goalId, kpiId);
    db.prepare(
      `INSERT INTO kpi_observations (
         kpi_id, configuration_id, year, period_type, period_index, scalar_value
       ) VALUES (?, ?, 2026, 'annual', 0, 40)`,
    ).run(kpiId, configurationId);
  });

  afterAll(() => {
    resetDb();
    if (originalDbPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDbPath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("surfaces archived goal members through the read model and summary", () => {
    const baseline = listStrategicGoals({ year: 2026 });
    expect(baseline[0]?.members).toHaveLength(1);
    expect(baseline[0]?.archived_members).toEqual([]);

    archiveKPI(kpiId);

    const archived = listStrategicGoals({ year: 2026 });
    expect(archived[0]?.members).toHaveLength(0);
    expect(archived[0]?.archived_members).toEqual([
      {
        kpi_id: kpiId,
        kpi_slug: "guided-tours",
        kpi_name: "Guided tours",
      },
    ]);

    const summary = buildStrategicDashboardSummary({
      goals: archived,
      kpis: [],
      selectedYear: 2026,
    });
    expect(summary.goals[0]?.result.excludedKpis).toContainEqual({
      id: String(kpiId),
      label: "Guided tours",
      reason: "archived",
    });
    expect(summary.goals[0]?.result.exclusionReasons).toContain("archived");

    restoreKPI(kpiId);
    const restored = listStrategicGoals({ year: 2026 });
    expect(restored[0]?.members).toHaveLength(1);
    expect(restored[0]?.archived_members).toEqual([]);
  });

  it("flags values recorded inside an archived interval as restored-with-hidden-data", () => {
    expect(listKpiIdsWithArchivedIntervalValues([kpiId]).has(kpiId)).toBe(false);

    archiveKPI(kpiId);
    getDb()
      .prepare(
        `UPDATE kpi_observations
         SET scalar_value = 999
         WHERE kpi_id = ?`,
      )
      .run(kpiId);
    recordStrategicAuditEvent({
      entity_type: "kpi_observation",
      entity_id: 1,
      event_type: "update",
      entity_display_name: "Guided tours",
      previous_value: { kpi_id: kpiId, scalar_value: 40 },
      new_value: { kpi_id: kpiId, scalar_value: 999 },
    });
    restoreKPI(kpiId);

    expect(listKpiIdsWithArchivedIntervalValues([kpiId]).has(kpiId)).toBe(true);
  });

  it("does not flag a pre-archive value created in the same timestamp second", () => {
    archiveKPI(kpiId);
    restoreKPI(kpiId);

    expect(listKpiIdsWithArchivedIntervalValues([kpiId]).has(kpiId)).toBe(false);
  });

  it.each([
    ["Measure", "kpis", "id", "is_active = 0,"],
    ["Strategic Priority", "categories", "id", ""],
  ] as const)(
    "detects a value written while a %s archive predates retained lifecycle audit",
    (_label, table, idColumn, extraAssignment) => {
      const entityId = table === "kpis" ? kpiId : categoryId;
      getDb()
        .prepare(
          `UPDATE ${table}
           SET ${extraAssignment} archived_at = datetime('now')
           WHERE ${idColumn} = ?`,
        )
        .run(entityId);
      recordStrategicAuditEvent({
        entity_type: "kpi_observation",
        entity_id: 1,
        event_type: "update",
        entity_display_name: "Guided tours",
        previous_value: { kpi_id: kpiId, scalar_value: 40 },
        new_value: { kpi_id: kpiId, scalar_value: 999 },
      });

      expect(listKpiIdsWithArchivedIntervalValues([kpiId]).has(kpiId)).toBe(
        true,
      );
    },
  );

  it.each(["Measure", "Strategic Priority"] as const)(
    "derives the pre-window %s archive state from a first retained restore event",
    (entityType) => {
      if (entityType === "Measure") {
        getDb()
          .prepare(
            `UPDATE kpis
             SET archived_at = datetime('now'), is_active = 0
             WHERE id = ?`,
          )
          .run(kpiId);
      } else {
        getDb()
          .prepare(
            `UPDATE categories
             SET archived_at = datetime('now')
             WHERE id = ?`,
          )
          .run(categoryId);
      }
      recordStrategicAuditEvent({
        entity_type: "kpi_observation",
        entity_id: 1,
        event_type: "update",
        entity_display_name: "Guided tours",
        previous_value: { kpi_id: kpiId, scalar_value: 40 },
        new_value: { kpi_id: kpiId, scalar_value: 999 },
      });
      if (entityType === "Measure") restoreKPI(kpiId);
      else restoreCategory(categoryId);

      expect(listKpiIdsWithArchivedIntervalValues([kpiId]).has(kpiId)).toBe(
        true,
      );
    },
  );

  it.each(["Measure", "Strategic Priority"] as const)(
    "lets a retained first %s archive event override the current archived row",
    (entityType) => {
      upsertStrategyObservation(
        { kpi_id: kpiId, reporting_year: 2026, value: 50 },
        null,
      );
      if (entityType === "Measure") archiveKPI(kpiId);
      else archiveCategory(categoryId);

      expect(listKpiIdsWithArchivedIntervalValues([kpiId]).has(kpiId)).toBe(
        false,
      );
    },
  );

  it.each([
    ["kpi_component_entry", "create"],
    ["distribution_observation", "update"],
  ] as const)(
    "detects %s %s audit writes during an archived Strategic Priority interval",
    (entityType, eventType) => {
      archiveCategory(categoryId);
      recordStrategicAuditEvent({
        entity_type: entityType,
        entity_id: entityType === "kpi_component_entry" ? 71 : 72,
        event_type: eventType,
        entity_display_name: "Guided tours value",
        previous_value:
          eventType === "update" ? { kpi_id: kpiId, scalar_value: 1 } : null,
        new_value: { kpi_id: kpiId, scalar_value: 2 },
      });
      restoreCategory(categoryId);

      expect(listKpiIdsWithArchivedIntervalValues([kpiId]).has(kpiId)).toBe(
        true,
      );
    },
  );

  it("resolves KPI ids from production scalar and multi-component value snapshots", () => {
    upsertStrategyObservation(
      { kpi_id: kpiId, reporting_year: 2026, value: 50 },
      null,
    );
    const scalarEvent = listStrategicAuditEvents({
      entity_type: "kpi_observation",
      event_type: "update",
    })[0]!;
    expect(scalarEvent.new_value).toMatchObject({ kpi_id: kpiId });

    const db = getDb();
    const multiKpiId = Number(
      db
        .prepare(
          `INSERT INTO kpis (
             category_id, slug, name, unit, unit_type, reporting_frequency,
             direction, sort_order
           ) VALUES (?, 'visitor-mix', 'Visitor mix', 'people', 'count',
                     'annual', 'higher', 2)`,
        )
        .run(categoryId).lastInsertRowid,
    );
    const multiConfigurationId = Number(
      db
        .prepare(
          `INSERT INTO kpi_measurement_configs (
             kpi_id, effective_from_year, effective_to_year, measurement_type,
             unit, reporting_frequency, aggregation_method,
             configuration_status
           ) VALUES (?, 2025, 2029, 'multi_component', 'people', 'annual',
                     'none', 'active')`,
        )
        .run(multiKpiId).lastInsertRowid,
    );
    const countComponentId = Number(
      db
        .prepare(
          `INSERT INTO kpi_components (
             kpi_id, configuration_id, slug, label, measurement_type, unit,
             display_order, configuration_status
           ) VALUES (?, ?, 'visitors', 'Visitors', 'count', 'people', 0, 'active')`,
        )
        .run(multiKpiId, multiConfigurationId).lastInsertRowid,
    );
    const distributionComponentId = Number(
      db
        .prepare(
          `INSERT INTO kpi_components (
             kpi_id, configuration_id, slug, label, measurement_type, unit,
             display_order, configuration_status
           ) VALUES (?, ?, 'audience', 'Audience', 'distribution', 'people',
                     1, 'active')`,
        )
        .run(multiKpiId, multiConfigurationId).lastInsertRowid,
    );
    const componentEntry = upsertStrategyComponentEntry(
      {
        component_id: countComponentId,
        reporting_year: 2026,
        value: 25,
      },
      null,
    );
    const distribution = upsertStrategyDistribution(
      {
        kpi_id: multiKpiId,
        component_id: distributionComponentId,
        reporting_year: 2026,
        respondent_count: 25,
        mutually_exclusive: true,
        bands: [
          {
            slug: "adult",
            label: "Adult",
            count: 25,
            display_order: 0,
          },
        ],
      },
      null,
    );
    const componentEvent = listStrategicAuditEvents({
      entity_type: "kpi_component_entry",
      entity_id: componentEntry.id,
      event_type: "create",
    })[0]!;
    const distributionEvent = listStrategicAuditEvents({
      entity_type: "distribution_observation",
      entity_id: distribution.id,
      event_type: "create",
    })[0]!;
    expect(componentEvent.new_value).toMatchObject({
      kpi_id: multiKpiId,
      component_id: countComponentId,
    });
    expect(distributionEvent.new_value).toMatchObject({
      kpi_id: multiKpiId,
      component_id: distributionComponentId,
    });

    archiveKPI(kpiId);
    recordStrategicAuditEvent({
      entity_type: scalarEvent.entity_type,
      entity_id: scalarEvent.entity_id,
      event_type: "update",
      entity_display_name: scalarEvent.entity_display_name,
      previous_value: scalarEvent.previous_value,
      new_value: scalarEvent.new_value,
    });
    restoreKPI(kpiId);
    archiveKPI(multiKpiId);
    for (const event of [componentEvent, distributionEvent]) {
      recordStrategicAuditEvent({
        entity_type: event.entity_type,
        entity_id: event.entity_id,
        event_type: "update",
        entity_display_name: event.entity_display_name,
        previous_value: event.new_value,
        new_value: event.new_value,
      });
    }
    restoreKPI(multiKpiId);

    expect(
      listKpiIdsWithArchivedIntervalValues([kpiId, multiKpiId]),
    ).toEqual(new Set([kpiId, multiKpiId]));
  });

  it("keeps the default goal read narrow while disclosure retains an archived priority link", () => {
    archiveCategory(categoryId);

    expect(listStrategicGoals({ year: 2026 })).toEqual([]);
    const disclosure = listStrategicGoalsForReportingDisclosure({ year: 2026 });
    expect(disclosure).toHaveLength(1);
    expect(disclosure[0]?.members).toEqual([]);
    expect(disclosure[0]?.archived_members).toEqual([
      {
        kpi_id: kpiId,
        kpi_slug: "guided-tours",
        kpi_name: "Guided tours",
      },
    ]);
  });
});
