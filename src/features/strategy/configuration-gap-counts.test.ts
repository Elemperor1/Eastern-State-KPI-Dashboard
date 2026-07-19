import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb } from "@/lib/db";
import { bootstrapTestInstallation } from "@/features/installation/test-fixture";
import {
  countGoalsExcludedByConfiguration,
  getConfigurationGapCounts,
  listConfigurationGaps,
} from "./queries";

describe("configuration-gap goal counts", () => {
  it("does not exclude a goal when another required KPI remains eligible", () => {
    expect(countGoalsExcludedByConfiguration([
      { goal_id: 1, role: "required", exclusion_reasons: ["missing_target"] },
      { goal_id: 1, role: "required", exclusion_reasons: [] },
      { goal_id: 2, role: "required", exclusion_reasons: ["needs_definition"] },
      { goal_id: 2, role: "informational", exclusion_reasons: [] },
      { goal_id: 3, role: "required", exclusion_reasons: [] },
    ])).toBe(1);
  });

  it.each(["needs_definition", "needs_target"] as const)(
    "excludes an otherwise configured goal when its goal status is %s",
    (goalConfigurationStatus) => {
      const rows = [{
        goal_id: 1,
        role: "required" as const,
        exclusion_reasons: [],
        goal_configuration_status: goalConfigurationStatus,
      }];

      expect(countGoalsExcludedByConfiguration(rows)).toBe(1);
    },
  );
});

type ComponentAggregation =
  | "all_complete"
  | "average"
  | "weighted_average"
  | "sum"
  | "ratio";

interface ComponentTargetFixture {
  kpiId: number;
  goalId: number;
  componentIds: [number, number];
}

function seedComponentTargetFixture(
  aggregationMethod: ComponentAggregation,
): ComponentTargetFixture {
  const db = getDb();
  const categoryId = Number(
    db
      .prepare(
        `INSERT INTO categories (plan_id, slug, name)
         VALUES ((SELECT id FROM strategic_plans WHERE status = 'active'),
                 'component-target-priority', 'Component Target Priority')`,
      )
      .run().lastInsertRowid,
  );
  const kpiId = Number(
    db
      .prepare(
        `INSERT INTO kpis (
           category_id, slug, name, unit, unit_type,
           reporting_frequency, direction
         ) VALUES (?, 'component-target-kpi', 'Component Target KPI',
                   'items', 'count', 'annual', 'higher')`,
      )
      .run(categoryId).lastInsertRowid,
  );
  const goalId = Number(
    db
      .prepare(
        `INSERT INTO strategic_goals (
           priority_id, slug, name, plan_start_year, plan_end_year,
           configuration_status
         ) VALUES (?, 'component-target-goal', 'Component Target Goal',
                   2025, 2029, 'active')`,
      )
      .run(categoryId).lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO goal_kpis (
       goal_id, kpi_id, is_required, effective_from_year, effective_to_year
     ) VALUES (?, ?, 1, 2025, 2029)`,
  ).run(goalId, kpiId);
  const configurationId = Number(
    db
      .prepare(
        `INSERT INTO kpi_measurement_configs (
           kpi_id, effective_from_year, effective_to_year, measurement_type,
           unit, reporting_frequency, aggregation_method, configuration_status
         ) VALUES (?, 2025, 2029, 'multi_component', 'items', 'annual', ?, 'active')`,
      )
      .run(kpiId, aggregationMethod).lastInsertRowid,
  );
  const insertComponent = db.prepare(
    `INSERT INTO kpi_components (
       kpi_id, configuration_id, slug, label, measurement_type, unit,
       aggregation_role, weight, display_order, configuration_status
     ) VALUES (?, ?, ?, ?, 'count', 'items', ?, ?, ?, 'active')`,
  );
  const firstComponentId = Number(
    insertComponent.run(
      kpiId,
      configurationId,
      "component-one",
      "Component one",
      aggregationMethod === "ratio" ? "numerator" : "value",
      1,
      1,
    ).lastInsertRowid,
  );
  const secondComponentId = Number(
    insertComponent.run(
      kpiId,
      configurationId,
      "component-two",
      "Component two",
      aggregationMethod === "ratio" ? "denominator" : "value",
      2,
      2,
    ).lastInsertRowid,
  );
  addComponentTarget(firstComponentId, 0);
  return {
    kpiId,
    goalId,
    componentIds: [firstComponentId, secondComponentId],
  };
}

function addComponentTarget(componentId: number, value: number): number {
  return Number(
    getDb()
      .prepare(
        `INSERT INTO kpi_targets (
           component_id, target_scope, target_year, target_value,
           target_description, configuration_status
         ) VALUES (?, 'full_plan', 2029, ?, 'Component target', 'active')`,
      )
      .run(componentId, value).lastInsertRowid,
  );
}

function addParentTarget(kpiId: number, value: number): number {
  return Number(
    getDb()
      .prepare(
        `INSERT INTO kpi_targets (
           kpi_id, target_scope, target_year, target_value,
           target_description, configuration_status
         ) VALUES (?, 'full_plan', 2029, ?, 'Parent target', 'active')`,
      )
      .run(kpiId, value).lastInsertRowid,
  );
}

function targetGap(kpiId: number, goalId: number) {
  return listConfigurationGaps({ year: 2026, goal_id: goalId }).find(
    (gap) => gap.kpi.id === kpiId,
  );
}

describe("configuration-gap component target completeness", () => {
  let tmpDir: string;
  let originalDatabasePath: string | undefined;
  let databaseIndex = 0;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-gap-targets-"));
    originalDatabasePath = process.env.DATABASE_PATH;
  });

  beforeEach(() => {
    resetDb();
    process.env.DATABASE_PATH = path.join(
      tmpDir,
      `component-targets-${databaseIndex++}.db`,
    );
    bootstrapTestInstallation();
  });

  afterAll(() => {
    resetDb();
    if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDatabasePath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("requires every active all-complete component to retain a calculable target", () => {
    const fixture = seedComponentTargetFixture("all_complete");
    addParentTarget(fixture.kpiId, 1);

    expect(targetGap(fixture.kpiId, fixture.goalId)).toMatchObject({
      missing_target: true,
      exclusion_reasons: expect.arrayContaining(["missing_target"]),
    });
    expect(
      getConfigurationGapCounts({ year: 2026, goal_id: fixture.goalId }),
    ).toMatchObject({
      kpis_needing_targets: 1,
      goals_excluded_from_completion: 1,
    });

    const secondTargetId = addComponentTarget(fixture.componentIds[1], 10);
    expect(targetGap(fixture.kpiId, fixture.goalId)).toBeUndefined();

    getDb()
      .prepare("UPDATE kpi_targets SET archived_at = datetime('now') WHERE id = ?")
      .run(secondTargetId);
    expect(targetGap(fixture.kpiId, fixture.goalId)).toMatchObject({
      missing_target: true,
    });
  });

  it.each(["sum", "average", "weighted_average"] as const)(
    "accepts a %s parent target or a complete component-target set",
    (aggregationMethod) => {
      const fixture = seedComponentTargetFixture(aggregationMethod);
      expect(targetGap(fixture.kpiId, fixture.goalId)).toMatchObject({
        missing_target: true,
      });

      const secondTargetId = addComponentTarget(fixture.componentIds[1], 10);
      expect(targetGap(fixture.kpiId, fixture.goalId)).toBeUndefined();

      getDb()
        .prepare("UPDATE kpi_targets SET archived_at = datetime('now') WHERE id = ?")
        .run(secondTargetId);
      expect(targetGap(fixture.kpiId, fixture.goalId)).toMatchObject({
        missing_target: true,
      });

      addParentTarget(fixture.kpiId, 10);
      expect(targetGap(fixture.kpiId, fixture.goalId)).toBeUndefined();
    },
  );

  it("requires a parent target for ratio aggregation", () => {
    const fixture = seedComponentTargetFixture("ratio");
    addComponentTarget(fixture.componentIds[1], 10);

    expect(targetGap(fixture.kpiId, fixture.goalId)).toMatchObject({
      missing_target: true,
    });

    addParentTarget(fixture.kpiId, 50);
    expect(targetGap(fixture.kpiId, fixture.goalId)).toBeUndefined();
  });
});
