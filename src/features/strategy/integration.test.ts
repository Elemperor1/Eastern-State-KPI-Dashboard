import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  STRATEGIC_GOAL_DEFINITIONS,
  STRATEGIC_KPI_DEFINITIONS,
} from "@/features/catalog";
import { STRATEGIC_PLAN_CATEGORIES } from "@/features/catalog/strategic-plan";
import { getDb, resetDb } from "@/lib/db";
import {
  archiveComponent,
  archiveMeasurementConfig,
  archiveStrategicGoal,
  archiveTarget,
  ensureStrategicPlanConfiguration,
  restoreComponent,
  restoreMeasurementConfig,
  restoreStrategicGoal,
  restoreTarget,
  StrategyConfigurationError,
  StrategyEntityNotFoundError,
  updateMeasurementConfigurationStatus,
} from "./mutations";
import {
  getConfigurationGapCounts,
  getEffectiveMeasurementConfig,
  getStrategicGoalBySlug,
  listConfigurationGaps,
  listEffectiveMeasurementConfigs,
  listEffectiveTargetsForKpi,
  listStrategicGoals,
} from "./queries";
import { listStrategicAuditEvents } from "./audit";

function seedCanonicalCatalog(): void {
  const db = getDb();
  const insertCategory = db.prepare(
    `INSERT INTO categories (slug, name, description, sort_order)
     VALUES (?, ?, ?, ?)`,
  );
  const insertKpi = db.prepare(
    `INSERT INTO kpis (
       category_id, slug, name, unit, unit_type, reporting_frequency,
       direction, description, sort_order
     ) VALUES (?, ?, ?, ?, ?, 'annual', ?, ?, ?)`,
  );
  for (const category of STRATEGIC_PLAN_CATEGORIES) {
    const categoryId = Number(
      insertCategory.run(
        category.slug,
        category.name,
        category.description,
        category.sort_order,
      ).lastInsertRowid,
    );
    for (const kpi of category.annual) {
      insertKpi.run(
        categoryId,
        kpi.slug,
        kpi.name,
        kpi.unit,
        kpi.unit_type,
        kpi.direction,
        kpi.description,
        kpi.sort_order,
      );
    }
    for (const kpi of category.breakdown ?? []) {
      insertKpi.run(
        categoryId,
        kpi.slug,
        kpi.name,
        kpi.unit,
        "breakdown",
        kpi.direction,
        kpi.description,
        kpi.sort_order,
      );
    }
  }
}

function scalar(sql: string): number {
  return Number((getDb().prepare(sql).get() as { count: number }).count);
}

describe("strategy persistence integration", () => {
  let tmpDir: string;
  let originalDbPath: string | undefined;
  let databaseIndex = 0;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-strategy-test-"));
    originalDbPath = process.env.DATABASE_PATH;
  });

  beforeEach(() => {
    resetDb();
    process.env.DATABASE_PATH = path.join(
      tmpDir,
      `strategy-${databaseIndex++}.db`,
    );
    seedCanonicalCatalog();
  });

  afterAll(() => {
    resetDb();
    if (originalDbPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDbPath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("backfills the exact canonical map idempotently without deleting extra rows", () => {
    const categoryId = Number(
      (
        getDb()
          .prepare("SELECT id FROM categories ORDER BY id LIMIT 1")
          .get() as { id: number }
      ).id,
    );
    getDb()
      .prepare(
        `INSERT INTO strategic_goals (
           priority_id, slug, name, plan_start_year, plan_end_year
         ) VALUES (?, 'legacy-extra-goal', 'Legacy extra goal', 2025, 2029)`,
      )
      .run(categoryId);

    const first = ensureStrategicPlanConfiguration();
    expect(first).toEqual({
      goals: { created: 22, updated: 0, unchanged: 0 },
      measurement_configs: { created: 59, updated: 0, unchanged: 0 },
      memberships: { created: 59, updated: 0, unchanged: 0 },
      components: { created: 46, updated: 0, unchanged: 0 },
      targets: { created: 21, updated: 0, unchanged: 0 },
    });
    expect(scalar("SELECT COUNT(*) AS count FROM strategic_goals")).toBe(23);
    expect(scalar("SELECT COUNT(*) AS count FROM kpi_measurement_configs")).toBe(59);
    expect(scalar("SELECT COUNT(*) AS count FROM goal_kpis")).toBe(59);
    expect(scalar("SELECT COUNT(*) AS count FROM kpi_components")).toBe(46);
    expect(scalar("SELECT COUNT(*) AS count FROM kpi_targets")).toBe(21);
    expect(scalar("SELECT COUNT(*) AS count FROM strategic_audit_events")).toBe(207);
    expect(
      getDb()
        .prepare(
          `SELECT k.slug, c.measurement_type, c.unit, c.calculation_precision
           FROM kpi_measurement_configs c
           JOIN kpis k ON k.id = c.kpi_id
           WHERE k.slug IN (
             'justice-ed-states-represented',
             'multi-year-grants-pledges-value',
             'revenue-by-stream',
             'government-support-percentage'
           )
           ORDER BY k.slug`,
        )
        .all(),
    ).toEqual([
      {
        slug: "government-support-percentage",
        measurement_type: "multi_component",
        unit: "%",
        calculation_precision: 1,
      },
      {
        slug: "justice-ed-states-represented",
        measurement_type: "ratio",
        unit: "%",
        calculation_precision: 1,
      },
      {
        slug: "multi-year-grants-pledges-value",
        measurement_type: "currency",
        unit: "USD",
        calculation_precision: 2,
      },
      {
        slug: "revenue-by-stream",
        measurement_type: "multi_component",
        unit: "USD",
        calculation_precision: 2,
      },
    ]);

    const second = ensureStrategicPlanConfiguration();
    expect(second.goals).toEqual({ created: 0, updated: 0, unchanged: 22 });
    expect(second.measurement_configs).toEqual({
      created: 0,
      updated: 0,
      unchanged: 59,
    });
    expect(second.memberships.unchanged).toBe(59);
    expect(second.components.unchanged).toBe(46);
    expect(second.targets.unchanged).toBe(21);
    expect(scalar("SELECT COUNT(*) AS count FROM strategic_audit_events")).toBe(207);
    expect(
      getDb()
        .prepare("SELECT name FROM strategic_goals WHERE slug = 'legacy-extra-goal'")
        .get(),
    ).toEqual({ name: "Legacy extra goal" });
  });

  it("repairs canonical managed values by slug and preserves unresolved source truth", () => {
    ensureStrategicPlanConfiguration();
    getDb()
      .prepare("UPDATE strategic_goals SET name = 'Wrong name' WHERE slug = ?")
      .run("primary-interpretive-site-plan");
    const beforeAudit = scalar(
      "SELECT COUNT(*) AS count FROM strategic_audit_events",
    );

    const result = ensureStrategicPlanConfiguration();
    expect(result.goals.updated).toBe(1);
    expect(result.goals.unchanged).toBe(21);
    expect(scalar("SELECT COUNT(*) AS count FROM strategic_audit_events")).toBe(
      beforeAudit + 1,
    );
    const career = getStrategicGoalBySlug("career-pipelines-employment");
    expect(career?.configuration_status).toBe("active");
    expect(career?.members).toHaveLength(2);
    const unresolved = getStrategicGoalBySlug("architecture-contemporary-education");
    expect(unresolved?.configuration_status).toBe("needs_definition");
    expect(unresolved?.unresolved_question).toContain("digital justice-education reach");
    expect(
      getDb()
        .prepare(
          `SELECT target_value, target_description
           FROM kpi_targets WHERE target_value IS NULL LIMIT 1`,
        )
        .get(),
    ).toMatchObject({ target_value: null });
  });

  it("loads effective-year goals, memberships, configs, components, and targets", () => {
    ensureStrategicPlanConfiguration();
    expect(listStrategicGoals({ year: 2024 })).toEqual([]);
    expect(listEffectiveMeasurementConfigs(2024)).toHaveLength(0);
    expect(listEffectiveMeasurementConfigs(2026)).toHaveLength(59);
    expect(listEffectiveMeasurementConfigs(2030)).toHaveLength(0);

    const goals = listStrategicGoals({ year: 2026 });
    expect(goals).toHaveLength(22);
    expect(goals.flatMap((goal) => goal.members)).toHaveLength(59);
    expect(
      goals.flatMap((goal) => goal.members).flatMap((member) => member.components),
    ).toHaveLength(46);

    const targetedKpi = STRATEGIC_KPI_DEFINITIONS.find(
      (definition) => (definition.targets?.length ?? 0) > 0,
    )!;
    const kpiRow = getDb()
      .prepare("SELECT id FROM kpis WHERE slug = ?")
      .get(targetedKpi.kpi_slug) as { id: number };
    expect(getEffectiveMeasurementConfig(kpiRow.id, 2026)?.kpi_id).toBe(kpiRow.id);
    const target = targetedKpi.targets![0];
    const effectiveYear = target.scope === "annual" ? target.reporting_year! : 2026;
    expect(listEffectiveTargetsForKpi(kpiRow.id, effectiveYear)).not.toHaveLength(0);
    expect(listEffectiveTargetsForKpi(kpiRow.id, 2024)).toEqual([]);
    expect(listEffectiveTargetsForKpi(kpiRow.id, 2030)).toEqual([]);
  });

  it("keeps full-plan targets available after their target year", () => {
    const kpiId = Number(
      (
        getDb()
          .prepare("SELECT id FROM kpis ORDER BY id LIMIT 1")
          .get() as { id: number }
      ).id,
    );
    const targetId = Number(
      getDb()
        .prepare(
          `INSERT INTO kpi_targets (
             kpi_id, target_scope, target_year, target_value,
             target_description, configuration_status
           ) VALUES (?, 'full_plan', 2026, 10, 'Complete ten items.', 'active')`,
        )
        .run(kpiId).lastInsertRowid,
    );

    expect(listEffectiveTargetsForKpi(kpiId, 2027)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: targetId, target_scope: "full_plan", target_year: 2026 }),
      ]),
    );
  });

  it("reports explicit definition, formula, component, and target gaps", () => {
    ensureStrategicPlanConfiguration();
    const activeConfig = getDb()
      .prepare(
        `SELECT id FROM kpi_measurement_configs
         WHERE configuration_status = 'active' AND unresolved_question IS NULL
         ORDER BY id LIMIT 1`,
      )
      .get() as { id: number };
    getDb()
      .prepare(
        `UPDATE kpi_measurement_configs
         SET unresolved_question = 'Confirm the reporting owner.'
         WHERE id = ?`,
      )
      .run(activeConfig.id);
    const gaps = listConfigurationGaps({ year: 2026 });
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.every((gap) => gap.exclusion_reasons.length > 0)).toBe(true);
    expect(gaps.some((gap) => gap.missing_target)).toBe(true);
    expect(gaps.every((gap) => typeof gap.missing_formula === "boolean")).toBe(true);
    expect(gaps.every((gap) => typeof gap.missing_components === "boolean")).toBe(
      true,
    );
    expect(
      gaps.find((gap) => gap.configuration.id === activeConfig.id)?.exclusion_reasons,
    ).toContain("unresolved_question");
    const counts = getConfigurationGapCounts({ year: 2026 });
    expect(counts.active_kpis + counts.ready_kpis).toBeLessThanOrEqual(59);
    expect(counts.kpis_needing_targets).toBeGreaterThan(0);
    expect(counts.goals_excluded_from_completion).toBeGreaterThan(0);
    expect(counts.archived_kpis).toBe(0);
  });

  it.each(["needs_definition", "needs_target"] as const)(
    "aligns the configuration-gap count with a goal-level %s exclusion",
    (configurationStatus) => {
      ensureStrategicPlanConfiguration();
      const eligibleGoal = listStrategicGoals({ year: 2026 }).find(
        (goal) =>
          (goal.configuration_status === "active" ||
            goal.configuration_status === "ready") &&
          getConfigurationGapCounts({ year: 2026, goal_id: goal.id })
            .goals_excluded_from_completion === 0,
      );
      expect(eligibleGoal).toBeDefined();

      getDb()
        .prepare(
          `UPDATE strategic_goals
           SET configuration_status = ?, unresolved_question = ?
           WHERE id = ?`,
        )
        .run(
          configurationStatus,
          `Resolve ${configurationStatus}.`,
          eligibleGoal!.id,
        );

      expect(
        getConfigurationGapCounts({ year: 2026, goal_id: eligibleGoal!.id })
          .goals_excluded_from_completion,
      ).toBe(1);
    },
  );

  it("counts an active non-manual goal with no memberships as excluded", () => {
    ensureStrategicPlanConfiguration();
    const priorityId = Number(
      (
        getDb()
          .prepare("SELECT id FROM categories ORDER BY id LIMIT 1")
          .get() as { id: number }
      ).id,
    );
    const goalId = Number(
      getDb()
        .prepare(
          `INSERT INTO strategic_goals (
             priority_id, slug, name, plan_start_year, plan_end_year,
             completion_rule, configuration_status
           ) VALUES (?, 'zero-members-active-goal', 'Zero members active goal',
                     2025, 2029, 'all_required_kpis', 'active')`,
        )
        .run(priorityId).lastInsertRowid,
    );

    expect(listStrategicGoals({ year: 2026, priority_id: priorityId }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: goalId, members: [] }),
      ]));
    expect(
      getConfigurationGapCounts({ year: 2026, goal_id: goalId })
        .goals_excluded_from_completion,
    ).toBe(1);
  });

  it("reports a membership whose KPI has no effective measurement configuration", () => {
    ensureStrategicPlanConfiguration();
    const row = getDb()
      .prepare(
        `SELECT config.id, config.kpi_id
         FROM kpi_measurement_configs config
         JOIN goal_kpis membership ON membership.kpi_id = config.kpi_id
         ORDER BY config.id LIMIT 1`,
      )
      .get() as { id: number; kpi_id: number };
    getDb()
      .prepare(
        `UPDATE kpi_measurement_configs
         SET archived_at = '2026-07-09T00:00:00.000Z'
         WHERE id = ?`,
      )
      .run(row.id);

    const gap = listConfigurationGaps({ year: 2026 }).find(
      (candidate) => candidate.kpi.id === row.kpi_id,
    );

    expect(gap).toMatchObject({
      missing_measurement_type: true,
      missing_formula: false,
      configuration: {
        id: 0,
        configuration_status: "needs_definition",
      },
    });
    expect(gap?.exclusion_reasons).toContain("missing_measurement_type");
    expect(getConfigurationGapCounts({ year: 2026 })).toMatchObject({
      archived_kpis: 1,
    });
  });

  it("reports draft target records as a missing calculable target rather than consuming them", () => {
    ensureStrategicPlanConfiguration();
    const row = getDb()
      .prepare(
        `SELECT config.kpi_id
         FROM kpi_measurement_configs config
         JOIN kpi_targets target ON target.kpi_id = config.kpi_id
         WHERE config.configuration_status = 'active'
           AND config.archived_at IS NULL
           AND target.archived_at IS NULL
         GROUP BY config.kpi_id
         ORDER BY config.kpi_id
         LIMIT 1`,
      )
      .get() as { kpi_id: number };
    getDb()
      .prepare(
        `UPDATE kpi_targets
         SET configuration_status = 'draft'
         WHERE kpi_id = ? AND archived_at IS NULL`,
      )
      .run(row.kpi_id);

    const gap = listConfigurationGaps({ year: 2026 }).find(
      (candidate) => candidate.kpi.id === row.kpi_id,
    );
    expect(gap?.target_years.length).toBeGreaterThan(0);
    expect(gap).toMatchObject({ missing_target: true });
    expect(gap?.exclusion_reasons).toContain("missing_target");
  });

  it("soft archives and restores every configured entity with immutable snapshots", () => {
    ensureStrategicPlanConfiguration();
    const goal = getStrategicGoalBySlug("primary-interpretive-site-plan")!;
    const member = goal.members[0];
    const config = member.configuration!;
    const component = listStrategicGoals({ year: 2026 })
      .flatMap((item) => item.members)
      .flatMap((item) => item.components)[0];
    const affectedTargets = getDb()
      .prepare(
        `SELECT id FROM kpi_targets
         WHERE kpi_id = ?
            OR component_id IN (
              SELECT id FROM kpi_components WHERE configuration_id = ?
            )
         ORDER BY id`,
      )
      .all(component.kpi_id, component.configuration_id) as Array<{ id: number }>;
    const target = affectedTargets[0] ?? (getDb()
      .prepare("SELECT id FROM kpi_targets ORDER BY id LIMIT 1")
      .get() as { id: number });
    const targetIds = Array.from(new Set([
      ...affectedTargets.map((row) => row.id),
      target.id,
    ]));

    updateMeasurementConfigurationStatus(config.id, "ready");
    archiveStrategicGoal(goal.id);
    targetIds.forEach((id) => archiveTarget(id));
    archiveComponent(component.id);
    archiveMeasurementConfig(config.id);
    expect(getStrategicGoalBySlug(goal.slug)).toBeNull();
    expect(getEffectiveMeasurementConfig(member.kpi_id, 2026)).toBeNull();

    restoreStrategicGoal(goal.id);
    restoreMeasurementConfig(config.id);
    restoreComponent(component.id);
    targetIds.forEach((id) => restoreTarget(id));
    expect(getStrategicGoalBySlug(goal.slug)?.archived_at).toBeNull();
    expect(getEffectiveMeasurementConfig(member.kpi_id, 2026)?.configuration_status).toBe(
      "ready",
    );

    const events = listStrategicAuditEvents({ limit: 1_000 });
    for (const [entityType, entityId] of [
      ["strategic_goal", goal.id],
      ["measurement_config", config.id],
      ["component", component.id],
      ["target", target.id],
    ] as const) {
      const lifecycle = events.filter(
        (event) => event.entity_type === entityType && event.entity_id === entityId,
      );
      expect(lifecycle.map((event) => event.event_type)).toEqual(
        expect.arrayContaining(["archive", "restore"]),
      );
      for (const event of lifecycle.filter(
        (item) => item.event_type === "archive" || item.event_type === "restore",
      )) {
        expect(event.entity_display_name.trim()).not.toBe("");
        expect(event.parent_priority_name).toEqual(expect.any(String));
        expect(event.previous_value).not.toBeNull();
        expect(event.new_value).not.toBeNull();
        expect(event.occurred_at).toEqual(expect.any(String));
      }
    }
    const archive = events.find(
      (event) => event.entity_type === "measurement_config" && event.event_type === "archive",
    );
    expect(archive?.previous_value).toMatchObject({
      configuration_status: "ready",
      archived_at: null,
    });
    expect(archive?.new_value).toMatchObject({ configuration_status: "archived" });
    const eventCount = events.length;
    restoreMeasurementConfig(config.id);
    expect(listStrategicAuditEvents({ limit: 1_000 })).toHaveLength(eventCount);
    expect(() => archiveTarget(999_999)).toThrow(StrategyEntityNotFoundError);
  });

  it("fails atomically when a stable catalog slug is missing", () => {
    const missingSlug = STRATEGIC_KPI_DEFINITIONS[0].kpi_slug;
    getDb().prepare("DELETE FROM kpis WHERE slug = ?").run(missingSlug);
    expect(() => ensureStrategicPlanConfiguration()).toThrow(
      StrategyConfigurationError,
    );
    expect(scalar("SELECT COUNT(*) AS count FROM strategic_goals")).toBe(0);
    expect(scalar("SELECT COUNT(*) AS count FROM strategic_audit_events")).toBe(0);
    expect(STRATEGIC_GOAL_DEFINITIONS).toHaveLength(22);
  });
});
