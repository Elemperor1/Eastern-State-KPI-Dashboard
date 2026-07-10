import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb } from "@/lib/db";
import {
  createMeasurementConfiguration,
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
          `INSERT INTO categories (slug, name, sort_order)
           VALUES ('visitor-experience', 'Visitor Experience', 1)`,
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
});
