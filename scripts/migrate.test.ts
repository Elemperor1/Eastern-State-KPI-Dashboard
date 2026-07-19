import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";

describe("production migration entrypoint", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kpi-migrate-entrypoint-"));

  afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

  it("initializes canonical strategy rows only when the populated legacy catalog has no strategic entities", () => {
    const databasePath = path.join(directory, "empty-strategic-sidecars.db");
    expect(runTsx("scripts/seed.ts", databasePath).status).toBe(0);
    const before = new DatabaseSync(databasePath);
    const legacyCounts = {
      kpis: scalarCount(before, "kpis"),
      monthlyEntries: scalarCount(before, "monthly_entries"),
      history: scalarCount(before, "entry_history"),
    };
    before.exec(`
      DELETE FROM strategic_audit_events;
      DELETE FROM distribution_values;
      DELETE FROM distribution_observations;
      DELETE FROM distribution_bands;
      DELETE FROM kpi_component_entries;
      DELETE FROM kpi_targets;
      DELETE FROM kpi_components;
      DELETE FROM kpi_observations;
      DELETE FROM goal_kpis;
      DELETE FROM strategic_goals;
      DELETE FROM kpi_measurement_configs;
    `);
    before.close();

    const migrated = runPendingMigration(databasePath);
    expect(migrated.status, migrated.stderr).toBe(0);
    const verify = new DatabaseSync(databasePath);
    expect(scalarCount(verify, "strategic_goals")).toBe(22);
    expect(scalarCount(verify, "kpi_measurement_configs")).toBe(59);
    expect(scalarCount(verify, "goal_kpis")).toBe(59);
    expect(scalarCount(verify, "kpi_components")).toBe(46);
    expect(scalarCount(verify, "kpis")).toBe(legacyCounts.kpis);
    expect(scalarCount(verify, "monthly_entries")).toBe(legacyCounts.monthlyEntries);
    expect(scalarCount(verify, "entry_history")).toBe(legacyCounts.history);
    expect(verify.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    verify.close();
  });

  it("does not recreate deleted strategic content after schema 12 is initialized", () => {
    const databasePath = path.join(directory, "initialized-content-remains-deleted.db");
    expect(runTsx("scripts/seed.ts", databasePath).status).toBe(0);
    const before = new DatabaseSync(databasePath);
    before.exec(`
      DELETE FROM strategic_audit_events;
      DELETE FROM distribution_values;
      DELETE FROM distribution_observations;
      DELETE FROM distribution_bands;
      DELETE FROM kpi_component_entries;
      DELETE FROM kpi_targets;
      DELETE FROM kpi_components;
      DELETE FROM kpi_observations;
      DELETE FROM goal_kpis;
      DELETE FROM strategic_goals;
      DELETE FROM kpi_measurement_configs;
    `);
    before.close();

    const migrated = runTsx("scripts/migrate.ts", databasePath);

    expect(migrated.status, migrated.stderr).toBe(0);
    expect(migrated.stdout).toContain(
      "no database-authority content migration is pending",
    );
    const verify = new DatabaseSync(databasePath);
    expect(scalarCount(verify, "strategic_goals")).toBe(0);
    expect(scalarCount(verify, "kpi_measurement_configs")).toBe(0);
    expect(scalarCount(verify, "goal_kpis")).toBe(0);
    expect(verify.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    verify.close();
  });

  it("reconciles only the exact prior canonical membership and reporting contracts", () => {
    const databasePath = path.join(directory, "prior-canonical-contracts.db");
    expect(runTsx("scripts/seed.ts", databasePath).status).toBe(0);
    const before = new DatabaseSync(databasePath);

    const membershipMoves = [
      ["workforce-public-events-job-fairs", "workforce-awareness-recognition", 0],
      ["justice-ed-returning-schools-educators", "criminal-justice-dialogue", 1],
      ["justice-ed-online-digital-attendance", "schools-educators-justice-education", 2],
      ["reduced-price-free-pwyw-events", "community-civic-hub", 1],
    ] as const;
    for (const [kpiSlug, oldGoalSlug, displayOrder] of membershipMoves) {
      before.prepare(
        `UPDATE goal_kpis
         SET goal_id = (SELECT id FROM strategic_goals WHERE slug = ?),
             display_order = ?, updated_by = NULL
         WHERE kpi_id = (SELECT id FROM kpis WHERE slug = ?)`,
      ).run(oldGoalSlug, displayOrder, kpiSlug);
    }

    const oldGoalRows = [
      ["career-pipelines-employment", "Measure employment and career advancement after program completion.", "needs_definition", "The source assigns only one KPI to this goal; confirm a second KPI or approve the exception to the 2-5 KPI rule."],
      ["workforce-awareness-recognition", "Track public events, external recognition, and awareness among people not currently engaged.", "active", null],
      ["justice-education-partnerships-recognition", "Develop active school partnerships for justice education.", "needs_definition", "The source assigns only one KPI to this goal; confirm a second KPI or approve the exception to the 2-5 KPI rule."],
      ["criminal-justice-dialogue", "Measure educator confidence, repeat engagement, and audience representation.", "active", null],
      ["architecture-contemporary-education", "Develop architecture-focused interpretation and programs.", "needs_definition", "The source assigns only one KPI to this goal; confirm a second KPI or approve the exception to the 2-5 KPI rule."],
      ["optimize-facilities", "Measure site-space use for revenue and mission programs.", "needs_definition", "The source assigns only one KPI to this goal; confirm a second KPI or approve the exception to the 2-5 KPI rule."],
      ["community-civic-hub", "Grow sponsorship, grants, accessible events, public support, and new donors.", "active", null],
    ] as const;
    for (const [slug, description, status, question] of oldGoalRows) {
      before.prepare(
        `UPDATE strategic_goals
         SET description = ?, configuration_status = ?, unresolved_question = ?,
             updated_by = NULL
         WHERE slug = ?`,
      ).run(description, status, question, slug);
    }

    before.prepare(
      `UPDATE kpi_measurement_configs
       SET unit = 'states', calculation_precision = 1,
           unresolved_question = 'Finalize the target number or percentage of states represented.',
           updated_by = NULL
       WHERE kpi_id = (SELECT id FROM kpis WHERE slug = 'justice-ed-states-represented')`,
    ).run();
    before.prepare(
      `UPDATE kpi_measurement_configs
       SET calculation_precision = 1, updated_by = NULL
       WHERE kpi_id = (SELECT id FROM kpis WHERE slug = 'multi-year-grants-pledges-value')`,
    ).run();
    before.prepare(
      `UPDATE kpi_measurement_configs
       SET unit = '%', calculation_precision = 1, updated_by = NULL
       WHERE kpi_id = (SELECT id FROM kpis WHERE slug = 'revenue-by-stream')`,
    ).run();
    before.prepare(
      `UPDATE kpi_measurement_configs
       SET configuration_status = 'ready', unresolved_question = NULL, updated_by = NULL
       WHERE kpi_id = (SELECT id FROM kpis WHERE slug = 'preservation-awards-recognitions')`,
    ).run();
    before.prepare(
      `UPDATE kpi_targets
       SET configuration_status = 'ready', updated_by = NULL
       WHERE kpi_id = (SELECT id FROM kpis WHERE slug = 'preservation-awards-recognitions')`,
    ).run();
    before.close();

    const migrated = runPendingMigration(databasePath);
    expect(migrated.status, migrated.stderr).toBe(0);
    expect(migrated.stdout).toContain(
      "7 goal metadata, 4 memberships, 3 measurement metadata, 1 target contracts repaired",
    );
    const verify = new DatabaseSync(databasePath);
    const goalCounts = verify.prepare(
      `SELECT goal.slug, COUNT(membership.id) AS count
       FROM strategic_goals goal
       LEFT JOIN goal_kpis membership
         ON membership.goal_id = goal.id AND membership.archived_at IS NULL
       GROUP BY goal.id
       ORDER BY goal.slug`,
    ).all() as Array<{ slug: string; count: number }>;
    expect(goalCounts.every((row) => Number(row.count) >= 2 && Number(row.count) <= 5)).toBe(true);
    for (const [kpiSlug, ,] of membershipMoves) {
      const expectedGoal = {
        "workforce-public-events-job-fairs": "career-pipelines-employment",
        "justice-ed-returning-schools-educators": "justice-education-partnerships-recognition",
        "justice-ed-online-digital-attendance": "architecture-contemporary-education",
        "reduced-price-free-pwyw-events": "optimize-facilities",
      }[kpiSlug];
      expect(verify.prepare(
        `SELECT goal.slug
         FROM goal_kpis membership
         JOIN strategic_goals goal ON goal.id = membership.goal_id
         JOIN kpis kpi ON kpi.id = membership.kpi_id
         WHERE kpi.slug = ? AND membership.archived_at IS NULL`,
      ).get(kpiSlug)).toEqual({ slug: expectedGoal });
    }
    expect(verify.prepare(
      `SELECT config.unit, config.calculation_precision
       FROM kpi_measurement_configs config JOIN kpis kpi ON kpi.id = config.kpi_id
       WHERE kpi.slug = 'justice-ed-states-represented'`,
    ).get()).toEqual({ unit: "%", calculation_precision: 1 });
    expect(verify.prepare(
      `SELECT kpi.slug, config.unit, config.calculation_precision
       FROM kpi_measurement_configs config JOIN kpis kpi ON kpi.id = config.kpi_id
       WHERE kpi.slug IN ('multi-year-grants-pledges-value', 'revenue-by-stream')
       ORDER BY kpi.slug`,
    ).all()).toEqual([
      { slug: "multi-year-grants-pledges-value", unit: "USD", calculation_precision: 2 },
      { slug: "revenue-by-stream", unit: "USD", calculation_precision: 2 },
    ]);
    expect(verify.prepare(
      `SELECT config.configuration_status AS config_status,
              config.unresolved_question, target.configuration_status AS target_status
       FROM kpi_measurement_configs config
       JOIN kpis kpi ON kpi.id = config.kpi_id
       JOIN kpi_targets target ON target.kpi_id = kpi.id
       WHERE kpi.slug = 'preservation-awards-recognitions'`,
    ).get()).toEqual({
      config_status: "needs_target",
      unresolved_question: "Finalize a calculable recognition target while retaining the 2029 intent.",
      target_status: "needs_target",
    });
    expect(verify.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    const auditCount = scalarCount(verify, "strategic_audit_events");
    verify.close();

    const repeated = runTsx("scripts/migrate.ts", databasePath);
    expect(repeated.status, repeated.stderr).toBe(0);
    expect(repeated.stdout).toContain(
      "no database-authority content migration is pending",
    );
    const repeatedVerify = new DatabaseSync(databasePath);
    expect(scalarCount(repeatedVerify, "strategic_audit_events")).toBe(auditCount);
    expect(repeatedVerify.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    repeatedVerify.close();
  });

  it("preserves operator-owned membership, goal-copy, and reporting metadata", () => {
    const databasePath = path.join(directory, "operator-canonical-contracts.db");
    expect(runTsx("scripts/seed.ts", databasePath).status).toBe(0);
    const before = new DatabaseSync(databasePath);
    const actor = before.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get() as {
      id: number;
    };
    before.prepare(
      `UPDATE goal_kpis
       SET goal_id = (SELECT id FROM strategic_goals WHERE slug = 'workforce-awareness-recognition'),
           display_order = 0, updated_by = ?
       WHERE kpi_id = (SELECT id FROM kpis WHERE slug = 'workforce-public-events-job-fairs')`,
    ).run(actor.id);
    before.prepare(
      `UPDATE strategic_goals
       SET description = 'Operator-approved workforce awareness scope.', updated_by = ?
       WHERE slug = 'workforce-awareness-recognition'`,
    ).run(actor.id);
    before.prepare(
      `UPDATE kpi_measurement_configs
       SET unit = '% adjusted', calculation_precision = 4, updated_by = ?
       WHERE kpi_id = (SELECT id FROM kpis WHERE slug = 'revenue-by-stream')`,
    ).run(actor.id);
    const auditCount = scalarCount(before, "strategic_audit_events");
    before.close();

    const migrated = runPendingMigration(databasePath);
    expect(migrated.status, migrated.stderr).toBe(0);
    const verify = new DatabaseSync(databasePath);
    expect(verify.prepare(
      `SELECT goal.slug
       FROM goal_kpis membership
       JOIN strategic_goals goal ON goal.id = membership.goal_id
       JOIN kpis kpi ON kpi.id = membership.kpi_id
       WHERE kpi.slug = 'workforce-public-events-job-fairs'`,
    ).get()).toEqual({ slug: "workforce-awareness-recognition" });
    expect(verify.prepare(
      "SELECT description FROM strategic_goals WHERE slug = 'workforce-awareness-recognition'",
    ).get()).toEqual({ description: "Operator-approved workforce awareness scope." });
    expect(verify.prepare(
      `SELECT config.unit, config.calculation_precision
       FROM kpi_measurement_configs config JOIN kpis kpi ON kpi.id = config.kpi_id
       WHERE kpi.slug = 'revenue-by-stream'`,
    ).get()).toEqual({ unit: "% adjusted", calculation_precision: 4 });
    expect(scalarCount(verify, "strategic_audit_events")).toBe(auditCount);
    expect(verify.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    verify.close();
  });

  it("repairs the exact legacy government ratio signature without overwriting operator-owned strategy data", () => {
    const databasePath = path.join(directory, "exact-legacy-signature.db");
    expect(runTsx("scripts/seed.ts", databasePath).status).toBe(0);
    const before = new DatabaseSync(databasePath);
    const government = before.prepare(
      `SELECT kpi.id AS kpi_id, config.id AS configuration_id
       FROM kpis kpi
       JOIN kpi_measurement_configs config ON config.kpi_id = kpi.id
       WHERE kpi.slug = 'government-support-percentage'`,
    ).get() as { kpi_id: number; configuration_id: number };
    const retainedIds = before.prepare(
      `SELECT id FROM kpi_components
       WHERE configuration_id = ? AND slug IN ('city-support', 'state-support')
       ORDER BY slug`,
    ).all(government.configuration_id).map((row) => Number((row as { id: number }).id));
    const entryCount = Number(
      (before.prepare("SELECT COUNT(*) AS count FROM monthly_entries").get() as { count: number }).count,
    );
    before.prepare(
      "DELETE FROM kpi_components WHERE configuration_id = ? AND slug = 'contributed-revenue'",
    ).run(government.configuration_id);
    before.prepare(
      "UPDATE kpi_components SET aggregation_role = 'value' WHERE configuration_id = ?",
    ).run(government.configuration_id);
    before.prepare(
      `UPDATE kpi_components
       SET unresolved_question = 'Finalize city and state support targets as portions of contributed revenue.'
       WHERE configuration_id = ?`,
    ).run(government.configuration_id);
    before.prepare(
      `UPDATE kpi_measurement_configs
       SET aggregation_method = 'sum',
           unresolved_question = 'Finalize city and state support targets as portions of contributed revenue.'
       WHERE id = ?`,
    ).run(government.configuration_id);

    const customized = customizeOperatorOwnedStrategy(before, government.configuration_id);
    before.close();

    const migrated = runPendingMigration(databasePath);
    expect(migrated.status, migrated.stderr).toBe(0);
    const verify = new DatabaseSync(databasePath);
    expect(
      verify.prepare("SELECT aggregation_method FROM kpi_measurement_configs WHERE id = ?")
        .get(government.configuration_id),
    ).toEqual({ aggregation_method: "ratio" });
    expect(
      verify.prepare(
        `SELECT slug, aggregation_role FROM kpi_components
         WHERE configuration_id = ? ORDER BY display_order, id`,
      ).all(government.configuration_id),
    ).toEqual([
      { slug: "city-support", aggregation_role: "numerator" },
      { slug: "state-support", aggregation_role: "numerator" },
      { slug: "contributed-revenue", aggregation_role: "denominator" },
    ]);
    expect(
      verify.prepare(
        `SELECT id FROM kpi_components
         WHERE configuration_id = ? AND slug IN ('city-support', 'state-support')
         ORDER BY slug`,
      ).all(government.configuration_id).map((row) => Number((row as { id: number }).id)),
    ).toEqual(retainedIds);
    expect(
      Number((verify.prepare("SELECT COUNT(*) AS count FROM monthly_entries").get() as { count: number }).count),
    ).toBe(entryCount);
    expect(readOperatorOwnedStrategy(verify, customized)).toEqual(customized);
    expect(verify.prepare("PRAGMA foreign_key_check").all()).toEqual([]);

    const auditsBeforeSecondRun = Number(
      (verify.prepare("SELECT COUNT(*) AS count FROM strategic_audit_events").get() as { count: number }).count,
    );
    verify.close();

    const repeated = runTsx("scripts/migrate.ts", databasePath);
    expect(repeated.status, repeated.stderr).toBe(0);
    const repeatedVerify = new DatabaseSync(databasePath);
    expect(
      Number((repeatedVerify.prepare("SELECT COUNT(*) AS count FROM strategic_audit_events").get() as { count: number }).count),
    ).toBe(auditsBeforeSecondRun);
    expect(readOperatorOwnedStrategy(repeatedVerify, customized)).toEqual(customized);
    expect(repeatedVerify.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    repeatedVerify.close();
  });

  it("does not reinterpret an operator-modified government-support definition", () => {
    const databasePath = path.join(directory, "operator-government-definition.db");
    expect(runTsx("scripts/seed.ts", databasePath).status).toBe(0);
    const before = new DatabaseSync(databasePath);
    const government = before.prepare(
      `SELECT kpi.id AS kpi_id, config.id AS configuration_id
       FROM kpis kpi
       JOIN kpi_measurement_configs config ON config.kpi_id = kpi.id
       WHERE kpi.slug = 'government-support-percentage'`,
    ).get() as { kpi_id: number; configuration_id: number };
    before.prepare(
      "DELETE FROM kpi_components WHERE configuration_id = ? AND slug = 'contributed-revenue'",
    ).run(government.configuration_id);
    before.prepare(
      "UPDATE kpi_components SET aggregation_role = 'value' WHERE configuration_id = ?",
    ).run(government.configuration_id);
    before.prepare(
      `UPDATE kpi_measurement_configs
       SET aggregation_method = 'sum', calculation_precision = 4,
           unresolved_question = 'Operator-approved city and state reporting method.'
       WHERE id = ?`,
    ).run(government.configuration_id);
    before.close();

    const migrated = runPendingMigration(databasePath);
    expect(migrated.status, migrated.stderr).toBe(0);
    const verify = new DatabaseSync(databasePath);
    expect(
      verify.prepare(
        "SELECT aggregation_method, calculation_precision, unresolved_question FROM kpi_measurement_configs WHERE id = ?",
      ).get(government.configuration_id),
    ).toEqual({
      aggregation_method: "sum",
      calculation_precision: 4,
      unresolved_question: "Operator-approved city and state reporting method.",
    });
    expect(
      verify.prepare(
        "SELECT slug, aggregation_role FROM kpi_components WHERE configuration_id = ? ORDER BY display_order",
      ).all(government.configuration_id),
    ).toEqual([
      { slug: "city-support", aggregation_role: "value" },
      { slug: "state-support", aggregation_role: "value" },
    ]);
    expect(verify.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    verify.close();
  });

  it("does not rewrite the exact legacy signature when the KPI is archived", () => {
    const databasePath = path.join(directory, "archived-government-definition.db");
    expect(runTsx("scripts/seed.ts", databasePath).status).toBe(0);
    const before = new DatabaseSync(databasePath);
    const government = governmentConfiguration(before);
    restoreLegacyGovernmentSignature(before, government.configuration_id);
    before.prepare(
      "UPDATE kpis SET is_active = 0, archived_at = '2026-12-31 12:00:00' WHERE id = ?",
    ).run(government.kpi_id);
    before.close();

    const migrated = runPendingMigration(databasePath);
    expect(migrated.status, migrated.stderr).toBe(0);
    const verify = new DatabaseSync(databasePath);
    expect(
      verify.prepare(
        "SELECT is_active, archived_at FROM kpis WHERE id = ?",
      ).get(government.kpi_id),
    ).toEqual({ is_active: 0, archived_at: "2026-12-31 12:00:00" });
    expect(
      verify.prepare(
        "SELECT aggregation_method FROM kpi_measurement_configs WHERE id = ?",
      ).get(government.configuration_id),
    ).toEqual({ aggregation_method: "sum" });
    expect(
      verify.prepare(
        "SELECT slug, aggregation_role FROM kpi_components WHERE configuration_id = ? ORDER BY display_order",
      ).all(government.configuration_id),
    ).toEqual([
      { slug: "city-support", aggregation_role: "value" },
      { slug: "state-support", aggregation_role: "value" },
    ]);
    expect(verify.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    verify.close();
  });

  it("does not rewrite a legacy signature with distribution sidecar data", () => {
    const databasePath = path.join(directory, "government-distribution-data.db");
    expect(runTsx("scripts/seed.ts", databasePath).status).toBe(0);
    const before = new DatabaseSync(databasePath);
    const government = governmentConfiguration(before);
    restoreLegacyGovernmentSignature(before, government.configuration_id);
    const bandId = Number(before.prepare(
      `INSERT INTO distribution_bands (
         kpi_id, slug, label, effective_from_year, effective_to_year, display_order
       ) VALUES (?, 'imported-government-band', 'Imported government band', 2025, 2029, 0)`,
    ).run(government.kpi_id).lastInsertRowid);
    const observationId = Number(before.prepare(
      `INSERT INTO distribution_observations (
         kpi_id, configuration_id, year, period_type, period_index,
         respondent_count, categories_mutually_exclusive
       ) VALUES (?, ?, 2026, 'annual', 0, 1, 1)`,
    ).run(government.kpi_id, government.configuration_id).lastInsertRowid);
    before.prepare(
      `INSERT INTO distribution_values (
         observation_id, band_id, band_label_snapshot, category_count
       ) VALUES (?, ?, 'Imported government band', 1)`,
    ).run(observationId, bandId);
    before.close();

    const migrated = runPendingMigration(databasePath);
    expect(migrated.status, migrated.stderr).toBe(0);
    const verify = new DatabaseSync(databasePath);
    expect(
      verify.prepare(
        "SELECT aggregation_method FROM kpi_measurement_configs WHERE id = ?",
      ).get(government.configuration_id),
    ).toEqual({ aggregation_method: "sum" });
    expect(
      verify.prepare(
        "SELECT slug, aggregation_role FROM kpi_components WHERE configuration_id = ? ORDER BY display_order",
      ).all(government.configuration_id),
    ).toEqual([
      { slug: "city-support", aggregation_role: "value" },
      { slug: "state-support", aggregation_role: "value" },
    ]);
    expect(
      verify.prepare(
        "SELECT band_label_snapshot, category_count FROM distribution_values WHERE observation_id = ?",
      ).get(observationId),
    ).toEqual({
      band_label_snapshot: "Imported government band",
      category_count: 1,
    });
    expect(verify.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    verify.close();
  });

  it("does not convert the legacy signature after first-class component history exists", () => {
    const databasePath = path.join(directory, "government-history.db");
    expect(runTsx("scripts/seed.ts", databasePath).status).toBe(0);
    const before = new DatabaseSync(databasePath);
    const government = before.prepare(
      `SELECT config.id AS configuration_id
       FROM kpis kpi
       JOIN kpi_measurement_configs config ON config.kpi_id = kpi.id
       WHERE kpi.slug = 'government-support-percentage'`,
    ).get() as { configuration_id: number };
    const city = before.prepare(
      "SELECT id FROM kpi_components WHERE configuration_id = ? AND slug = 'city-support'",
    ).get(government.configuration_id) as { id: number };
    before.prepare(
      "DELETE FROM kpi_components WHERE configuration_id = ? AND slug = 'contributed-revenue'",
    ).run(government.configuration_id);
    before.prepare(
      `UPDATE kpi_components SET aggregation_role = 'value',
         unresolved_question = ? WHERE configuration_id = ?`,
    ).run(
      "Finalize city and state support targets as portions of contributed revenue.",
      government.configuration_id,
    );
    before.prepare(
      `UPDATE kpi_measurement_configs SET aggregation_method = 'sum',
         unresolved_question = ? WHERE id = ?`,
    ).run(
      "Finalize city and state support targets as portions of contributed revenue.",
      government.configuration_id,
    );
    before.prepare(
      `INSERT INTO kpi_component_entries (
         component_id, year, period_type, period_index, scalar_value
       ) VALUES (?, 2026, 'annual', 0, 125000)`,
    ).run(city.id);
    before.close();

    const migrated = runPendingMigration(databasePath);
    expect(migrated.status, migrated.stderr).toBe(0);
    const verify = new DatabaseSync(databasePath);
    expect(
      verify.prepare("SELECT aggregation_method FROM kpi_measurement_configs WHERE id = ?")
        .get(government.configuration_id),
    ).toEqual({ aggregation_method: "sum" });
    expect(
      verify.prepare(
        "SELECT slug, aggregation_role FROM kpi_components WHERE configuration_id = ? ORDER BY display_order",
      ).all(government.configuration_id),
    ).toEqual([
      { slug: "city-support", aggregation_role: "value" },
      { slug: "state-support", aggregation_role: "value" },
    ]);
    expect(
      verify.prepare("SELECT scalar_value FROM kpi_component_entries WHERE component_id = ?").get(city.id),
    ).toEqual({ scalar_value: 125000 });
    expect(verify.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    verify.close();
  });
});

interface OperatorOwnedSnapshot {
  goal: Record<string, unknown>;
  configuration: Record<string, unknown>;
  membership: Record<string, unknown>;
  component: Record<string, unknown>;
  target: Record<string, unknown>;
}

/** Supports the customize operator owned strategy test scenario. */
function customizeOperatorOwnedStrategy(
  db: DatabaseSync,
  excludedConfigurationId: number,
): OperatorOwnedSnapshot {
  const goalId = Number((db.prepare("SELECT id FROM strategic_goals ORDER BY id LIMIT 1").get() as { id: number }).id);
  const configurationId = Number((db.prepare(
    "SELECT id FROM kpi_measurement_configs WHERE id <> ? ORDER BY id LIMIT 1",
  ).get(excludedConfigurationId) as { id: number }).id);
  const membershipId = Number((db.prepare("SELECT id FROM goal_kpis ORDER BY id LIMIT 1").get() as { id: number }).id);
  const componentId = Number((db.prepare(
    "SELECT id FROM kpi_components WHERE configuration_id <> ? ORDER BY id LIMIT 1",
  ).get(excludedConfigurationId) as { id: number }).id);
  const targetId = Number((db.prepare("SELECT id FROM kpi_targets ORDER BY id LIMIT 1").get() as { id: number }).id);

  db.prepare(
    `UPDATE strategic_goals SET completion_rule = 'weighted_average',
       threshold_percentage = 73, configuration_status = 'ready',
       unresolved_question = NULL WHERE id = ?`,
  ).run(goalId);
  db.prepare(
    `UPDATE kpi_measurement_configs SET calculation_precision = 4,
       board_level_status = 'at_risk', owner = 'Operator owner' WHERE id = ?`,
  ).run(configurationId);
  db.prepare(
    "UPDATE goal_kpis SET is_required = 0, weight = 2.5, display_order = 99 WHERE id = ?",
  ).run(membershipId);
  db.prepare(
    `UPDATE kpi_components SET label = 'Operator component label', weight = 2.5,
       configuration_status = 'ready', unresolved_question = NULL WHERE id = ?`,
  ).run(componentId);
  db.prepare(
    `UPDATE kpi_targets SET target_value = 12345,
       target_description = 'Operator-approved target', configuration_status = 'active'
     WHERE id = ?`,
  ).run(targetId);

  return {
    goal: readById(db, "strategic_goals", goalId,
      "id, completion_rule, threshold_percentage, configuration_status, unresolved_question"),
    configuration: readById(db, "kpi_measurement_configs", configurationId,
      "id, calculation_precision, board_level_status, owner"),
    membership: readById(db, "goal_kpis", membershipId,
      "id, is_required, weight, display_order"),
    component: readById(db, "kpi_components", componentId,
      "id, label, weight, configuration_status, unresolved_question"),
    target: readById(db, "kpi_targets", targetId,
      "id, target_value, target_description, configuration_status"),
  };
}

/** Supports the read operator owned strategy test scenario. */
function readOperatorOwnedStrategy(
  db: DatabaseSync,
  snapshot: OperatorOwnedSnapshot,
): OperatorOwnedSnapshot {
  return {
    goal: readById(db, "strategic_goals", Number(snapshot.goal.id),
      "id, completion_rule, threshold_percentage, configuration_status, unresolved_question"),
    configuration: readById(db, "kpi_measurement_configs", Number(snapshot.configuration.id),
      "id, calculation_precision, board_level_status, owner"),
    membership: readById(db, "goal_kpis", Number(snapshot.membership.id),
      "id, is_required, weight, display_order"),
    component: readById(db, "kpi_components", Number(snapshot.component.id),
      "id, label, weight, configuration_status, unresolved_question"),
    target: readById(db, "kpi_targets", Number(snapshot.target.id),
      "id, target_value, target_description, configuration_status"),
  };
}

/** Supports the read by id test scenario. */
function readById(
  db: DatabaseSync,
  table: string,
  id: number,
  columns: string,
): Record<string, unknown> {
  return db.prepare(`SELECT ${columns} FROM ${table} WHERE id = ?`).get(id) as Record<string, unknown>;
}

/** Supports the run tsx test scenario. */
function runTsx(script: string, databasePath: string) {
  return spawnSync(path.join(process.cwd(), "node_modules", ".bin", "tsx"), [script], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_PATH: databasePath },
    encoding: "utf8",
  });
}

/** Supports the run pending migration test scenario. */
function runPendingMigration(databasePath: string) {
  const db = new DatabaseSync(databasePath);
  db.prepare(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_12_content_migration_pending', '1')",
  ).run();
  db.close();
  return runTsx("scripts/migrate.ts", databasePath);
}

/** Supports the scalar count test scenario. */
function scalarCount(db: DatabaseSync, table: string): number {
  return Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
}

/** Supports the government configuration test scenario. */
function governmentConfiguration(db: DatabaseSync): {
  kpi_id: number;
  configuration_id: number;
} {
  return db.prepare(
    `SELECT kpi.id AS kpi_id, config.id AS configuration_id
     FROM kpis kpi
     JOIN kpi_measurement_configs config ON config.kpi_id = kpi.id
     WHERE kpi.slug = 'government-support-percentage'`,
  ).get() as { kpi_id: number; configuration_id: number };
}

/** Supports the restore legacy government signature test scenario. */
function restoreLegacyGovernmentSignature(
  db: DatabaseSync,
  configurationId: number,
): void {
  db.prepare(
    "DELETE FROM kpi_components WHERE configuration_id = ? AND slug = 'contributed-revenue'",
  ).run(configurationId);
  db.prepare(
    `UPDATE kpi_components
     SET aggregation_role = 'value',
         unresolved_question = 'Finalize city and state support targets as portions of contributed revenue.'
     WHERE configuration_id = ?`,
  ).run(configurationId);
  db.prepare(
    `UPDATE kpi_measurement_configs
     SET aggregation_method = 'sum',
         unresolved_question = 'Finalize city and state support targets as portions of contributed revenue.'
     WHERE id = ?`,
  ).run(configurationId);
}
