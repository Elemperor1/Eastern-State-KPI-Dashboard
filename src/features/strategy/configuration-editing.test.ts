import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb } from "@/lib/db";
import { bootstrapTestInstallation } from "@/features/installation/test-fixture";
import {
  getActiveInstallation,
  updateActiveInstallation,
} from "@/features/installation/server";
import {
  createMeasurementConfiguration,
  createSuccessorMeasurementConfiguration,
  createSuccessorStrategicGoal,
  createSuccessorStrategicGoalMembership,
  createStrategicTarget,
  createStrategyComponent,
  reorderStrategyComponents,
  StrategyEditConflictError,
  StrategyEditNotFoundError,
  StrategyEditValidationError,
  updateMeasurementConfiguration,
  updateStrategicGoalMembership,
  updateStrategicGoalSettings,
  updateStrategicTarget,
  updateStrategyComponent,
} from "./configuration-editing";
import { listStrategicAuditEvents } from "./audit";
import {
  archiveComponent,
  archiveMeasurementConfig,
  archiveStrategicGoal,
  archiveTarget,
  restoreComponent,
  restoreMeasurementConfig,
  restoreStrategicGoal,
  restoreTarget,
} from "./mutations";
import {
  getEffectiveMeasurementConfig,
  listStrategicAuditIdentitiesForKpi,
  listEffectiveTargetsForKpi,
  listStrategicGoals,
} from "./queries";
import { resolveEffectiveTargetPolicy } from "./target-policy";

/** Supports the configuration test scenario. */
function configuration(kpiId: number, overrides: Record<string, unknown> = {}) {
  return {
    kpi_id: kpiId,
    measurement_type: "count",
    unit: "items",
    numerator_label: null,
    denominator_label: null,
    fixed_denominator: null,
    baseline_value: null,
    reporting_frequency: "annual",
    aggregation_method: "none",
    board_level_status: "not_reported",
    calculation_precision: 1,
    allow_score_over_max: false,
    effective_start_year: 2025,
    effective_end_year: 2029,
    configuration_status: "active",
    unresolved_question: null,
    owner: null,
    due_date: null,
    resolution_notes: null,
    source_reference: "Strategy test",
    last_reviewed_date: null,
    ...overrides,
  };
}

/** Supports the expect historical semantics conflict test scenario. */
function expectHistoricalSemanticsConflict(operation: () => unknown): void {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(StrategyEditConflictError);
    expect(error).toMatchObject({ code: "historical_semantics_conflict" });
    return;
  }
  throw new Error("Expected a historical semantics conflict.");
}

/** Supports the get measurement range test scenario. */
function getMeasurementRange(id: number) {
  return getDb()
    .prepare(
      `SELECT effective_from_year, effective_to_year
       FROM kpi_measurement_configs WHERE id = ?`,
    )
    .get(id);
}

/** Reads the current optimistic-concurrency token for a strategy row. */
function currentRevision(
  table: "goal_kpis" | "kpi_measurement_configs",
  id: number,
): string {
  return String(
    (
      getDb()
        .prepare(`SELECT updated_at FROM ${table} WHERE id = ?`)
        .get(id) as { updated_at: string }
    ).updated_at,
  );
}

describe("strategic configuration editing repository", () => {
  let tmpDir: string;
  let originalDbPath: string | undefined;
  let databaseIndex = 0;
  let actorId: number;
  let categoryId: number;
  let countKpiId: number;
  let multiKpiId: number;
  let goalId: number;
  let membershipId: number;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-config-edit-test-"));
    originalDbPath = process.env.DATABASE_PATH;
  });

  beforeEach(() => {
    resetDb();
    process.env.DATABASE_PATH = path.join(tmpDir, `edit-${databaseIndex++}.db`);
    bootstrapTestInstallation();
    const db = getDb();
    actorId = Number(
      db
        .prepare(
          `INSERT INTO users (email, name, password_hash, role)
           VALUES ('strategy-admin@example.org', 'Strategy Admin', 'hash', 'admin')`,
        )
        .run().lastInsertRowid,
    );
    categoryId = Number(
      db
        .prepare(
          `INSERT INTO categories (plan_id, slug, name, sort_order)
           VALUES ((SELECT id FROM strategic_plans WHERE status = 'active'),
                   'visitor-experience', 'Visitor Experience', 1)`,
        )
        .run().lastInsertRowid,
    );
    const insertKpi = db.prepare(
      `INSERT INTO kpis (
         category_id, slug, name, unit, unit_type, reporting_frequency,
         direction, sort_order
       ) VALUES (?, ?, ?, ?, 'count', 'annual', 'higher', ?)`,
    );
    countKpiId = Number(
      insertKpi.run(categoryId, "count-kpi", "Count KPI", "items", 1)
        .lastInsertRowid,
    );
    multiKpiId = Number(
      insertKpi.run(categoryId, "multi-kpi", "Multi KPI", "items", 2)
        .lastInsertRowid,
    );
    goalId = Number(
      db
        .prepare(
          `INSERT INTO strategic_goals (
             priority_id, slug, name, plan_start_year, plan_end_year,
             configuration_status, created_by, updated_by
           ) VALUES (?, 'test-goal', 'Test Goal', 2025, 2029, 'active', ?, ?)`,
        )
        .run(categoryId, actorId, actorId).lastInsertRowid,
    );
    const insertMembership = db.prepare(
      `INSERT INTO goal_kpis (
         goal_id, kpi_id, effective_from_year, effective_to_year,
         created_by, updated_by
       ) VALUES (?, ?, 2025, 2029, ?, ?)`,
    );
    membershipId = Number(
      insertMembership.run(goalId, countKpiId, actorId, actorId)
        .lastInsertRowid,
    );
    insertMembership.run(goalId, multiKpiId, actorId, actorId);
  });

  afterAll(() => {
    resetDb();
    if (originalDbPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDbPath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates and updates configurations transactionally and rejects overlaps", () => {
    const created = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );
    expect(created).toMatchObject({
      kpi_id: countKpiId,
      effective_from_year: 2025,
      effective_to_year: 2029,
      configuration_status: "active",
    });
    expect(() =>
      createMeasurementConfiguration(
        configuration(countKpiId, {
          effective_start_year: 2028,
          effective_end_year: 2030,
        }),
        actorId,
      ),
    ).toThrow(StrategyEditConflictError);
    expect(
      getDb()
        .prepare("SELECT COUNT(*) AS count FROM kpi_measurement_configs")
        .get(),
    ).toEqual({ count: 1 });

    const updated = updateMeasurementConfiguration(
      {
        id: created.id,
        calculation_precision: 2,
        baseline_value: 0,
        owner: "Evaluation team",
      },
      actorId,
    );
    expect(updated).toMatchObject({
      calculation_precision: 2,
      baseline_value: 0,
      owner: "Evaluation team",
    });
    const events = listStrategicAuditEvents({
      entity_type: "measurement_config",
      entity_id: created.id,
    });
    expect(events.map((event) => event.event_type)).toEqual(["update", "create"]);
    expect(events[0]?.previous_value).toMatchObject({
      calculation_precision: 1,
      baseline_value: null,
    });
    expect(events[0]?.new_value).toMatchObject({
      calculation_precision: 2,
      baseline_value: 0,
    });
  });

  it("creates a successor definition while preserving the historical predecessor", () => {
    const predecessor = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );
    getDb()
      .prepare(
        `INSERT INTO monthly_entries (kpi_id, year, month, value, updated_by)
         VALUES (?, 2026, 0, 12, ?)`,
      )
      .run(countKpiId, actorId);

    const result = createSuccessorMeasurementConfiguration(
      {
        predecessor_id: predecessor.id,
        expected_revision: predecessor.updated_at,
        successor: configuration(countKpiId, {
          effective_start_year: 2027,
          effective_end_year: 2029,
          unit: "visitors",
          source_reference: "2027 measurement protocol",
        }),
      },
      actorId,
    );

    expect(result.predecessor).toMatchObject({
      id: predecessor.id,
      effective_from_year: 2025,
      effective_to_year: 2026,
      unit: "items",
    });
    expect(result.successor).toMatchObject({
      kpi_id: countKpiId,
      effective_from_year: 2027,
      effective_to_year: 2029,
      unit: "visitors",
    });
    expect(getEffectiveMeasurementConfig(countKpiId, 2026)).toMatchObject({
      id: predecessor.id,
      unit: "items",
    });
    expect(getEffectiveMeasurementConfig(countKpiId, 2027)).toMatchObject({
      id: result.successor.id,
      unit: "visitors",
    });
  });

  it("rejects a successor that would reinterpret an incompatible future target", () => {
    const predecessor = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );
    createStrategicTarget(
      {
        kpi_id: countKpiId,
        target_scope: "full_plan",
        target_year: 2029,
        target_value: 500,
        target_description: "Complete 500 items.",
        configuration_status: "active",
      },
      actorId,
    );

    expect(() =>
      createSuccessorMeasurementConfiguration(
        {
          predecessor_id: predecessor.id,
          expected_revision: predecessor.updated_at,
          successor: configuration(countKpiId, {
            effective_start_year: 2027,
            measurement_type: "percentage",
            unit: "%",
            numerator_label: "Completed",
            denominator_label: "Eligible",
          }),
        },
        actorId,
      ),
    ).toThrow(
      expect.objectContaining({ code: "successor_target_incompatible" }),
    );
    expect(getMeasurementRange(predecessor.id)).toEqual({
      effective_from_year: 2025,
      effective_to_year: 2029,
    });
    expect(
      getDb()
        .prepare("SELECT COUNT(*) AS count FROM kpi_measurement_configs")
        .get(),
    ).toEqual({ count: 1 });
  });

  it("rejects a numerically compatible full-plan target that crosses measurement semantics", () => {
    const predecessor = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );
    createStrategicTarget(
      {
        kpi_id: countKpiId,
        target_scope: "full_plan",
        target_year: 2029,
        target_value: 50,
        target_description: "Complete 50 items.",
        configuration_status: "active",
      },
      actorId,
    );

    expect(() =>
      createSuccessorMeasurementConfiguration(
        {
          predecessor_id: predecessor.id,
          expected_revision: predecessor.updated_at,
          successor: configuration(countKpiId, {
            effective_start_year: 2027,
            measurement_type: "percentage",
            unit: "%",
            numerator_label: "Completed",
            denominator_label: "Eligible",
          }),
        },
        actorId,
      ),
    ).toThrow(
      expect.objectContaining({
        code: "target_configuration_semantics_conflict",
      }),
    );
    expect(getMeasurementRange(predecessor.id)).toEqual({
      effective_from_year: 2025,
      effective_to_year: 2029,
    });
    expect(
      getDb()
        .prepare("SELECT COUNT(*) AS count FROM kpi_measurement_configs")
        .get(),
    ).toEqual({ count: 1 });
  });

  it("requires full-plan boundary targets before finalizing a semantic successor target", () => {
    const predecessor = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );
    createSuccessorMeasurementConfiguration(
      {
        predecessor_id: predecessor.id,
        expected_revision: predecessor.updated_at,
        successor: configuration(countKpiId, {
          effective_start_year: 2027,
          measurement_type: "percentage",
          unit: "%",
          numerator_label: "Completed",
          denominator_label: "Eligible",
        }),
      },
      actorId,
    );

    expect(() =>
      createStrategicTarget(
        {
          kpi_id: countKpiId,
          target_scope: "full_plan",
          target_year: 2029,
          target_value: 75,
          target_description: "Reach 75 percent.",
          configuration_status: "active",
        },
        actorId,
      ),
    ).toThrow(
      expect.objectContaining({
        code: "target_configuration_semantics_conflict",
      }),
    );
    expect(
      getDb()
        .prepare("SELECT COUNT(*) AS count FROM kpi_targets")
        .get(),
    ).toEqual({ count: 0 });

    const predecessorBoundary = createStrategicTarget(
      {
        kpi_id: countKpiId,
        target_scope: "full_plan",
        target_year: 2026,
        target_value: null,
        target_description: "Predecessor target pending.",
        configuration_status: "needs_target",
      },
      actorId,
    );
    const successorTarget = createStrategicTarget(
      {
        kpi_id: countKpiId,
        target_scope: "full_plan",
        target_year: 2029,
        target_value: 75,
        target_description: "Reach 75 percent.",
        configuration_status: "active",
      },
      actorId,
    );
    expect(
      updateStrategicTarget(
        {
          id: predecessorBoundary.id,
          target_value: 50,
          target_description: "Complete 50 items.",
          configuration_status: "active",
        },
        actorId,
      ),
    ).toMatchObject({ target_value: 50 });
    const targets = listEffectiveTargetsForKpi(countKpiId, 2027);
    expect(resolveEffectiveTargetPolicy({
      targets,
      reportingYear: 2025,
      measurementType: "count",
      parentConfigurationStatus: "active",
    }).effective.target?.id).toBe(predecessorBoundary.id);
    expect(resolveEffectiveTargetPolicy({
      targets,
      reportingYear: 2027,
      measurementType: "percentage",
      parentConfigurationStatus: "active",
    }).effective.target?.id).toBe(successorTarget.id);
  });

  it("rejects measurement changes that would strand future distribution artifacts", () => {
    const distributionConfig = createMeasurementConfiguration(
      configuration(countKpiId, {
        measurement_type: "distribution",
      }),
      actorId,
    );
    getDb()
      .prepare(
        `INSERT INTO distribution_bands (
           kpi_id, component_id, slug, label, effective_from_year,
           effective_to_year, display_order, created_by, updated_by
         ) VALUES (?, NULL, 'member', 'Member', 2025, 2029, 0, ?, ?)`,
      )
      .run(countKpiId, actorId, actorId);
    expect(() =>
      createSuccessorMeasurementConfiguration(
        {
          predecessor_id: distributionConfig.id,
          expected_revision: distributionConfig.updated_at,
          successor: configuration(countKpiId, {
            effective_start_year: 2027,
          }),
        },
        actorId,
      ),
    ).toThrow(
      expect.objectContaining({
        code: "successor_distribution_bands_incompatible",
      }),
    );

    const multiConfig = createMeasurementConfiguration(
      configuration(multiKpiId, {
        measurement_type: "multi_component",
        aggregation_method: "none",
      }),
      actorId,
    );
    const component = createStrategyComponent(
      {
        configuration_id: multiConfig.id,
        slug: "future-component",
        label: "Future component",
        measurement_type: "count",
        unit: "items",
        display_order: 0,
        configuration_status: "draft",
      },
      actorId,
    );
    createStrategicTarget(
      {
        component_id: component.id,
        target_scope: "annual",
        reporting_year: 2028,
        target_year: 2028,
        target_value: 8,
        target_description: "Complete eight items.",
        configuration_status: "active",
      },
      actorId,
    );
    expect(() =>
      createSuccessorMeasurementConfiguration(
        {
          predecessor_id: multiConfig.id,
          expected_revision: multiConfig.updated_at,
          successor: configuration(multiKpiId, {
            effective_start_year: 2027,
          }),
        },
        actorId,
      ),
    ).toThrow(
      expect.objectContaining({
        code: "successor_component_artifacts_incompatible",
      }),
    );
  });

  it("clones coherent multi-component definitions without duplicating history", () => {
    const predecessor = createMeasurementConfiguration(
      configuration(multiKpiId, {
        measurement_type: "multi_component",
        aggregation_method: "none",
      }),
      actorId,
    );
    const countComponent = createStrategyComponent(
      {
        configuration_id: predecessor.id,
        slug: "completed-projects",
        label: "Completed projects",
        measurement_type: "count",
        unit: "projects",
        display_order: 0,
        configuration_status: "draft",
      },
      actorId,
    );
    const distributionComponent = createStrategyComponent(
      {
        configuration_id: predecessor.id,
        slug: "participant-groups",
        label: "Participant groups",
        measurement_type: "distribution",
        unit: "participants",
        display_order: 1,
        configuration_status: "draft",
      },
      actorId,
    );
    const componentTarget = createStrategicTarget(
      {
        component_id: countComponent.id,
        target_scope: "annual",
        reporting_year: 2028,
        target_year: 2028,
        target_value: 12,
        target_description: "Complete 12 projects.",
        configuration_status: "active",
      },
      actorId,
    );
    getDb()
      .prepare(
        `INSERT INTO distribution_bands (
           kpi_id, component_id, slug, label, effective_from_year,
           effective_to_year, display_order, created_by, updated_by
         ) VALUES (?, ?, 'youth', 'Youth', 2025, 2029, 0, ?, ?)`,
      )
      .run(multiKpiId, distributionComponent.id, actorId, actorId);
    getDb()
      .prepare(
        `INSERT INTO kpi_component_entries (
           component_id, year, period_type, period_index, scalar_value, updated_by
         ) VALUES (?, 2026, 'annual', 0, 7, ?)`,
      )
      .run(countComponent.id, actorId);

    const result = createSuccessorMeasurementConfiguration(
      {
        predecessor_id: predecessor.id,
        expected_revision: predecessor.updated_at,
        successor: configuration(multiKpiId, {
          measurement_type: "multi_component",
          aggregation_method: "none",
          effective_start_year: 2027,
        }),
      },
      actorId,
    );
    const successorComponents = getDb()
      .prepare(
        `SELECT id, slug, label, measurement_type, configuration_id
         FROM kpi_components WHERE configuration_id = ? ORDER BY display_order`,
      )
      .all(result.successor.id) as Array<{
      id: number;
      slug: string;
      label: string;
      measurement_type: string;
      configuration_id: number;
    }>;
    expect(successorComponents).toHaveLength(2);
    expect(successorComponents).toEqual([
      expect.objectContaining({
        slug: "completed-projects",
        label: "Completed projects",
        configuration_id: result.successor.id,
      }),
      expect.objectContaining({
        slug: "participant-groups",
        measurement_type: "distribution",
        configuration_id: result.successor.id,
      }),
    ]);
    const clonedCount = successorComponents[0]!;
    const clonedDistribution = successorComponents[1]!;
    expect(
      getDb()
        .prepare(
          `SELECT target_scope, reporting_year, target_year, target_value
           FROM kpi_targets WHERE component_id = ?`,
        )
        .all(clonedCount.id),
    ).toEqual([
      {
        target_scope: "annual",
        reporting_year: 2028,
        target_year: 2028,
        target_value: 12,
      },
    ]);
    expect(
      getDb()
        .prepare(
          `SELECT slug, label, effective_from_year, effective_to_year
           FROM distribution_bands WHERE component_id = ?`,
        )
        .all(clonedDistribution.id),
    ).toEqual([
      {
        slug: "youth",
        label: "Youth",
        effective_from_year: 2027,
        effective_to_year: 2029,
      },
    ]);
    expect(
      getDb().prepare("SELECT COUNT(*) AS count FROM kpi_component_entries").get(),
    ).toEqual({ count: 1 });
    expect(
      getDb()
        .prepare(
          `SELECT component_id FROM kpi_component_entries WHERE year = 2026`,
        )
        .get(),
    ).toEqual({ component_id: countComponent.id });
    expect(
      listStrategicAuditEvents({ entity_type: "component" }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity_id: clonedCount.id,
          new_value: expect.objectContaining({
            predecessor_component_id: countComponent.id,
          }),
        }),
        expect.objectContaining({
          entity_id: clonedDistribution.id,
          new_value: expect.objectContaining({
            predecessor_component_id: distributionComponent.id,
          }),
        }),
      ]),
    );
    expect(
      getDb()
        .prepare("SELECT id FROM kpi_targets WHERE component_id = ?")
        .get(countComponent.id),
    ).toEqual({ id: componentTarget.id });

    const insertUnrelatedAudit = getDb().prepare(
      `INSERT INTO strategic_audit_events (
         entity_type, entity_id, event_type, entity_display_name, new_value_json
       ) VALUES ('kpi', ?, 'create', 'Unrelated KPI', '{}')`,
    );
    for (let index = 0; index < 501; index += 1) {
      insertUnrelatedAudit.run(100_000 + index);
    }
    const lineageEvents = listStrategicAuditEvents({
      identities: listStrategicAuditIdentitiesForKpi(multiKpiId),
      limit: 500,
    });
    expect(lineageEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity_type: "measurement_config",
          entity_id: predecessor.id,
        }),
        expect.objectContaining({
          entity_type: "component",
          entity_id: countComponent.id,
        }),
        expect.objectContaining({
          entity_type: "component",
          entity_id: clonedCount.id,
        }),
      ]),
    );
    expect(
      lineageEvents.some((event) => event.entity_display_name === "Unrelated KPI"),
    ).toBe(false);
  });

  it.each([
    { targetYear: 2026, external: false, label: "latest-past" },
    { targetYear: 2030, external: true, label: "external future" },
  ])(
    "clones a policy-selected $label component full-plan target",
    ({ targetYear, external }) => {
      const predecessor = createMeasurementConfiguration(
        configuration(multiKpiId, {
          measurement_type: "multi_component",
          aggregation_method: "sum",
        }),
        actorId,
      );
      const component = createStrategyComponent(
        {
          configuration_id: predecessor.id,
          slug: "policy-target-component",
          label: "Policy target component",
          measurement_type: "count",
          unit: "items",
          display_order: 0,
          configuration_status: "draft",
        },
        actorId,
      );
      const originalTarget = createStrategicTarget(
        {
          component_id: component.id,
          target_scope: "full_plan",
          target_year: targetYear,
          external_target_year: external,
          target_value: 12,
          target_description: "Complete 12 items.",
          configuration_status: "active",
        },
        actorId,
      );

      const result = createSuccessorMeasurementConfiguration(
        {
          predecessor_id: predecessor.id,
          expected_revision: predecessor.updated_at,
          successor: configuration(multiKpiId, {
            measurement_type: "multi_component",
            aggregation_method: "sum",
            effective_start_year: 2027,
          }),
        },
        actorId,
      );
      const clonedComponent = getDb()
        .prepare("SELECT id FROM kpi_components WHERE configuration_id = ?")
        .get(result.successor.id) as { id: number };
      expect(
        getDb()
          .prepare(
            `SELECT target_year, external_target_year, target_value
             FROM kpi_targets WHERE component_id = ?`,
          )
          .all(clonedComponent.id),
      ).toEqual([{
        target_year: targetYear,
        external_target_year: external ? 1 : 0,
        target_value: 12,
      }]);
      expect(originalTarget.component_id).toBe(component.id);
    },
  );

  it("rolls back the complete successor graph when a component clone fails", () => {
    const predecessor = createMeasurementConfiguration(
      configuration(multiKpiId, {
        measurement_type: "multi_component",
        aggregation_method: "sum",
        configuration_status: "draft",
      }),
      actorId,
    );
    const component = createStrategyComponent(
      {
        configuration_id: predecessor.id,
        slug: "rollback-component",
        label: "Rollback component",
        measurement_type: "count",
        unit: "items",
        display_order: 0,
        configuration_status: "draft",
      },
      actorId,
    );
    createStrategicTarget(
      {
        component_id: component.id,
        target_scope: "annual",
        reporting_year: 2028,
        target_year: 2028,
        target_value: 8,
        target_description: "Complete eight items.",
        configuration_status: "draft",
      },
      actorId,
    );
    const auditCountBefore = (
      getDb()
        .prepare("SELECT COUNT(*) AS count FROM strategic_audit_events")
        .get() as { count: number }
    ).count;
    getDb().exec(`
      CREATE TRIGGER fail_successor_target_clone
      BEFORE INSERT ON kpi_targets
      WHEN NEW.component_id IS NOT NULL AND NEW.component_id <> ${component.id}
      BEGIN
        SELECT RAISE(ABORT, 'forced successor target clone failure');
      END;
    `);

    expect(() =>
      createSuccessorMeasurementConfiguration(
        {
          predecessor_id: predecessor.id,
          expected_revision: predecessor.updated_at,
          successor: configuration(multiKpiId, {
            measurement_type: "multi_component",
            aggregation_method: "sum",
            effective_start_year: 2027,
          }),
        },
        actorId,
      ),
    ).toThrow(/forced successor target clone failure/);
    expect(getMeasurementRange(predecessor.id)).toEqual({
      effective_from_year: 2025,
      effective_to_year: 2029,
    });
    expect(
      getDb()
        .prepare("SELECT COUNT(*) AS count FROM kpi_measurement_configs")
        .get(),
    ).toEqual({ count: 1 });
    expect(
      getDb().prepare("SELECT COUNT(*) AS count FROM kpi_components").get(),
    ).toEqual({ count: 1 });
    expect(
      getDb().prepare("SELECT COUNT(*) AS count FROM kpi_targets").get(),
    ).toEqual({ count: 1 });
    expect(
      getDb()
        .prepare("SELECT COUNT(*) AS count FROM strategic_audit_events")
        .get(),
    ).toEqual({ count: auditCountBefore });
  });

  it("rejects active multi-component successors without reusable definitions", () => {
    const predecessor = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );
    expect(() =>
      createSuccessorMeasurementConfiguration(
        {
          predecessor_id: predecessor.id,
          expected_revision: predecessor.updated_at,
          successor: configuration(countKpiId, {
            measurement_type: "multi_component",
            aggregation_method: "sum",
            effective_start_year: 2027,
          }),
        },
        actorId,
      ),
    ).toThrow(
      expect.objectContaining({ code: "successor_components_required" }),
    );
  });

  it("constrains successors to the selectable 2025–2029 plan window", () => {
    const predecessor = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );
    expect(() =>
      createSuccessorMeasurementConfiguration(
        {
          predecessor_id: predecessor.id,
          expected_revision: predecessor.updated_at,
          successor: configuration(countKpiId, {
            effective_start_year: 2030,
            effective_end_year: 2030,
          }),
        },
        actorId,
      ),
    ).toThrow(
      expect.objectContaining({ code: "successor_outside_plan" }),
    );
  });

  it("accepts a successor in a newly persisted plan year", () => {
    const plan = getActiveInstallation();
    updateActiveInstallation(
      {
        expectedRevision: plan.plan.revision,
        organizationName: plan.organization.name,
        organizationShortName: plan.organization.shortName,
        planName: plan.plan.name,
        planDescription: plan.plan.description,
        startYear: plan.plan.startYear,
        endYear: 2030,
        sourceReference: plan.plan.sourceReference,
      },
      actorId,
    );
    const predecessor = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );

    const successor = createSuccessorMeasurementConfiguration(
      {
        predecessor_id: predecessor.id,
        expected_revision: predecessor.updated_at,
        successor: configuration(countKpiId, {
          effective_start_year: 2030,
          effective_end_year: 2030,
        }),
      },
      actorId,
    );

    expect(successor.successor).toMatchObject({
      effective_from_year: 2030,
      effective_to_year: 2030,
    });
  });

  it("rejects a successor that leaves the predecessor tail uncovered", () => {
    const predecessor = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );
    expect(() =>
      createSuccessorMeasurementConfiguration(
        {
          predecessor_id: predecessor.id,
          expected_revision: predecessor.updated_at,
          successor: configuration(countKpiId, {
            effective_start_year: 2027,
            effective_end_year: 2028,
          }),
        },
        actorId,
      ),
    ).toThrow(
      expect.objectContaining({ code: "successor_effective_coverage" }),
    );
    expect(getMeasurementRange(predecessor.id)).toEqual({
      effective_from_year: 2025,
      effective_to_year: 2029,
    });
  });

  it("rolls back unsafe or overlapping successor definitions", () => {
    const historical = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );
    getDb()
      .prepare(
        `INSERT INTO monthly_entries (kpi_id, year, month, value, updated_by)
         VALUES (?, 2026, 0, 12, ?)`,
      )
      .run(countKpiId, actorId);

    expect(() =>
      createSuccessorMeasurementConfiguration(
        {
          predecessor_id: historical.id,
          expected_revision: historical.updated_at,
          successor: configuration(countKpiId, {
            effective_start_year: 2026,
            effective_end_year: 2029,
            unit: "visitors",
          }),
        },
        actorId,
      ),
    ).toThrow(StrategyEditConflictError);
    expect(getMeasurementRange(historical.id)).toEqual({
      effective_from_year: 2025,
      effective_to_year: 2029,
    });

    resetDb();
    process.env.DATABASE_PATH = path.join(tmpDir, `edit-${databaseIndex++}.db`);
    bootstrapTestInstallation();
    const db = getDb();
    const localActor = Number(
      db
        .prepare(
          `INSERT INTO users (email, name, password_hash, role)
           VALUES ('successor-admin@example.org', 'Successor Admin', 'hash', 'admin')`,
        )
        .run().lastInsertRowid,
    );
    const localCategory = Number(
      db
        .prepare(
          `INSERT INTO categories (plan_id, slug, name, sort_order)
           VALUES ((SELECT id FROM strategic_plans WHERE status = 'active'),
                   'successor-test', 'Successor Test', 1)`,
        )
        .run().lastInsertRowid,
    );
    const localKpi = Number(
      db
        .prepare(
          `INSERT INTO kpis (
             category_id, slug, name, unit, unit_type, reporting_frequency,
             direction, sort_order
           ) VALUES (?, 'successor-kpi', 'Successor KPI', 'items', 'count',
             'annual', 'higher', 1)`,
        )
        .run(localCategory).lastInsertRowid,
    );
    const predecessor = createMeasurementConfiguration(
      configuration(localKpi, { effective_end_year: 2027 }),
      localActor,
    );
    createMeasurementConfiguration(
      configuration(localKpi, {
        effective_start_year: 2028,
        effective_end_year: 2029,
      }),
      localActor,
    );

    expect(() =>
      createSuccessorMeasurementConfiguration(
        {
          predecessor_id: predecessor.id,
          expected_revision: predecessor.updated_at,
          successor: configuration(localKpi, {
            effective_start_year: 2027,
            effective_end_year: 2029,
            unit: "visitors",
          }),
        },
        localActor,
      ),
    ).toThrow(StrategyEditConflictError);
    expect(getMeasurementRange(predecessor.id)).toEqual({
      effective_from_year: 2025,
      effective_to_year: 2027,
    });
  });

  it("validates merged configuration state and reports missing records explicitly", () => {
    const created = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );
    expect(() =>
      updateMeasurementConfiguration(
        {
          id: created.id,
          measurement_type: "percentage",
          numerator_label: null,
          denominator_label: null,
        },
        actorId,
      ),
    ).toThrow(StrategyEditValidationError);
    expect(() =>
      updateMeasurementConfiguration({ id: 999_999, unit: "visitors" }, actorId),
    ).toThrow(StrategyEditNotFoundError);
    expect(listStrategicAuditEvents({ entity_id: created.id })).toHaveLength(1);
  });

  it("freezes calculation semantics after observations exist while allowing workflow metadata", () => {
    const created = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );
    getDb()
      .prepare(
        `INSERT INTO kpi_observations (
           kpi_id, configuration_id, year, period_type, period_index,
           scalar_value, updated_by
         ) VALUES (?, ?, 2026, 'annual', 0, 12, ?)`,
      )
      .run(countKpiId, created.id, actorId);

    for (const semanticPatch of [
      { measurement_type: "currency", unit: "USD" },
      { unit: "visits" },
      { numerator_label: "Completed items" },
      { denominator_label: "Eligible items" },
      { fixed_denominator: 100 },
      { baseline_value: 8 },
      { reporting_frequency: "quarterly" },
      { calculation_precision: 2 },
      { allow_score_over_max: true },
    ]) {
      expectHistoricalSemanticsConflict(() =>
        updateMeasurementConfiguration(
          { id: created.id, ...semanticPatch },
          actorId,
        ),
      );
    }
    expectHistoricalSemanticsConflict(() =>
      updateMeasurementConfiguration(
        {
          id: created.id,
          configuration_status: "needs_definition",
          unresolved_question: "Revisit the calculation definition.",
        },
        actorId,
      ),
    );

    const updated = updateMeasurementConfiguration(
      {
        id: created.id,
        configuration_status: "ready",
        owner: "Evaluation team",
        due_date: "2026-08-31",
        resolution_notes: "Reviewed without changing the calculation.",
        source_reference: "2026 review packet",
        last_reviewed_date: "2026-07-13",
      },
      actorId,
    );
    expect(updated).toMatchObject({
      configuration_status: "ready",
      owner: "Evaluation team",
      due_date: "2026-08-31",
      resolution_notes: "Reviewed without changing the calculation.",
      source_reference: "2026 review packet",
      last_reviewed_date: "2026-07-13",
      unit: "items",
      calculation_precision: 1,
    });
  });

  it("freezes in-place measurement semantics once a configured target uses them", () => {
    const created = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );
    createStrategicTarget(
      {
        kpi_id: countKpiId,
        target_scope: "full_plan",
        target_year: 2029,
        target_value: 50,
        target_description: "Complete 50 items.",
        configuration_status: "active",
      },
      actorId,
    );

    expectHistoricalSemanticsConflict(() =>
      updateMeasurementConfiguration(
        {
          id: created.id,
          measurement_type: "percentage",
          unit: "%",
          numerator_label: "Completed",
          denominator_label: "Eligible",
        },
        actorId,
      ),
    );
    expect(getEffectiveMeasurementConfig(countKpiId, 2026)).toMatchObject({
      id: created.id,
      measurement_type: "count",
      unit: "items",
    });
  });

  it("revalidates target measurement semantics before restoring an archived target", () => {
    const config = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );
    const target = createStrategicTarget(
      {
        kpi_id: countKpiId,
        target_scope: "full_plan",
        target_year: 2029,
        target_value: 500,
        target_description: "Complete 500 items.",
        configuration_status: "active",
      },
      actorId,
    );
    archiveTarget(target.id, actorId);
    updateMeasurementConfiguration(
      {
        id: config.id,
        measurement_type: "percentage",
        unit: "%",
        numerator_label: "Completed",
        denominator_label: "Eligible",
      },
      actorId,
    );

    expect(() => restoreTarget(target.id, actorId)).toThrow(
      expect.objectContaining({ code: "target_measurement_incompatible" }),
    );
    expect(
      getDb()
        .prepare("SELECT configuration_status, archived_at FROM kpi_targets WHERE id = ?")
        .get(target.id),
    ).toMatchObject({
      configuration_status: "archived",
      archived_at: expect.any(String),
    });
  });

  it("rejects restoring a description-only binary target under count semantics", () => {
    const config = createMeasurementConfiguration(
      configuration(countKpiId, {
        measurement_type: "binary",
        unit: "complete",
      }),
      actorId,
    );
    const target = createStrategicTarget(
      {
        kpi_id: countKpiId,
        target_scope: "full_plan",
        target_year: 2029,
        target_value: null,
        target_description: "Complete the initiative.",
        configuration_status: "active",
      },
      actorId,
    );
    archiveTarget(target.id, actorId);
    updateMeasurementConfiguration(
      {
        id: config.id,
        measurement_type: "count",
        unit: "items",
      },
      actorId,
    );

    expect(() => restoreTarget(target.id, actorId)).toThrow(
      expect.objectContaining({ code: "target_measurement_incompatible" }),
    );
  });

  it("rejects a count structured target when a percentage successor would reinterpret it", () => {
    const predecessor = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );
    createStrategicTarget(
      {
        kpi_id: countKpiId,
        target_scope: "full_plan",
        target_year: 2029,
        target_value: null,
        structured_target: { value: 500 },
        target_description: "Complete 500 items.",
        configuration_status: "active",
      },
      actorId,
    );

    expect(() =>
      createSuccessorMeasurementConfiguration(
        {
          predecessor_id: predecessor.id,
          expected_revision: predecessor.updated_at,
          successor: configuration(countKpiId, {
            effective_start_year: 2027,
            measurement_type: "percentage",
            unit: "%",
            numerator_label: "Completed",
            denominator_label: "Eligible",
          }),
        },
        actorId,
      ),
    ).toThrow(
      expect.objectContaining({ code: "successor_target_incompatible" }),
    );
  });

  it("rejects a description-only binary target when a count successor would reinterpret it", () => {
    const predecessor = createMeasurementConfiguration(
      configuration(countKpiId, {
        measurement_type: "binary",
        unit: "complete",
      }),
      actorId,
    );
    createStrategicTarget(
      {
        kpi_id: countKpiId,
        target_scope: "full_plan",
        target_year: 2029,
        target_value: null,
        target_description: "Complete the initiative.",
        configuration_status: "active",
      },
      actorId,
    );

    expect(() =>
      createSuccessorMeasurementConfiguration(
        {
          predecessor_id: predecessor.id,
          expected_revision: predecessor.updated_at,
          successor: configuration(countKpiId, {
            effective_start_year: 2027,
            measurement_type: "count",
            unit: "items",
          }),
        },
        actorId,
      ),
    ).toThrow(
      expect.objectContaining({ code: "successor_target_incompatible" }),
    );
  });

  it("rejects archiving a full-plan target that protects a semantic boundary", () => {
    createMeasurementConfiguration(
      configuration(countKpiId, { effective_end_year: 2026 }),
      actorId,
    );
    createMeasurementConfiguration(
      configuration(countKpiId, {
        effective_start_year: 2027,
        effective_end_year: 2029,
        measurement_type: "percentage",
        unit: "%",
        numerator_label: "Completed",
        denominator_label: "Eligible",
      }),
      actorId,
    );
    const boundaryTarget = createStrategicTarget(
      {
        kpi_id: countKpiId,
        target_scope: "full_plan",
        target_year: 2026,
        target_value: null,
        target_description: "Predecessor target pending.",
        configuration_status: "needs_target",
      },
      actorId,
    );
    createStrategicTarget(
      {
        kpi_id: countKpiId,
        target_scope: "full_plan",
        target_year: 2029,
        target_value: 75,
        target_description: "Reach 75 percent.",
        configuration_status: "active",
      },
      actorId,
    );
    updateStrategicTarget(
      {
        id: boundaryTarget.id,
        target_value: 50,
        target_description: "Complete 50 items.",
        configuration_status: "active",
      },
      actorId,
    );

    expect(() => archiveTarget(boundaryTarget.id, actorId)).toThrow(
      expect.objectContaining({
        code: "target_configuration_semantics_conflict",
      }),
    );
    expect(
      getDb()
        .prepare("SELECT configuration_status, archived_at FROM kpi_targets WHERE id = ?")
        .get(boundaryTarget.id),
    ).toEqual({ configuration_status: "active", archived_at: null });
  });

  it("rejects archiving a measurement configuration that would orphan a defined target", () => {
    const configurationRow = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );
    createStrategicTarget(
      {
        kpi_id: countKpiId,
        target_scope: "full_plan",
        target_year: 2029,
        target_value: 25,
        target_description: "Complete 25 items.",
        configuration_status: "active",
      },
      actorId,
    );

    expect(() => archiveMeasurementConfig(configurationRow.id, actorId)).toThrow(
      expect.objectContaining({
        code: "target_configuration_coverage_conflict",
      }),
    );
    expect(
      getDb()
        .prepare(
          "SELECT configuration_status, archived_at FROM kpi_measurement_configs WHERE id = ?",
        )
        .get(configurationRow.id),
    ).toEqual({ configuration_status: "active", archived_at: null });

    getDb()
      .prepare("UPDATE kpis SET archived_at = datetime('now') WHERE id = ?")
      .run(countKpiId);
    expect(() => archiveMeasurementConfig(configurationRow.id, actorId)).toThrow(
      expect.objectContaining({ code: "archived_kpi_context" }),
    );
  });

  it("revalidates full-plan semantic boundaries before restoring a configuration", () => {
    const predecessor = createMeasurementConfiguration(
      configuration(countKpiId, { effective_end_year: 2026 }),
      actorId,
    );
    createMeasurementConfiguration(
      configuration(countKpiId, {
        effective_start_year: 2027,
        effective_end_year: 2029,
        measurement_type: "percentage",
        unit: "%",
        numerator_label: "Completed",
        denominator_label: "Eligible",
      }),
      actorId,
    );
    const boundaryTarget = createStrategicTarget(
      {
        kpi_id: countKpiId,
        target_scope: "full_plan",
        target_year: 2026,
        target_value: null,
        target_description: "Predecessor target pending.",
        configuration_status: "needs_target",
      },
      actorId,
    );
    createStrategicTarget(
      {
        kpi_id: countKpiId,
        target_scope: "full_plan",
        target_year: 2029,
        target_value: 75,
        target_description: "Reach 75 percent.",
        configuration_status: "active",
      },
      actorId,
    );
    updateStrategicTarget(
      {
        id: boundaryTarget.id,
        target_value: 50,
        target_description: "Complete 50 items.",
        configuration_status: "active",
      },
      actorId,
    );

    getDb()
      .prepare(
        `UPDATE kpi_measurement_configs
         SET configuration_status = 'archived', archived_at = datetime('now')
         WHERE id = ?`,
      )
      .run(predecessor.id);
    // Simulate a pre-guard/imported archived state. Public configuration
    // archives and target updates now reject this gap before it can be
    // persisted; restore must still defend databases that already contain it.
    getDb()
      .prepare(
        `UPDATE kpi_targets
         SET target_year = 2028, target_description = 'Reach 50 percent.'
         WHERE id = ?`,
      )
      .run(boundaryTarget.id);

    expect(() => restoreMeasurementConfig(predecessor.id, actorId)).toThrow(
      expect.objectContaining({
        code: "target_configuration_semantics_conflict",
      }),
    );
    expect(
      getDb()
        .prepare(
          "SELECT configuration_status, archived_at FROM kpi_measurement_configs WHERE id = ?",
        )
        .get(predecessor.id),
    ).toMatchObject({
      configuration_status: "archived",
      archived_at: expect.any(String),
    });
  });

  it("treats legacy scalar and breakdown values as historical calculation inputs", () => {
    const scalarConfig = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );
    getDb()
      .prepare(
        `INSERT INTO monthly_entries (kpi_id, year, month, value, updated_by)
         VALUES (?, 2026, 0, 12, ?)`,
      )
      .run(countKpiId, actorId);

    expectHistoricalSemanticsConflict(() =>
      updateMeasurementConfiguration(
        { id: scalarConfig.id, unit: "visitors" },
        actorId,
      ),
    );
    expectHistoricalSemanticsConflict(() =>
      updateStrategicGoalSettings(
        {
          id: goalId,
          completion_rule: "threshold_count",
          threshold_count: 1,
        },
        actorId,
      ),
    );
    expectHistoricalSemanticsConflict(() =>
      updateStrategicGoalMembership(
        { id: membershipId, role: "informational" },
        actorId,
      ),
    );

    const breakdownConfig = createMeasurementConfiguration(
      configuration(multiKpiId, {
        measurement_type: "multi_component",
        aggregation_method: "sum",
        configuration_status: "draft",
      }),
      actorId,
    );
    const legacyComponent = createStrategyComponent(
      {
        configuration_id: breakdownConfig.id,
        slug: "city-support",
        label: "City support",
        measurement_type: "count",
        unit: "grants",
        display_order: 0,
        configuration_status: "draft",
      },
      actorId,
    );
    getDb()
      .prepare(
        `INSERT INTO breakdown_entries (
           kpi_id, year, month, label, value, updated_by
         ) VALUES (?, 2026, 0, 'City support', 4, ?)`,
      )
      .run(multiKpiId, actorId);

    expectHistoricalSemanticsConflict(() =>
      updateMeasurementConfiguration(
        { id: breakdownConfig.id, aggregation_method: "average" },
        actorId,
      ),
    );
    expectHistoricalSemanticsConflict(() =>
      updateStrategyComponent(
        { id: legacyComponent.id, unit: "awards" },
        actorId,
      ),
    );
  });

  it("refuses to adopt legacy history through an in-place range expansion", () => {
    const config = createMeasurementConfiguration(
      configuration(countKpiId, { effective_end_year: 2026 }),
      actorId,
    );
    getDb()
      .prepare(
        `INSERT INTO monthly_entries (kpi_id, year, month, value, updated_by)
         VALUES (?, 2027, 0, 12, ?)`,
      )
      .run(countKpiId, actorId);

    expect(() =>
      updateMeasurementConfiguration(
        { id: config.id, effective_end_year: 2027 },
        actorId,
      ),
    ).toThrow(
      expect.objectContaining({ code: "legacy_range_adoption_conflict" }),
    );
    expectHistoricalSemanticsConflict(() =>
      updateMeasurementConfiguration(
        {
          id: config.id,
          effective_end_year: 2027,
          unit: "visitors",
        },
        actorId,
      ),
    );
    expect(getMeasurementRange(config.id)).toEqual({
      effective_from_year: 2025,
      effective_to_year: 2026,
    });
  });

  it("freezes component calculation semantics after component values exist", () => {
    const config = createMeasurementConfiguration(
      configuration(multiKpiId, {
        measurement_type: "multi_component",
        aggregation_method: "sum",
        configuration_status: "draft",
      }),
      actorId,
    );
    const component = createStrategyComponent(
      {
        configuration_id: config.id,
        slug: "admissions",
        label: "Admissions",
        measurement_type: "count",
        unit: "visits",
        display_order: 0,
        configuration_status: "draft",
      },
      actorId,
    );
    getDb()
      .prepare(
        `INSERT INTO kpi_component_entries (
           component_id, year, period_type, period_index, scalar_value, updated_by
         ) VALUES (?, 2026, 'annual', 0, 12, ?)`,
      )
      .run(component.id, actorId);

    expectHistoricalSemanticsConflict(() =>
      updateMeasurementConfiguration(
        { id: config.id, aggregation_method: "average" },
        actorId,
      ),
    );

    for (const semanticPatch of [
      { label: "Admissions renamed" },
      { measurement_type: "currency", unit: "USD" },
      { unit: "people" },
      { numerator_label: "Completed visits" },
      { denominator_label: "Eligible visits" },
      { fixed_denominator: 100 },
      { baseline_value: 8 },
      { previous_period_value: 10 },
      { aggregation_role: "numerator" },
      { weight: 2.5 },
    ]) {
      expectHistoricalSemanticsConflict(() =>
        updateStrategyComponent(
          { id: component.id, ...semanticPatch },
          actorId,
        ),
      );
    }

    expect(
      updateStrategyComponent(
        {
          id: component.id,
          unresolved_question: "Confirm next year's collection owner.",
        },
        actorId,
      ),
    ).toMatchObject({
      label: "Admissions",
      configuration_status: "draft",
      unresolved_question: "Confirm next year's collection owner.",
      unit: "visits",
      weight: 1,
    });
    expectHistoricalSemanticsConflict(() =>
      updateStrategyComponent(
        {
          id: component.id,
          configuration_status: "needs_definition",
          unresolved_question: "Revisit the component definition.",
        },
        actorId,
      ),
    );
  });

  it("scopes reusable component slugs to one effective configuration", () => {
    const firstConfig = createMeasurementConfiguration(
      configuration(multiKpiId, {
        measurement_type: "multi_component",
        aggregation_method: "sum",
        effective_end_year: 2026,
        configuration_status: "draft",
      }),
      actorId,
    );
    const secondConfig = createMeasurementConfiguration(
      configuration(multiKpiId, {
        measurement_type: "multi_component",
        aggregation_method: "sum",
        effective_start_year: 2027,
        effective_end_year: 2029,
        configuration_status: "draft",
      }),
      actorId,
    );
    const sharedDefinition = {
      slug: "attendance",
      label: "Attendance",
      measurement_type: "count",
      unit: "visits",
      display_order: 0,
      configuration_status: "draft",
    };

    createStrategyComponent(
      { configuration_id: firstConfig.id, ...sharedDefinition },
      actorId,
    );
    expect(() =>
      createStrategyComponent(
        {
          configuration_id: firstConfig.id,
          ...sharedDefinition,
          display_order: 1,
        },
        actorId,
      ),
    ).toThrow(StrategyEditConflictError);

    expect(
      createStrategyComponent(
        { configuration_id: secondConfig.id, ...sharedDefinition },
        actorId,
      ),
    ).toMatchObject({
      configuration_id: secondConfig.id,
      slug: "attendance",
      label: "Attendance",
    });
  });

  it("updates goal completion rules and unresolved status as one audited mutation", () => {
    const threshold = updateStrategicGoalSettings(
      {
        id: goalId,
        completion_rule: "threshold_count",
        threshold_count: 1,
      },
      actorId,
    );
    expect(threshold).toMatchObject({
      completion_rule: "threshold_count",
      threshold_count: 1,
    });
    expect(() =>
      updateStrategicGoalSettings(
        { id: goalId, configuration_status: "needs_target" },
        actorId,
      ),
    ).toThrow(StrategyEditValidationError);
    const unresolved = updateStrategicGoalSettings(
      {
        id: goalId,
        configuration_status: "needs_target",
        unresolved_question: "Confirm the board-approved target.",
        owner: "Strategy committee",
      },
      actorId,
    );
    expect(unresolved).toMatchObject({
      configuration_status: "needs_target",
      unresolved_question: "Confirm the board-approved target.",
    });
    expect(
      listStrategicAuditEvents({ entity_type: "strategic_goal", entity_id: goalId })
        .map((event) => event.event_type),
    ).toEqual(["status_change", "update"]);
  });

  it("refuses a threshold count above the goal's active membership count (S070-C3)", () => {
    // The fixture goal has exactly two active memberships: a threshold of
    // 2 is satisfiable; 3 would make the completion rule permanently
    // unreachable and previously persisted silently.
    const satisfiable = updateStrategicGoalSettings(
      {
        id: goalId,
        completion_rule: "threshold_count",
        threshold_count: 2,
      },
      actorId,
    );
    expect(satisfiable.threshold_count).toBe(2);

    expect(() =>
      updateStrategicGoalSettings(
        { id: goalId, threshold_count: 3 },
        actorId,
      ),
    ).toThrow(StrategyEditValidationError);
    expect(() =>
      updateStrategicGoalSettings(
        { id: goalId, threshold_count: 1e15 },
        actorId,
      ),
    ).toThrow(StrategyEditValidationError);

    // The persisted value is unchanged by the refused writes.
    const persisted = getDb()
      .prepare("SELECT threshold_count FROM strategic_goals WHERE id = ?")
      .get(goalId) as { threshold_count: number };
    expect(persisted.threshold_count).toBe(2);

    // The successor path applies the same cap.
    expect(() =>
      createSuccessorStrategicGoal(
        {
          predecessor_id: goalId,
          effective_start_year: 2027,
          update: { id: goalId, threshold_count: 3 },
        },
        actorId,
      ),
    ).toThrow(StrategyEditValidationError);
  });

  it("caps threshold count at the minimum simultaneous required memberships", () => {
    getDb()
      .prepare(
        `UPDATE goal_kpis
         SET effective_from_year = 2027
         WHERE goal_id = ? AND kpi_id = ?`,
      )
      .run(goalId, multiKpiId);

    expect(() =>
      updateStrategicGoalSettings(
        {
          id: goalId,
          completion_rule: "threshold_count",
          threshold_count: 2,
        },
        actorId,
      ),
    ).toThrow(StrategyEditValidationError);

    expect(
      updateStrategicGoalSettings(
        {
          id: goalId,
          completion_rule: "threshold_count",
          threshold_count: 1,
        },
        actorId,
      ),
    ).toMatchObject({ threshold_count: 1 });
  });

  it("freezes goal completion rules after member observations exist", () => {
    updateStrategicGoalSettings(
      {
        id: goalId,
        completion_rule: "threshold_count",
        threshold_count: 1,
      },
      actorId,
    );
    const config = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );
    getDb()
      .prepare(
        `INSERT INTO kpi_observations (
           kpi_id, configuration_id, year, period_type, period_index,
           scalar_value, updated_by
         ) VALUES (?, ?, 2026, 'annual', 0, 12, ?)`,
      )
      .run(countKpiId, config.id, actorId);

    expectHistoricalSemanticsConflict(() =>
      updateStrategicGoalSettings(
        { id: goalId, threshold_count: 2 },
        actorId,
      ),
    );
    expectHistoricalSemanticsConflict(() =>
      updateStrategicGoalSettings(
        {
          id: goalId,
          configuration_status: "needs_definition",
          unresolved_question: "Revisit the goal definition.",
        },
        actorId,
      ),
    );
    expectHistoricalSemanticsConflict(() =>
      updateStrategicGoalSettings(
        {
          id: goalId,
          completion_rule: "manual_status",
          threshold_count: null,
          manual_status: "complete",
        },
        actorId,
      ),
    );

    const updated = updateStrategicGoalSettings(
      {
        id: goalId,
        configuration_status: "ready",
        owner: "Strategy committee",
        due_date: "2026-09-15",
        resolution_notes: "Annual governance review complete.",
        source_reference: "Committee minutes",
        last_reviewed_date: "2026-07-13",
      },
      actorId,
    );
    expect(updated).toMatchObject({
      completion_rule: "threshold_count",
      threshold_count: 1,
      configuration_status: "ready",
      owner: "Strategy committee",
      due_date: "2026-09-15",
    });
  });

  it("audits manual status progression while freezing the completion rule", () => {
    expect(
      updateStrategicGoalSettings(
        {
          id: goalId,
          completion_rule: "manual_status",
          manual_status: "not_started",
        },
        actorId,
      ),
    ).toMatchObject({
      completion_rule: "manual_status",
      manual_status: "not_started",
    });

    expect(
      updateStrategicGoalSettings(
        { id: goalId, manual_status: "in_progress" },
        actorId,
      ),
    ).toMatchObject({ manual_status: "in_progress" });
    expect(
      updateStrategicGoalSettings(
        { id: goalId, manual_status: "complete" },
        actorId,
      ),
    ).toMatchObject({ manual_status: "complete" });

    const statusEvents = listStrategicAuditEvents({
      entity_type: "strategic_goal",
      entity_id: goalId,
      event_type: "status_change",
    });
    expect(statusEvents).toHaveLength(2);
    expect(statusEvents[0]).toMatchObject({
      previous_value: { manual_status: "in_progress" },
      new_value: { manual_status: "complete" },
    });
    expect(statusEvents[1]).toMatchObject({
      previous_value: { manual_status: "not_started" },
      new_value: { manual_status: "in_progress" },
    });

    expectHistoricalSemanticsConflict(() =>
      updateStrategicGoalSettings(
        {
          id: goalId,
          completion_rule: "all_required_kpis",
          manual_status: null,
        },
        actorId,
      ),
    );
    expect(
      updateStrategicGoalSettings(
        { id: goalId, owner: "Strategy committee" },
        actorId,
      ),
    ).toMatchObject({
      completion_rule: "manual_status",
      manual_status: "complete",
      owner: "Strategy committee",
    });

    const versioned = createSuccessorStrategicGoal(
      {
        predecessor_id: goalId,
        effective_start_year: 2027,
        update: {
          id: goalId,
          completion_rule: "all_required_kpis",
          manual_status: null,
        },
      },
      actorId,
    );
    expect(versioned.predecessor).toMatchObject({
      plan_end_year: 2026,
      completion_rule: "manual_status",
      manual_status: "complete",
    });
    expect(versioned.successor).toMatchObject({
      plan_start_year: 2027,
      completion_rule: "all_required_kpis",
      manual_status: null,
    });
  });

  it("versions goal semantics with a collision-safe slug and split memberships", () => {
    getDb()
      .prepare(
        `INSERT INTO strategic_goals (
           priority_id, slug, name, plan_start_year, plan_end_year,
           configuration_status, created_by, updated_by
         ) VALUES (?, 'test-goal-from-2027', 'Slug reservation', 2025, 2025,
           'draft', ?, ?)`,
      )
      .run(categoryId, actorId, actorId);
    getDb()
      .prepare(
        `INSERT INTO monthly_entries (kpi_id, year, month, value, updated_by)
         VALUES (?, 2026, 0, 12, ?)`,
      )
      .run(countKpiId, actorId);

    const result = createSuccessorStrategicGoal(
      {
        predecessor_id: goalId,
        effective_start_year: 2027,
        update: {
          id: goalId,
          completion_rule: "threshold_count",
          threshold_count: 2,
        },
      },
      actorId,
    );

    expect(result.predecessor).toMatchObject({
      id: goalId,
      name: "Test Goal",
      slug: "test-goal",
      plan_start_year: 2025,
      plan_end_year: 2026,
      completion_rule: "all_required_kpis",
    });
    expect(result.successor).toMatchObject({
      name: "Test Goal",
      slug: "test-goal-from-2027-2",
      plan_start_year: 2027,
      plan_end_year: 2029,
      completion_rule: "threshold_count",
      threshold_count: 2,
    });

    const oldGoals = listStrategicGoals({ year: 2026 }).filter(
      (goal) => goal.name === "Test Goal",
    );
    const futureGoals = listStrategicGoals({ year: 2027 }).filter(
      (goal) => goal.name === "Test Goal",
    );
    expect(oldGoals).toHaveLength(1);
    expect(oldGoals[0]).toMatchObject({
      id: goalId,
      completion_rule: "all_required_kpis",
    });
    expect(futureGoals).toHaveLength(1);
    expect(futureGoals[0]).toMatchObject({
      id: result.successor.id,
      completion_rule: "threshold_count",
      members: [
        expect.objectContaining({ effective_from_year: 2027 }),
        expect.objectContaining({ effective_from_year: 2027 }),
      ],
    });
    expect(
      getDb()
        .prepare(
          `SELECT effective_to_year FROM goal_kpis
           WHERE id = ?`,
        )
        .get(membershipId),
    ).toEqual({ effective_to_year: 2026 });

    const goalEvents = listStrategicAuditEvents({
      entity_type: "strategic_goal",
    });
    expect(goalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity_id: goalId,
          new_value: expect.objectContaining({
            successor_goal_id: result.successor.id,
          }),
        }),
        expect.objectContaining({
          entity_id: result.successor.id,
          previous_value: { predecessor_goal_id: goalId },
        }),
      ]),
    );
  });

  it("updates membership role, positive weight, and order with an immutable audit snapshot", () => {
    const updated = updateStrategicGoalMembership(
      {
        id: membershipId,
        role: "informational",
        weight: 2.5,
        display_order: 7,
      },
      actorId,
    );
    expect(updated).toMatchObject({
      id: membershipId,
      goal_id: goalId,
      kpi_id: countKpiId,
      role: "informational",
      weight: 2.5,
      display_order: 7,
      effective_from_year: 2025,
      effective_to_year: 2029,
    });
    const [event] = listStrategicAuditEvents({
      entity_type: "goal_membership",
      entity_id: membershipId,
    });
    expect(event).toMatchObject({
      event_type: "update",
      entity_display_name: "Count KPI membership",
      parent_priority_name: "Visitor Experience",
      parent_goal_name: "Test Goal",
      actor_id: actorId,
      previous_value: {
        is_required: 1,
        weight: 1,
        display_order: 0,
      },
      new_value: {
        is_required: 0,
        weight: 2.5,
        display_order: 7,
      },
    });
  });

  it("preserves threshold reachability across membership role versioning", () => {
    updateStrategicGoalSettings(
      {
        id: goalId,
        completion_rule: "threshold_count",
        threshold_count: 2,
      },
      actorId,
    );

    expect(() =>
      updateStrategicGoalMembership(
        { id: membershipId, role: "informational" },
        actorId,
      ),
    ).toThrow(StrategyEditValidationError);
    expect(() =>
      createSuccessorStrategicGoalMembership(
        {
          predecessor_id: membershipId,
          expected_revision: currentRevision("goal_kpis", membershipId),
          effective_start_year: 2027,
          role: "informational",
          weight: 1,
          display_order: 0,
        },
        actorId,
      ),
    ).toThrow(StrategyEditValidationError);

    expect(
      getDb()
        .prepare(
          `SELECT is_required, effective_from_year, effective_to_year
           FROM goal_kpis WHERE id = ?`,
        )
        .get(membershipId),
    ).toEqual({
      is_required: 1,
      effective_from_year: 2025,
      effective_to_year: 2029,
    });
  });

  it("freezes membership role and weight after observations exist but permits reordering", () => {
    const config = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );
    getDb()
      .prepare(
        `INSERT INTO kpi_observations (
           kpi_id, configuration_id, year, period_type, period_index,
           scalar_value, updated_by
         ) VALUES (?, ?, 2026, 'annual', 0, 12, ?)`,
      )
      .run(countKpiId, config.id, actorId);

    expectHistoricalSemanticsConflict(() =>
      updateStrategicGoalMembership(
        { id: membershipId, role: "informational" },
        actorId,
      ),
    );
    expectHistoricalSemanticsConflict(() =>
      updateStrategicGoalMembership(
        { id: membershipId, weight: 2.5 },
        actorId,
      ),
    );

    expect(
      updateStrategicGoalMembership(
        { id: membershipId, display_order: 7 },
        actorId,
      ),
    ).toMatchObject({
      role: "required",
      weight: 1,
      display_order: 7,
    });
  });

  it("versions membership semantics at a safe future boundary", () => {
    getDb()
      .prepare(
        `INSERT INTO monthly_entries (kpi_id, year, month, value, updated_by)
         VALUES (?, 2026, 0, 12, ?)`,
      )
      .run(countKpiId, actorId);

    expect(() =>
      createSuccessorStrategicGoalMembership(
        {
          predecessor_id: membershipId,
          expected_revision: currentRevision("goal_kpis", membershipId),
          effective_start_year: 2026,
          role: "informational",
          weight: 2,
          display_order: 7,
        },
        actorId,
      ),
    ).toThrow(StrategyEditConflictError);
    expect(
      getDb()
        .prepare(
          `SELECT effective_to_year FROM goal_kpis WHERE id = ?`,
        )
        .get(membershipId),
    ).toEqual({ effective_to_year: 2029 });

    const result = createSuccessorStrategicGoalMembership(
      {
        predecessor_id: membershipId,
        expected_revision: currentRevision("goal_kpis", membershipId),
        effective_start_year: 2027,
        role: "informational",
        weight: 2,
        display_order: 7,
      },
      actorId,
    );
    expect(result.predecessor).toMatchObject({
      id: membershipId,
      role: "required",
      weight: 1,
      effective_from_year: 2025,
      effective_to_year: 2026,
    });
    expect(result.successor).toMatchObject({
      goal_id: goalId,
      kpi_id: countKpiId,
      role: "informational",
      weight: 2,
      display_order: 7,
      effective_from_year: 2027,
      effective_to_year: 2029,
    });
  });

  it("rejects invalid or missing membership updates without mutating canonical rows", () => {
    expect(() =>
      updateStrategicGoalMembership(
        { id: membershipId, weight: 0 },
        actorId,
      ),
    ).toThrow(StrategyEditValidationError);
    expect(() =>
      updateStrategicGoalMembership(
        { id: 999_999, role: "informational" },
        actorId,
      ),
    ).toThrow(StrategyEditNotFoundError);
    expect(
      getDb()
        .prepare(
          "SELECT is_required, weight, display_order FROM goal_kpis WHERE id = ?",
        )
        .get(membershipId),
    ).toEqual({ is_required: 1, weight: 1, display_order: 0 });
    expect(
      listStrategicAuditEvents({
        entity_type: "goal_membership",
        entity_id: membershipId,
      }),
    ).toEqual([]);
  });

  it("preserves zero targets, unresolved qualitative targets, and duplicate conflicts", () => {
    createMeasurementConfiguration(configuration(countKpiId), actorId);
    const zero = createStrategicTarget(
      {
        kpi_id: countKpiId,
        component_id: null,
        target_scope: "full_plan",
        reporting_year: null,
        target_year: 2029,
        external_target_year: false,
        target_value: 0,
        structured_target: null,
        target_description: "Maintain zero overdue items.",
        baseline_year: 2026,
        baseline_value: 3,
        configuration_status: "active",
        source_reference: "Board target",
        last_reviewed_date: "2026-07-09",
      },
      actorId,
    );
    expect(zero.target_value).toBe(0);
    expect(() =>
      createStrategicTarget(
        {
          kpi_id: countKpiId,
          target_scope: "full_plan",
          target_year: 2029,
          target_value: 1,
          target_description: "Duplicate",
        },
        actorId,
      ),
    ).toThrow(StrategyEditConflictError);

    const updated = updateStrategicTarget(
      { id: zero.id, target_value: 4, target_description: "Complete four items." },
      actorId,
    );
    expect(updated).toMatchObject({
      target_value: 4,
      target_description: "Complete four items.",
    });
    const qualitative = createStrategicTarget(
      {
        kpi_id: countKpiId,
        target_scope: "annual",
        reporting_year: 2027,
        target_year: 2027,
        target_value: null,
        target_description: "Target not finalized.",
        configuration_status: "needs_target",
      },
      actorId,
    );
    expect(qualitative.target_value).toBeNull();
    expect(qualitative.configuration_status).toBe("needs_target");
  });

  it("saves and reloads a non-current annual target by reporting year", () => {
    createMeasurementConfiguration(configuration(countKpiId), actorId);
    const saved = createStrategicTarget(
      {
        kpi_id: countKpiId,
        target_scope: "annual",
        reporting_year: 2028,
        target_year: 2028,
        target_value: 24,
        target_description: "Reach 24 annual completions.",
        configuration_status: "active",
      },
      actorId,
    );

    expect(listEffectiveTargetsForKpi(countKpiId, 2028)).toEqual([
      expect.objectContaining({
        id: saved.id,
        reporting_year: 2028,
        target_year: 2028,
        target_value: 24,
      }),
    ]);
    expect(listEffectiveTargetsForKpi(countKpiId, 2026)).toEqual([]);
  });

  it("validates KPI targets against the configuration effective for their year", () => {
    createMeasurementConfiguration(
      configuration(countKpiId, {
        measurement_type: "percentage",
        numerator_label: "Completed items",
        denominator_label: "Eligible items",
        effective_start_year: 2025,
        effective_end_year: 2026,
      }),
      actorId,
    );
    createMeasurementConfiguration(
      configuration(countKpiId, {
        effective_start_year: 2027,
        effective_end_year: 2029,
      }),
      actorId,
    );

    const targetFor2026 = {
      kpi_id: countKpiId,
      target_scope: "annual" as const,
      reporting_year: 2026,
      target_year: 2026,
      target_value: 75,
      target_description: "Reach 75 percent.",
      configuration_status: "active" as const,
    };

    expect(() =>
      createStrategicTarget(
        { ...targetFor2026, target_value: 101 },
        actorId,
      ),
    ).toThrow(StrategyEditValidationError);
    expect(() =>
      createStrategicTarget(
        {
          kpi_id: countKpiId,
          target_scope: "full_plan",
          target_year: 2026,
          target_value: 101,
          target_description: "Reach 101 percent.",
          configuration_status: "active",
        },
        actorId,
      ),
    ).toThrow(StrategyEditValidationError);

    const valid2026Target = createStrategicTarget(targetFor2026, actorId);
    expect(() =>
      updateStrategicTarget(
        { id: valid2026Target.id, target_value: 101 },
        actorId,
      ),
    ).toThrow(StrategyEditValidationError);

    expect(
      createStrategicTarget(
        {
          ...targetFor2026,
          reporting_year: 2027,
          target_year: 2027,
          target_value: 101,
          target_description: "Reach 101 items.",
        },
        actorId,
      ).target_value,
    ).toBe(101);
  });

  it("rejects unsupported or out-of-range active structured targets", () => {
    createMeasurementConfiguration(
      configuration(countKpiId, {
        measurement_type: "percentage",
        unit: "%",
        numerator_label: "Completed",
        denominator_label: "Eligible",
      }),
      actorId,
    );
    const base = {
      kpi_id: countKpiId,
      target_scope: "full_plan" as const,
      target_year: 2029,
      target_value: null,
      target_description: "Structured percentage target.",
      configuration_status: "active" as const,
    };

    expect(() =>
      createStrategicTarget(
        { ...base, structured_target: { value: 500 } },
        actorId,
      ),
    ).toThrow(StrategyEditValidationError);
    expect(() =>
      createStrategicTarget(
        { ...base, structured_target: { unsupported: true } },
        actorId,
      ),
    ).toThrow(StrategyEditValidationError);
    expect(() =>
      createStrategicTarget(
        {
          ...base,
          target_value: 101,
          structured_target: null,
          configuration_status: "draft",
        },
        actorId,
      ),
    ).toThrow(StrategyEditValidationError);
    expect(
      createStrategicTarget(
        { ...base, structured_target: { value: 75 } },
        actorId,
      ),
    ).toMatchObject({
      target_value: null,
      structured_target: { value: 75 },
    });
  });

  it("rejects out-of-domain draft targets before they can be activated", () => {
    createMeasurementConfiguration(
      configuration(countKpiId, {
        measurement_type: "binary",
        unit: "complete",
      }),
      actorId,
    );

    expect(() =>
      createStrategicTarget(
        {
          kpi_id: countKpiId,
          target_scope: "full_plan",
          target_year: 2029,
          target_value: 2,
          target_description: "Invalid binary draft.",
          configuration_status: "draft",
        },
        actorId,
      ),
    ).toThrow(StrategyEditValidationError);
  });

  it("uses the plan-boundary configuration for explicitly external target years", () => {
    createMeasurementConfiguration(configuration(countKpiId), actorId);
    expect(() =>
      createStrategicTarget(
        {
          kpi_id: countKpiId,
          target_scope: "annual",
          reporting_year: 2030,
          target_year: 2030,
          external_target_year: true,
          target_value: 1,
          target_description: "Unreachable annual target.",
          configuration_status: "active",
        },
        actorId,
      ),
    ).toThrow(StrategyEditValidationError);
    const external = createStrategicTarget(
      {
        kpi_id: countKpiId,
        target_scope: "full_plan",
        target_year: 2030,
        external_target_year: true,
        target_value: 0,
        target_description: "Maintain zero overdue items through 2030.",
        configuration_status: "active",
      },
      actorId,
    );

    expect(external).toMatchObject({
      target_year: 2030,
      external_target_year: true,
      target_value: 0,
    });
    expect(listEffectiveTargetsForKpi(countKpiId, 2029)).toEqual([
      expect.objectContaining({ id: external.id, target_value: 0 }),
    ]);
  });

  it("blocks configuration date changes that orphan component or distribution values", () => {
    const componentConfiguration = createMeasurementConfiguration(
      configuration(multiKpiId, {
        measurement_type: "multi_component",
        aggregation_method: "sum",
        configuration_status: "draft",
      }),
      actorId,
    );
    const component = createStrategyComponent(
      {
        configuration_id: componentConfiguration.id,
        slug: "counted-items",
        label: "Counted items",
        measurement_type: "count",
        unit: "items",
        display_order: 0,
        configuration_status: "draft",
      },
      actorId,
    );
    getDb()
      .prepare(
        `INSERT INTO kpi_component_entries (
           component_id, year, period_type, period_index, scalar_value
         ) VALUES (?, 2025, 'annual', 0, 1)`,
      )
      .run(component.id);

    expect(() =>
      updateMeasurementConfiguration(
        { id: componentConfiguration.id, effective_start_year: 2026 },
        actorId,
      ),
    ).toThrow(StrategyEditConflictError);

    const distributionConfiguration = createMeasurementConfiguration(
      configuration(countKpiId, { measurement_type: "distribution" }),
      actorId,
    );
    getDb()
      .prepare(
        `INSERT INTO distribution_observations (
           kpi_id, configuration_id, year, period_type, period_index,
           respondent_count
         ) VALUES (?, ?, 2029, 'annual', 0, 1)`,
      )
      .run(countKpiId, distributionConfiguration.id);

    expectHistoricalSemanticsConflict(() =>
      updateMeasurementConfiguration(
        { id: distributionConfiguration.id, calculation_precision: 2 },
        actorId,
      ),
    );

    expect(() =>
      updateMeasurementConfiguration(
        { id: distributionConfiguration.id, effective_end_year: 2028 },
        actorId,
      ),
    ).toThrow(StrategyEditConflictError);

    expect(
      getDb()
        .prepare(
          `SELECT effective_from_year, effective_to_year
           FROM kpi_measurement_configs WHERE id = ?`,
        )
        .get(componentConfiguration.id),
    ).toEqual({ effective_from_year: 2025, effective_to_year: 2029 });
    expect(
      getDb()
        .prepare(
          `SELECT effective_from_year, effective_to_year
           FROM kpi_measurement_configs WHERE id = ?`,
        )
        .get(distributionConfiguration.id),
    ).toEqual({ effective_from_year: 2025, effective_to_year: 2029 });
  });

  it.each(["annual", "full_plan"] as const)(
    "blocks configuration ranges that orphan a defined %s target",
    (targetScope) => {
      const config = createMeasurementConfiguration(
        configuration(countKpiId),
        actorId,
      );
      createStrategicTarget(
        {
          kpi_id: countKpiId,
          target_scope: targetScope,
          reporting_year: targetScope === "annual" ? 2029 : null,
          target_year: 2029,
          target_value: 25,
          target_description: "Complete 25 items.",
          configuration_status: "active",
        },
        actorId,
      );

      expect(() =>
        updateMeasurementConfiguration(
          { id: config.id, effective_end_year: 2028 },
          actorId,
        ),
      ).toThrow(
        expect.objectContaining({
          code: "target_configuration_coverage_conflict",
        }),
      );
      expect(getMeasurementRange(config.id)).toEqual({
        effective_from_year: 2025,
        effective_to_year: 2029,
      });
    },
  );

  it("creates, activates, edits, and reorders components with audit history", () => {
    const config = createMeasurementConfiguration(
      configuration(multiKpiId, {
        measurement_type: "multi_component",
        aggregation_method: "sum",
        configuration_status: "draft",
      }),
      actorId,
    );
    const first = createStrategyComponent(
      {
        configuration_id: config.id,
        slug: "first",
        label: "First component",
        measurement_type: "count",
        unit: "items",
        display_order: 0,
        configuration_status: "draft",
      },
      actorId,
    );
    const second = createStrategyComponent(
      {
        configuration_id: config.id,
        slug: "second",
        label: "Second component",
        measurement_type: "count",
        unit: "items",
        display_order: 1,
        configuration_status: "draft",
      },
      actorId,
    );
    expect(() =>
      createStrategyComponent(
        {
          configuration_id: config.id,
          slug: "third",
          label: "Third component",
          measurement_type: "count",
          unit: "items",
          display_order: 1,
        },
        actorId,
      ),
    ).toThrow(StrategyEditConflictError);

    createStrategicTarget(
      {
        component_id: first.id,
        target_scope: "full_plan",
        target_year: 2029,
        target_value: 5,
        target_description: "Complete five.",
        configuration_status: "active",
      },
      actorId,
    );
    const active = updateStrategyComponent(
      { id: first.id, configuration_status: "active", label: "Primary component" },
      actorId,
    );
    expect(active).toMatchObject({
      label: "Primary component",
      configuration_status: "active",
    });

    const reordered = reorderStrategyComponents(
      {
        configuration_id: config.id,
        ordered_component_ids: [second.id, first.id],
      },
      actorId,
    );
    expect(reordered.map((component) => component.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(reordered.map((component) => component.display_order)).toEqual([0, 1]);
    const beforeMismatch = reordered.map((component) => component.display_order);
    expect(() =>
      reorderStrategyComponents(
        { configuration_id: config.id, ordered_component_ids: [first.id] },
        actorId,
      ),
    ).toThrow(StrategyEditConflictError);
    expect(
      [second.id, first.id].map(
        (id) =>
          (getDb()
            .prepare("SELECT display_order FROM kpi_components WHERE id = ?")
            .get(id) as { display_order: number }).display_order,
      ),
    ).toEqual(beforeMismatch);
  });

  it("freezes a component set when any sibling target uses its semantics and enforces archive ordering", () => {
    const config = createMeasurementConfiguration(
      configuration(multiKpiId, {
        measurement_type: "multi_component",
        aggregation_method: "sum",
        configuration_status: "draft",
      }),
      actorId,
    );
    const first = createStrategyComponent(
      {
        configuration_id: config.id,
        slug: "first-freeze",
        label: "First freeze component",
        measurement_type: "count",
        unit: "items",
        display_order: 0,
        configuration_status: "draft",
      },
      actorId,
    );
    const sibling = createStrategyComponent(
      {
        configuration_id: config.id,
        slug: "sibling-freeze",
        label: "Sibling freeze component",
        measurement_type: "count",
        unit: "items",
        display_order: 1,
        configuration_status: "draft",
      },
      actorId,
    );
    const target = createStrategicTarget(
      {
        component_id: sibling.id,
        target_scope: "full_plan",
        target_year: 2029,
        target_value: 10,
        target_description: "Complete ten sibling items.",
        configuration_status: "active",
      },
      actorId,
    );

    expect(() =>
      updateStrategyComponent(
        { id: first.id, measurement_type: "percentage", unit: "%" },
        actorId,
      ),
    ).toThrow(
      expect.objectContaining({ code: "target_component_semantics_conflict" }),
    );
    expect(() => archiveComponent(first.id, actorId)).toThrow(
      expect.objectContaining({ code: "target_component_semantics_conflict" }),
    );

    archiveTarget(target.id, actorId);
    archiveComponent(first.id, actorId);
    restoreComponent(first.id, actorId);
    restoreTarget(target.id, actorId);
    expect(
      getDb()
        .prepare("SELECT archived_at FROM kpi_components WHERE id = ?")
        .get(first.id),
    ).toEqual({ archived_at: null });
  });

  it("requires a successor before adding components after first-class history exists", () => {
    const config = createMeasurementConfiguration(
      configuration(multiKpiId, {
        measurement_type: "multi_component",
        aggregation_method: "sum",
        configuration_status: "draft",
      }),
      actorId,
    );
    const existing = createStrategyComponent(
      {
        configuration_id: config.id,
        slug: "historical-component",
        label: "Historical component",
        measurement_type: "count",
        unit: "items",
        display_order: 0,
        configuration_status: "draft",
      },
      actorId,
    );
    getDb().prepare(
      `INSERT INTO kpi_component_entries (
         component_id, year, period_type, period_index, scalar_value, updated_by
       ) VALUES (?, 2026, 'annual', 0, 5, ?)`,
    ).run(existing.id, actorId);

    expect(() =>
      createStrategyComponent(
        {
          configuration_id: config.id,
          slug: "late-component",
          label: "Late component",
          measurement_type: "count",
          unit: "items",
          display_order: 1,
          configuration_status: "draft",
        },
        actorId,
      ),
    ).toThrow(expect.objectContaining({ code: "historical_semantics_conflict" }));
  });

  it("rejects configuration create, update, and restore under an archived KPI (S040-C1)", () => {
    const created = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );
    getDb()
      .prepare("UPDATE kpis SET archived_at = datetime('now') WHERE id = ?")
      .run(countKpiId);

    expect(() =>
      updateMeasurementConfiguration(
        { id: created.id, owner: "Evaluation team" },
        actorId,
      ),
    ).toThrow(expect.objectContaining({ code: "archived_kpi_context" }));

    getDb()
      .prepare("UPDATE kpis SET archived_at = datetime('now') WHERE id = ?")
      .run(multiKpiId);
    expect(() =>
      createMeasurementConfiguration(configuration(multiKpiId), actorId),
    ).toThrow(expect.objectContaining({ code: "archived_kpi_context" }));

    expect(() => archiveMeasurementConfig(created.id, actorId)).toThrow(
      expect.objectContaining({ code: "archived_kpi_context" }),
    );
    getDb()
      .prepare("UPDATE kpis SET archived_at = NULL WHERE id = ?")
      .run(countKpiId);
    archiveMeasurementConfig(created.id, actorId);
    getDb()
      .prepare("UPDATE kpis SET archived_at = datetime('now') WHERE id = ?")
      .run(countKpiId);
    expect(() => restoreMeasurementConfig(created.id, actorId)).toThrow(
      expect.objectContaining({ code: "archived_kpi_context" }),
    );
    expect(
      getDb()
        .prepare(
          "SELECT archived_at FROM kpi_measurement_configs WHERE id = ?",
        )
        .get(created.id),
    ).not.toEqual({ archived_at: null });

    getDb()
      .prepare("UPDATE kpis SET archived_at = NULL WHERE id IN (?, ?)")
      .run(countKpiId, multiKpiId);
    restoreMeasurementConfig(created.id, actorId);
    expect(
      getDb()
        .prepare(
          "SELECT archived_at FROM kpi_measurement_configs WHERE id = ?",
        )
        .get(created.id),
    ).toEqual({ archived_at: null });
  });

  it("rejects configuration and goal edits under an archived Strategic Priority (S040-C1)", () => {
    getDb()
      .prepare("UPDATE categories SET archived_at = datetime('now') WHERE id = ?")
      .run(categoryId);

    expect(() =>
      createMeasurementConfiguration(configuration(countKpiId), actorId),
    ).toThrow(expect.objectContaining({ code: "archived_kpi_context" }));
    expect(() =>
      updateStrategicGoalSettings(
        { id: goalId, owner: "New owner" },
        actorId,
      ),
    ).toThrow(expect.objectContaining({ code: "archived_goal_context" }));

    getDb()
      .prepare("UPDATE categories SET archived_at = NULL WHERE id = ?")
      .run(categoryId);
    const updated = updateStrategicGoalSettings(
      { id: goalId, owner: "New owner" },
      actorId,
    );
    expect(updated.owner).toBe("New owner");
  });

  it("rejects component restore when its display order was taken by a successor (S013-C1)", () => {
    const config = createMeasurementConfiguration(
      configuration(multiKpiId, {
        measurement_type: "multi_component",
        aggregation_method: "sum",
        configuration_status: "draft",
      }),
      actorId,
    );
    /** Builds a component create payload sharing display order zero. */
    const componentInput = (slug: string, label: string) => ({
      configuration_id: config.id,
      slug,
      label,
      measurement_type: "count",
      unit: "items",
      display_order: 0,
      configuration_status: "draft",
    });
    const retired = createStrategyComponent(
      componentInput("retired-component", "Retired component"),
      actorId,
    );
    archiveComponent(retired.id, actorId);
    createStrategyComponent(
      componentInput("successor-component", "Successor component"),
      actorId,
    );

    expect(() => restoreComponent(retired.id, actorId)).toThrow(
      expect.objectContaining({ code: "component_order_conflict" }),
    );
    expect(
      getDb()
        .prepare("SELECT archived_at FROM kpi_components WHERE id = ?")
        .get(retired.id),
    ).not.toEqual({ archived_at: null });
  });

  it("rejects component restore while its configuration or KPI is archived (S040-C1)", () => {
    const config = createMeasurementConfiguration(
      configuration(multiKpiId, {
        measurement_type: "multi_component",
        aggregation_method: "sum",
        configuration_status: "draft",
      }),
      actorId,
    );
    const component = createStrategyComponent(
      {
        configuration_id: config.id,
        slug: "restorable-component",
        label: "Restorable component",
        measurement_type: "count",
        unit: "items",
        display_order: 0,
        configuration_status: "draft",
      },
      actorId,
    );
    archiveComponent(component.id, actorId);
    archiveMeasurementConfig(config.id, actorId);

    expect(() => restoreComponent(component.id, actorId)).toThrow(
      expect.objectContaining({ code: "archived_component_context" }),
    );

    restoreMeasurementConfig(config.id, actorId);
    getDb()
      .prepare("UPDATE kpis SET archived_at = datetime('now') WHERE id = ?")
      .run(multiKpiId);
    expect(() => restoreComponent(component.id, actorId)).toThrow(
      expect.objectContaining({ code: "archived_kpi_context" }),
    );

    getDb()
      .prepare("UPDATE kpis SET archived_at = NULL WHERE id = ?")
      .run(multiKpiId);
    restoreComponent(component.id, actorId);
    expect(
      getDb()
        .prepare("SELECT archived_at FROM kpi_components WHERE id = ?")
        .get(component.id),
    ).toEqual({ archived_at: null });
  });

  it("freezes component definition mutations under an archived KPI or priority lineage (ISSUE-1)", () => {
    const config = createMeasurementConfiguration(
      configuration(multiKpiId, {
        measurement_type: "multi_component",
        aggregation_method: "sum",
        configuration_status: "draft",
      }),
      actorId,
    );
    /** Builds a component create payload for the multi-component config. */
    const componentInput = (slug: string, displayOrder: number) => ({
      configuration_id: config.id,
      slug,
      label: slug,
      measurement_type: "count" as const,
      unit: "items",
      display_order: displayOrder,
      configuration_status: "draft" as const,
    });
    const existing = createStrategyComponent(
      componentInput("existing-component", 0),
      actorId,
    );

    getDb()
      .prepare("UPDATE kpis SET archived_at = datetime('now') WHERE id = ?")
      .run(multiKpiId);

    expect(() =>
      createStrategyComponent(componentInput("late-component", 1), actorId),
    ).toThrow(expect.objectContaining({ code: "archived_kpi_context" }));
    expect(() =>
      updateStrategyComponent(
        { id: existing.id, label: "Renamed while hidden" },
        actorId,
      ),
    ).toThrow(expect.objectContaining({ code: "archived_kpi_context" }));
    expect(() =>
      reorderStrategyComponents(
        { configuration_id: config.id, ordered_component_ids: [existing.id] },
        actorId,
      ),
    ).toThrow(expect.objectContaining({ code: "archived_kpi_context" }));
    expect(() => archiveComponent(existing.id, actorId)).toThrow(
      expect.objectContaining({ code: "archived_kpi_context" }),
    );

    getDb()
      .prepare("UPDATE kpis SET archived_at = NULL WHERE id = ?")
      .run(multiKpiId);
    getDb()
      .prepare("UPDATE categories SET archived_at = datetime('now') WHERE id = ?")
      .run(categoryId);
    expect(() =>
      createStrategyComponent(componentInput("late-component", 1), actorId),
    ).toThrow(expect.objectContaining({ code: "archived_kpi_context" }));

    getDb()
      .prepare("UPDATE categories SET archived_at = NULL WHERE id = ?")
      .run(categoryId);
    const created = createStrategyComponent(
      componentInput("late-component", 1),
      actorId,
    );
    expect(created.configuration_id).toBe(config.id);
    const renamed = updateStrategyComponent(
      { id: existing.id, label: "Renamed in the open" },
      actorId,
    );
    expect(renamed.label).toBe("Renamed in the open");
  });

  it("gates target writes and restores on the full KPI and priority lineage (ISSUE-2)", () => {
    createMeasurementConfiguration(configuration(countKpiId), actorId);
    const multiConfig = createMeasurementConfiguration(
      configuration(multiKpiId, {
        measurement_type: "multi_component",
        aggregation_method: "sum",
        configuration_status: "active",
      }),
      actorId,
    );
    const component = createStrategyComponent(
      {
        configuration_id: multiConfig.id,
        slug: "scoped-component",
        label: "Scoped component",
        measurement_type: "count",
        unit: "items",
        display_order: 0,
        configuration_status: "draft",
      },
      actorId,
    );
    const componentTarget = createStrategicTarget(
      {
        component_id: component.id,
        target_scope: "full_plan",
        target_year: 2029,
        target_value: 10,
        configuration_status: "active",
      },
      actorId,
    );
    const kpiTarget = createStrategicTarget(
      {
        kpi_id: countKpiId,
        target_scope: "full_plan",
        target_year: 2029,
        target_value: 75,
        configuration_status: "active",
      },
      actorId,
    );
    const kpiAnnualTarget = createStrategicTarget(
      {
        kpi_id: countKpiId,
        target_scope: "annual",
        reporting_year: 2026,
        target_year: 2026,
        target_value: 70,
        configuration_status: "active",
      },
      actorId,
    );
    const componentAnnualTarget = createStrategicTarget(
      {
        component_id: component.id,
        target_scope: "annual",
        reporting_year: 2026,
        target_year: 2026,
        target_value: 8,
        configuration_status: "active",
      },
      actorId,
    );

    getDb()
      .prepare("UPDATE kpis SET archived_at = datetime('now') WHERE id = ?")
      .run(multiKpiId);
    expect(() =>
      createStrategicTarget(
        {
          component_id: component.id,
          target_scope: "annual",
          reporting_year: 2028,
          target_year: 2028,
          target_value: 5,
          configuration_status: "active",
        },
        actorId,
      ),
    ).toThrow(expect.objectContaining({ code: "archived_target_subject" }));
    expect(() =>
      updateStrategicTarget(
        { id: componentTarget.id, target_value: 12 },
        actorId,
      ),
    ).toThrow(expect.objectContaining({ code: "archived_target_subject" }));
    getDb()
      .prepare("UPDATE kpis SET archived_at = NULL WHERE id = ?")
      .run(multiKpiId);

    getDb()
      .prepare("UPDATE categories SET archived_at = datetime('now') WHERE id = ?")
      .run(categoryId);
    expect(() =>
      createStrategicTarget(
        {
          kpi_id: countKpiId,
          target_scope: "annual",
          reporting_year: 2028,
          target_year: 2028,
          target_value: 50,
          configuration_status: "active",
        },
        actorId,
      ),
    ).toThrow(expect.objectContaining({ code: "archived_target_subject" }));
    expect(() =>
      updateStrategicTarget({ id: kpiTarget.id, target_value: 80 }, actorId),
    ).toThrow(expect.objectContaining({ code: "archived_target_subject" }));

    for (const target of [
      kpiTarget,
      kpiAnnualTarget,
      componentTarget,
      componentAnnualTarget,
    ]) {
      expect(() => archiveTarget(target.id, actorId)).toThrow(
        expect.objectContaining({ code: "archived_kpi_context" }),
      );
    }

    getDb()
      .prepare("UPDATE categories SET archived_at = NULL WHERE id = ?")
      .run(categoryId);
    archiveTarget(kpiTarget.id, actorId);
    getDb()
      .prepare("UPDATE categories SET archived_at = datetime('now') WHERE id = ?")
      .run(categoryId);
    expect(() => restoreTarget(kpiTarget.id, actorId)).toThrow(
      expect.objectContaining({ code: "archived_target_subject" }),
    );
    expect(
      getDb()
        .prepare("SELECT archived_at FROM kpi_targets WHERE id = ?")
        .get(kpiTarget.id),
    ).not.toEqual({ archived_at: null });

    getDb()
      .prepare("UPDATE categories SET archived_at = NULL WHERE id = ?")
      .run(categoryId);
    restoreTarget(kpiTarget.id, actorId);
    expect(
      getDb()
        .prepare("SELECT archived_at FROM kpi_targets WHERE id = ?")
        .get(kpiTarget.id),
    ).toEqual({ archived_at: null });
  });

  it("reports an archived KPI configuration as archived rather than missing", () => {
    const configurationRow = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );
    archiveMeasurementConfig(configurationRow.id, actorId);

    expect(() =>
      createStrategicTarget(
        {
          kpi_id: countKpiId,
          target_scope: "annual",
          reporting_year: 2026,
          target_year: 2026,
          target_value: 25,
          configuration_status: "active",
        },
        actorId,
      ),
    ).toThrow(expect.objectContaining({ code: "archived_target_subject" }));
  });

  it("gates goal successor creation and goal restore on the priority lineage (ISSUE-3)", () => {
    getDb()
      .prepare("UPDATE categories SET archived_at = datetime('now') WHERE id = ?")
      .run(categoryId);

    expect(() =>
      createSuccessorStrategicGoal(
        {
          predecessor_id: goalId,
          effective_start_year: 2027,
          update: { id: goalId, owner: "Successor owner" },
        },
        actorId,
      ),
    ).toThrow(expect.objectContaining({ code: "archived_goal_context" }));
    expect(() => archiveStrategicGoal(goalId, actorId)).toThrow(
      expect.objectContaining({ code: "archived_goal_context" }),
    );

    getDb()
      .prepare("UPDATE categories SET archived_at = NULL WHERE id = ?")
      .run(categoryId);
    archiveStrategicGoal(goalId, actorId);
    getDb()
      .prepare("UPDATE categories SET archived_at = datetime('now') WHERE id = ?")
      .run(categoryId);
    expect(() => restoreStrategicGoal(goalId, actorId)).toThrow(
      expect.objectContaining({ code: "archived_goal_context" }),
    );
    expect(
      getDb()
        .prepare("SELECT archived_at FROM strategic_goals WHERE id = ?")
        .get(goalId),
    ).not.toEqual({ archived_at: null });

    getDb()
      .prepare("UPDATE categories SET archived_at = NULL WHERE id = ?")
      .run(categoryId);
    restoreStrategicGoal(goalId, actorId);
    expect(
      getDb()
        .prepare("SELECT archived_at FROM strategic_goals WHERE id = ?")
        .get(goalId),
    ).toEqual({ archived_at: null });
    const successor = createSuccessorStrategicGoal(
      {
        predecessor_id: goalId,
        effective_start_year: 2027,
        update: { id: goalId, owner: "Successor owner" },
      },
      actorId,
    );
    expect(successor.successor.plan_start_year).toBe(2027);
  });

  it("refuses stale-revision updates and preserves the first writer (S070-C2)", () => {
    /** Reads the current optimistic-concurrency token for a row. */
    const revisionOf = (table: string, id: number): string =>
      String(
        (
          getDb()
            .prepare(`SELECT updated_at FROM ${table} WHERE id = ?`)
            .get(id) as { updated_at: string }
        ).updated_at,
      );

    const goalRevision = revisionOf("strategic_goals", goalId);
    updateStrategicGoalSettings(
      { id: goalId, expected_revision: goalRevision, owner: "Alice (editor A)" },
      actorId,
    );
    const goalRevisionAfterA = revisionOf("strategic_goals", goalId);
    expect(goalRevisionAfterA).not.toBe(goalRevision);
    expect(() =>
      updateStrategicGoalSettings(
        {
          id: goalId,
          expected_revision: goalRevision,
          owner: null,
          due_date: "2027-12-31",
        },
        actorId,
      ),
    ).toThrow(expect.objectContaining({ code: "stale_revision" }));
    expect(
      getDb()
        .prepare("SELECT owner, due_date FROM strategic_goals WHERE id = ?")
        .get(goalId),
    ).toEqual({ owner: "Alice (editor A)", due_date: null });

    const membershipRevision = revisionOf("goal_kpis", membershipId);
    updateStrategicGoalMembership(
      { id: membershipId, expected_revision: membershipRevision, display_order: 7 },
      actorId,
    );
    expect(() =>
      updateStrategicGoalMembership(
        { id: membershipId, expected_revision: membershipRevision, display_order: 3 },
        actorId,
      ),
    ).toThrow(expect.objectContaining({ code: "stale_revision" }));
    expect(
      getDb()
        .prepare("SELECT display_order FROM goal_kpis WHERE id = ?")
        .get(membershipId),
    ).toEqual({ display_order: 7 });
    expect(() =>
      createSuccessorStrategicGoalMembership(
        {
          predecessor_id: membershipId,
          expected_revision: membershipRevision,
          effective_start_year: 2027,
          role: "informational",
          weight: 2,
          display_order: 3,
        },
        actorId,
      ),
    ).toThrow(expect.objectContaining({ code: "stale_revision" }));
    expect(
      getDb()
        .prepare("SELECT effective_to_year FROM goal_kpis WHERE id = ?")
        .get(membershipId),
    ).toEqual({ effective_to_year: 2029 });

    const config = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );
    const configRevision = revisionOf("kpi_measurement_configs", config.id);
    updateMeasurementConfiguration(
      { id: config.id, expected_revision: configRevision, unit: "visitors" },
      actorId,
    );
    expect(() =>
      updateMeasurementConfiguration(
        {
          id: config.id,
          expected_revision: configRevision,
          unit: "visits",
          owner: "editor B",
        },
        actorId,
      ),
    ).toThrow(expect.objectContaining({ code: "stale_revision" }));
    expect(
      getDb()
        .prepare(
          "SELECT unit, owner FROM kpi_measurement_configs WHERE id = ?",
        )
        .get(config.id),
    ).toEqual({ unit: "visitors", owner: null });
    expect(() =>
      createSuccessorMeasurementConfiguration(
        {
          predecessor_id: config.id,
          expected_revision: configRevision,
          successor: configuration(countKpiId, {
            effective_start_year: 2027,
            effective_end_year: 2029,
            unit: "visits",
          }),
        },
        actorId,
      ),
    ).toThrow(expect.objectContaining({ code: "stale_revision" }));
    expect(getMeasurementRange(config.id)).toEqual({
      effective_from_year: 2025,
      effective_to_year: 2029,
    });

    const target = createStrategicTarget(
      {
        kpi_id: countKpiId,
        target_scope: "full_plan",
        target_year: 2029,
        target_value: 100,
        configuration_status: "active",
      },
      actorId,
    );
    const targetRevision = revisionOf("kpi_targets", target.id);
    updateStrategicTarget(
      { id: target.id, expected_revision: targetRevision, target_value: 250 },
      actorId,
    );
    expect(() =>
      updateStrategicTarget(
        {
          id: target.id,
          expected_revision: targetRevision,
          target_value: 100,
          target_description: "Editor B note",
        },
        actorId,
      ),
    ).toThrow(expect.objectContaining({ code: "stale_revision" }));
    expect(
      getDb()
        .prepare(
          "SELECT target_value, target_description FROM kpi_targets WHERE id = ?",
        )
        .get(target.id),
    ).toEqual({ target_value: 250, target_description: null });

    expect(() =>
      createSuccessorStrategicGoal(
        {
          predecessor_id: goalId,
          effective_start_year: 2027,
          update: {
            id: goalId,
            expected_revision: goalRevision,
            owner: "Stale successor",
          },
        },
        actorId,
      ),
    ).toThrow(expect.objectContaining({ code: "stale_revision" }));

    const withoutRevision = updateStrategicGoalSettings(
      { id: goalId, resolution_notes: "Direct feature call without CAS." },
      actorId,
    );
    expect(withoutRevision.resolution_notes).toBe(
      "Direct feature call without CAS.",
    );
  });

  it("requires a predecessor revision at both successor feature boundaries", () => {
    const predecessor = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );

    expect(() =>
      createSuccessorMeasurementConfiguration(
        {
          predecessor_id: predecessor.id,
          successor: configuration(countKpiId, {
            effective_start_year: 2027,
            effective_end_year: 2029,
          }),
        },
        actorId,
      ),
    ).toThrow(StrategyEditValidationError);
    expect(getMeasurementRange(predecessor.id)).toEqual({
      effective_from_year: 2025,
      effective_to_year: 2029,
    });

    expect(() =>
      createSuccessorStrategicGoalMembership(
        {
          predecessor_id: membershipId,
          effective_start_year: 2027,
          role: "informational",
          weight: 2,
          display_order: 3,
        },
        actorId,
      ),
    ).toThrow(StrategyEditValidationError);
    expect(
      getDb()
        .prepare("SELECT effective_to_year FROM goal_kpis WHERE id = ?")
        .get(membershipId),
    ).toEqual({ effective_to_year: 2029 });
  });

  it("monotonically advances the predecessor revision when a configuration is split", () => {
    const predecessor = createMeasurementConfiguration(
      configuration(countKpiId),
      actorId,
    );
    getDb()
      .prepare(
        `UPDATE kpi_measurement_configs
         SET updated_at = datetime('now', '+1 minute')
         WHERE id = ?`,
      )
      .run(predecessor.id);
    const oldRevision = String(
      (
        getDb()
          .prepare(
            "SELECT updated_at FROM kpi_measurement_configs WHERE id = ?",
          )
          .get(predecessor.id) as { updated_at: string }
      ).updated_at,
    );

    createSuccessorMeasurementConfiguration(
      {
        predecessor_id: predecessor.id,
        expected_revision: oldRevision,
        successor: configuration(countKpiId, {
          effective_start_year: 2027,
          effective_end_year: 2029,
          unit: "visitors",
        }),
      },
      actorId,
    );

    const newRevision = String(
      (
        getDb()
          .prepare(
            "SELECT updated_at FROM kpi_measurement_configs WHERE id = ?",
          )
          .get(predecessor.id) as { updated_at: string }
      ).updated_at,
    );
    expect(newRevision > oldRevision).toBe(true);
    expect(() =>
      updateMeasurementConfiguration(
        {
          id: predecessor.id,
          expected_revision: oldRevision,
          owner: "Stale editor",
        },
        actorId,
      ),
    ).toThrow(expect.objectContaining({ code: "stale_revision" }));
  });

  it("monotonically advances membership revisions when a goal successor splits its members", () => {
    getDb()
      .prepare(
        `UPDATE goal_kpis
         SET updated_at = datetime('now', '+1 minute')
         WHERE id = ?`,
      )
      .run(membershipId);
    const oldRevision = String(
      (
        getDb()
          .prepare("SELECT updated_at FROM goal_kpis WHERE id = ?")
          .get(membershipId) as { updated_at: string }
      ).updated_at,
    );

    createSuccessorStrategicGoal(
      {
        predecessor_id: goalId,
        effective_start_year: 2027,
        update: { id: goalId, owner: "Successor owner" },
      },
      actorId,
    );

    const newRevision = String(
      (
        getDb()
          .prepare("SELECT updated_at FROM goal_kpis WHERE id = ?")
          .get(membershipId) as { updated_at: string }
      ).updated_at,
    );
    expect(newRevision > oldRevision).toBe(true);
    expect(() =>
      updateStrategicGoalMembership(
        {
          id: membershipId,
          expected_revision: oldRevision,
          display_order: 5,
        },
        actorId,
      ),
    ).toThrow(expect.objectContaining({ code: "stale_revision" }));
  });

  it("monotonically advances the predecessor revision when a membership is split", () => {
    getDb()
      .prepare(
        `UPDATE goal_kpis
         SET updated_at = datetime('now', '+1 minute')
         WHERE id = ?`,
      )
      .run(membershipId);
    const oldRevision = String(
      (
        getDb()
          .prepare("SELECT updated_at FROM goal_kpis WHERE id = ?")
          .get(membershipId) as { updated_at: string }
      ).updated_at,
    );

    createSuccessorStrategicGoalMembership(
      {
        predecessor_id: membershipId,
        expected_revision: oldRevision,
        effective_start_year: 2027,
        role: "informational",
        weight: 2,
        display_order: 5,
      },
      actorId,
    );

    const newRevision = String(
      (
        getDb()
          .prepare("SELECT updated_at FROM goal_kpis WHERE id = ?")
          .get(membershipId) as { updated_at: string }
      ).updated_at,
    );
    expect(newRevision > oldRevision).toBe(true);
    expect(() =>
      updateStrategicGoalMembership(
        {
          id: membershipId,
          expected_revision: oldRevision,
          display_order: 7,
        },
        actorId,
      ),
    ).toThrow(expect.objectContaining({ code: "stale_revision" }));
  });
});
