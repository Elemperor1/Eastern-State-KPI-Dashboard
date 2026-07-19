import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb, SCHEMA_VERSION } from "@/lib/db";

const STRATEGIC_TABLES = [
  "strategic_goals",
  "goal_kpis",
  "kpi_measurement_configs",
  "kpi_observations",
  "kpi_components",
  "kpi_component_entries",
  "kpi_targets",
  "distribution_bands",
  "distribution_observations",
  "distribution_values",
  "strategic_audit_events",
] as const;

const INSTALLATION_TABLES = [
  "organizations",
  "strategic_plans",
  "installation_audit_events",
] as const;

const LEGACY_TABLES = [
  "users",
  "categories",
  "kpis",
  "monthly_entries",
  "breakdown_entries",
  "entry_history",
  "kpi_goals",
] as const;

type TestDb = ReturnType<typeof getDb>;

/** Supports the count rows test scenario. */
function countRows(db: TestDb, table: string): number {
  return Number(
    (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number })
      .count,
  );
}

/** Supports the column names test scenario. */
function columnNames(db: TestDb, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
    (column) => column.name,
  );
}

/** Supports the schema version test scenario. */
function schemaVersion(db: TestDb): number {
  return Number(
    (
      db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as {
        value: string;
      }
    ).value,
  );
}

/** Supports the seed installation fixture test scenario. */
function seedInstallationFixture(db: TestDb): number {
  const organizationId = Number(
    db
      .prepare(
        `INSERT INTO organizations (slug, name, short_name, status)
         VALUES ('test-organization', 'Test Organization', 'Test Org', 'active')`,
      )
      .run().lastInsertRowid,
  );
  return Number(
    db
      .prepare(
        `INSERT INTO strategic_plans (
           organization_id, slug, name, start_year, end_year, status
         ) VALUES (?, 'test-plan', 'Test Plan', 2025, 2029, 'active')`,
      )
      .run(organizationId).lastInsertRowid,
  );
}

/** Supports the downgrade installation ownership to v11 test scenario. */
function downgradeInstallationOwnershipToV11(db: TestDb): void {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TRIGGER IF EXISTS categories_set_updated_at_after_insert;
    DROP TRIGGER IF EXISTS categories_set_updated_at_after_update;
    DROP INDEX IF EXISTS idx_categories_archived_at;

    CREATE TABLE categories_v11 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      updated_at TEXT
    );
    INSERT INTO categories_v11 (
      id, slug, name, description, sort_order, archived_at, updated_at
    )
    SELECT id, slug, name, description, sort_order, archived_at, updated_at
    FROM categories;
    DROP TABLE categories;
    ALTER TABLE categories_v11 RENAME TO categories;
    CREATE INDEX idx_categories_archived_at ON categories(archived_at);

    CREATE TRIGGER categories_set_updated_at_after_insert
    AFTER INSERT ON categories
    FOR EACH ROW WHEN NEW.updated_at IS NULL
    BEGIN
      UPDATE categories SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER categories_set_updated_at_after_update
    AFTER UPDATE OF slug, name, description, sort_order, archived_at ON categories
    FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
    BEGIN
      UPDATE categories SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    DROP TABLE installation_audit_events;
    DROP TABLE strategic_plans;
    DROP TABLE organizations;
    INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '11');
    PRAGMA foreign_keys = ON;
  `);
}

/** Supports the downgrade strategic foundation to v9 test scenario. */
function downgradeStrategicFoundationToV9(db: TestDb): void {
  downgradeInstallationOwnershipToV11(db);
  // Build an actual v9-shaped copy from the freshly initialized database. All
  // strategic sidecars are empty because schema 10 intentionally performs no
  // canonical backfill yet.
  db.exec(`
    DROP TRIGGER IF EXISTS categories_set_updated_at_after_insert;
    DROP TRIGGER IF EXISTS categories_set_updated_at_after_update;
    DROP TRIGGER IF EXISTS kpis_set_updated_at_after_insert;
    DROP TRIGGER IF EXISTS kpis_set_updated_at_after_update;
    DROP INDEX IF EXISTS idx_categories_archived_at;
    DROP INDEX IF EXISTS idx_kpis_archived_at;

    DROP TABLE IF EXISTS distribution_values;
    DROP TABLE IF EXISTS distribution_observations;
    DROP TABLE IF EXISTS distribution_bands;
    DROP TABLE IF EXISTS kpi_component_entries;
    DROP TABLE IF EXISTS kpi_targets;
    DROP TABLE IF EXISTS kpi_components;
    DROP TABLE IF EXISTS kpi_observations;
    DROP TABLE IF EXISTS goal_kpis;
    DROP TABLE IF EXISTS strategic_goals;
    DROP TABLE IF EXISTS kpi_measurement_configs;
    DROP TABLE IF EXISTS strategic_audit_events;

    ALTER TABLE categories DROP COLUMN archived_at;
    ALTER TABLE categories DROP COLUMN updated_at;
    ALTER TABLE kpis DROP COLUMN archived_at;
    ALTER TABLE kpis DROP COLUMN updated_at;
    INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '9');
  `);
}

/** Supports the downgrade component identity to v10 test scenario. */
function downgradeComponentIdentityToV10(db: TestDb): void {
  downgradeInstallationOwnershipToV11(db);
  // Recreate the actual schema-10 component identity on an otherwise-current,
  // empty strategic sidecar. Child tables continue to reference the same table
  // name, so the fixture can add representative child rows after this step.
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DROP INDEX IF EXISTS idx_kpi_components_parent;
    DROP INDEX IF EXISTS idx_kpi_components_configuration;
    DROP TABLE kpi_components;
    CREATE TABLE kpi_components (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE RESTRICT,
      configuration_id INTEGER NOT NULL,
      slug TEXT NOT NULL,
      label TEXT NOT NULL,
      measurement_type TEXT CHECK (
        measurement_type IS NULL OR measurement_type IN (
          'binary','milestone','count','percentage','average','cumulative',
          'year_over_year','distribution','currency','ratio','multi_component'
        )
      ),
      unit TEXT,
      numerator_label TEXT,
      denominator_label TEXT,
      fixed_denominator REAL CHECK (fixed_denominator IS NULL OR fixed_denominator > 0),
      baseline_value REAL,
      previous_period_value REAL,
      weight REAL NOT NULL DEFAULT 1 CHECK (weight >= 0),
      display_order INTEGER NOT NULL DEFAULT 0,
      configuration_status TEXT NOT NULL DEFAULT 'draft'
        CHECK (configuration_status IN ('draft','needs_definition','needs_target','ready','active','archived')),
      unresolved_question TEXT,
      archived_at TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (kpi_id, slug),
      UNIQUE (id, kpi_id),
      FOREIGN KEY (configuration_id, kpi_id)
        REFERENCES kpi_measurement_configs(id, kpi_id) ON DELETE RESTRICT
    );
    CREATE INDEX idx_kpi_components_parent
      ON kpi_components(kpi_id, display_order);
    CREATE INDEX idx_kpi_components_configuration
      ON kpi_components(configuration_id);
    INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '10');
    PRAGMA foreign_keys = ON;
  `);
}

describe("schema 12 migration", () => {
  let tmpDir: string;
  let dbPath: string;
  let originalDbPath: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-schema-test-"));
    dbPath = path.join(tmpDir, "test.db");
    originalDbPath = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = dbPath;
    resetDb();
  });

  afterEach(() => {
    resetDb();
    if (originalDbPath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = originalDbPath;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Supports the seed current fixture test scenario. */
  function seedCurrentFixture() {
    const db = getDb();
    const planId = seedInstallationFixture(db);
    db.prepare(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ('migration@example.org', 'Migration User', 'hash', 'admin')`,
    ).run();
    const userId = Number(
      (
        db
          .prepare("SELECT id FROM users WHERE email = 'migration@example.org'")
          .get() as { id: number }
      ).id,
    );
    db.prepare(
      `INSERT INTO categories (plan_id, slug, name, sort_order)
       VALUES (?, 'legacy-category', 'Legacy Category', 1)`,
    ).run(planId);
    const categoryId = Number(
      (
        db
          .prepare("SELECT id FROM categories WHERE slug = 'legacy-category'")
          .get() as { id: number }
      ).id,
    );
    db.prepare(
      `INSERT INTO kpis (
         category_id, slug, name, unit, unit_type,
         reporting_frequency, direction, sort_order
       )
       VALUES (?, 'legacy-kpi', 'Legacy KPI', 'count', 'count',
               'annual', 'higher', 1)`,
    ).run(categoryId);
    db.prepare(
      `INSERT INTO kpis (
         category_id, slug, name, unit, unit_type,
         reporting_frequency, direction, sort_order
       )
       VALUES (?, 'legacy-breakdown', 'Legacy Breakdown', '%', 'breakdown',
               'annual', 'neutral', 2)`,
    ).run(categoryId);
    const kpiId = Number(
      (
        db.prepare("SELECT id FROM kpis WHERE slug = 'legacy-kpi'").get() as {
          id: number;
        }
      ).id,
    );
    const breakdownKpiId = Number(
      (
        db
          .prepare("SELECT id FROM kpis WHERE slug = 'legacy-breakdown'")
          .get() as { id: number }
      ).id,
    );
    db.prepare(
      `INSERT INTO monthly_entries (kpi_id, year, month, value, updated_by)
       VALUES (?, 2024, 0, 10, ?), (?, 2026, 0, 20, ?)`,
    ).run(kpiId, userId, kpiId, userId);
    const entryId = Number(
      (
        db
          .prepare(
            "SELECT id FROM monthly_entries WHERE kpi_id = ? AND year = 2026 AND month = 0",
          )
          .get(kpiId) as { id: number }
      ).id,
    );
    db.prepare(
      `INSERT INTO breakdown_entries (
         kpi_id, year, month, label, value, sort_order, updated_by
       ) VALUES (?, 2026, 0, 'Foundation', 75, 1, ?)`,
    ).run(breakdownKpiId, userId);
    const breakdownEntryId = Number(
      (
        db
          .prepare(
            "SELECT id FROM breakdown_entries WHERE kpi_id = ? AND year = 2026 AND label = 'Foundation'",
          )
          .get(breakdownKpiId) as { id: number }
      ).id,
    );
    db.prepare(
      `INSERT INTO entry_history (
         entry_type, entry_id, kpi_id, year, month_or_label,
         new_value, changed_by, kpi_name, kpi_slug, kpi_unit,
         category_id, category_name, category_slug, changed_by_email
       )
       VALUES (
         'monthly', ?, ?, 2026, '0', 20, ?, 'Legacy KPI', 'legacy-kpi',
         'count', ?, 'Legacy Category', 'legacy-category',
         'migration@example.org'
       )`,
    ).run(entryId, kpiId, userId, categoryId);
    const historyId = Number(
      (db.prepare("SELECT id FROM entry_history").get() as { id: number }).id,
    );
    db.prepare(
      `INSERT INTO kpi_goals (
         kpi_id, target_year, baseline_year, goal_type, target_value,
         enabled, notes, created_by, updated_by
       ) VALUES (?, 2029, 2026, 'number', 3, 1, 'Legacy target', ?, ?)`,
    ).run(kpiId, userId, userId);
    const goalId = Number(
      (db.prepare("SELECT id FROM kpi_goals").get() as { id: number }).id,
    );
    db.prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('sample_data', '1')",
    ).run();
    return {
      db,
      userId,
      categoryId,
      kpiId,
      breakdownKpiId,
      entryId,
      breakdownEntryId,
      historyId,
      goalId,
      planId,
    };
  }

  it("creates a clean schema-12 database with installation, legacy, and strategic tables", () => {
    const db = getDb();
    const tableNames = new Set(
      (
        db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all() as { name: string }[]
      ).map((row) => row.name),
    );

    expect(SCHEMA_VERSION).toBe(12);
    expect(schemaVersion(db)).toBe(12);
    for (const table of [
      ...INSTALLATION_TABLES,
      ...LEGACY_TABLES,
      ...STRATEGIC_TABLES,
    ]) {
      expect(tableNames.has(table), `${table} should exist`).toBe(true);
    }
    expect(columnNames(db, "categories")).toEqual(
      expect.arrayContaining(["plan_id", "archived_at", "updated_at"]),
    );
    expect(
      db
        .prepare("PRAGMA foreign_key_list(categories)")
        .all()
        .some(
          (foreignKey) =>
            foreignKey.table === "strategic_plans" &&
            foreignKey.from === "plan_id" &&
            foreignKey.on_delete === "RESTRICT",
        ),
    ).toBe(true);
    expect(columnNames(db, "kpis")).toEqual(
      expect.arrayContaining(["archived_at", "updated_at"]),
    );
    expect(columnNames(db, "strategic_goals")).toEqual(
      expect.arrayContaining([
        "plan_start_year",
        "plan_end_year",
        "board_level_status",
      ]),
    );
    expect(columnNames(db, "goal_kpis")).toEqual(
      expect.arrayContaining([
        "effective_from_year",
        "effective_to_year",
        "archived_at",
      ]),
    );
    expect(columnNames(db, "kpi_observations")).toContain("average_score");
    expect(columnNames(db, "kpi_component_entries")).toContain("average_score");
    expect(columnNames(db, "kpi_components")).toContain("aggregation_role");
    expect(columnNames(db, "distribution_bands")).toContain("derived_group");
    const goalColumns = db.prepare("PRAGMA table_info(strategic_goals)").all() as Array<{
      name: string;
      dflt_value: string | null;
    }>;
    expect(goalColumns.find((column) => column.name === "plan_start_year")?.dflt_value).toBeNull();
    expect(goalColumns.find((column) => column.name === "plan_end_year")?.dflt_value).toBeNull();
    const membershipColumns = db.prepare("PRAGMA table_info(goal_kpis)").all() as Array<{
      name: string;
      dflt_value: string | null;
    }>;
    expect(
      membershipColumns.find((column) => column.name === "effective_from_year")?.dflt_value,
    ).toBeNull();
    const targetSchema = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'kpi_targets'")
      .get() as { sql: string };
    expect(targetSchema.sql).not.toContain("BETWEEN 2025 AND 2029");

    // Foundation only: canonical strategic goals/configurations are not
    // backfilled by the schema migration itself.
    for (const table of STRATEGIC_TABLES) {
      expect(countRows(db, table), `${table} should start empty`).toBe(0);
      const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${table})`).all() as {
        on_delete: string;
      }[];
      expect(
        foreignKeys.every((foreignKey) => foreignKey.on_delete !== "CASCADE"),
        `${table} must not use cascading deletes`,
      ).toBe(true);
    }

    const indexNames = new Set(
      (
        db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
          .all() as { name: string }[]
      ).map((row) => row.name),
    );
    for (const index of [
      "idx_strategic_goals_priority",
      "idx_goal_kpis_kpi",
      "idx_kpi_measurement_configs_effective",
      "idx_kpi_observations_period",
      "idx_kpi_components_parent",
      "idx_kpi_targets_year",
      "idx_distribution_observations_configuration",
      "idx_strategic_audit_entity",
    ]) {
      expect(indexNames.has(index), `${index} should exist`).toBe(true);
    }
  });

  it("migrates a populated schema-11 plan owner once without changing descendant ids", () => {
    const fixture = seedCurrentFixture();
    const before = {
      categoryId: fixture.categoryId,
      kpiId: fixture.kpiId,
      entryId: fixture.entryId,
      historyId: fixture.historyId,
      categoryCount: countRows(fixture.db, "categories"),
      kpiCount: countRows(fixture.db, "kpis"),
      entryCount: countRows(fixture.db, "monthly_entries"),
      historyCount: countRows(fixture.db, "entry_history"),
    };
    downgradeInstallationOwnershipToV11(fixture.db);
    expect(schemaVersion(fixture.db)).toBe(11);
    expect(columnNames(fixture.db, "categories")).not.toContain("plan_id");

    resetDb();
    const migrated = getDb();
    const ownership = migrated
      .prepare(
        `SELECT organization.slug AS organization_slug,
                plan.slug AS plan_slug, plan.start_year, plan.end_year,
                priority.id AS category_id, priority.plan_id
         FROM categories priority
         JOIN strategic_plans plan ON plan.id = priority.plan_id
         JOIN organizations organization ON organization.id = plan.organization_id`,
      )
      .get() as Record<string, unknown>;

    expect(schemaVersion(migrated)).toBe(12);
    expect(ownership).toMatchObject({
      organization_slug: "eastern-state-penitentiary-historic-site",
      plan_slug: "strategic-plan-2025-2029",
      start_year: 2025,
      end_year: 2029,
      category_id: before.categoryId,
    });
    expect(countRows(migrated, "categories")).toBe(before.categoryCount);
    expect(countRows(migrated, "kpis")).toBe(before.kpiCount);
    expect(countRows(migrated, "monthly_entries")).toBe(before.entryCount);
    expect(countRows(migrated, "entry_history")).toBe(before.historyCount);
    expect(
      (migrated.prepare("SELECT id FROM kpis WHERE slug = 'legacy-kpi'").get() as { id: number }).id,
    ).toBe(before.kpiId);
    expect(
      (migrated.prepare("SELECT id FROM monthly_entries WHERE year = 2026").get() as { id: number }).id,
    ).toBe(before.entryId);
    expect(
      (migrated.prepare("SELECT id FROM entry_history").get() as { id: number }).id,
    ).toBe(before.historyId);
    expect(countRows(migrated, "organizations")).toBe(1);
    expect(countRows(migrated, "strategic_plans")).toBe(1);
    expect(countRows(migrated, "installation_audit_events")).toBe(2);
    const migratedGoalColumns = migrated
      .prepare("PRAGMA table_info(strategic_goals)")
      .all() as Array<{ name: string; dflt_value: string | null }>;
    expect(
      migratedGoalColumns.find((column) => column.name === "plan_start_year")
        ?.dflt_value,
    ).toBeNull();
    expect(
      migratedGoalColumns.find((column) => column.name === "plan_end_year")
        ?.dflt_value,
    ).toBeNull();
    const migratedMembershipColumns = migrated
      .prepare("PRAGMA table_info(goal_kpis)")
      .all() as Array<{ name: string; dflt_value: string | null }>;
    expect(
      migratedMembershipColumns.find(
        (column) => column.name === "effective_from_year",
      )?.dflt_value,
    ).toBeNull();
    expect(
      (
        migrated
          .prepare(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'kpi_targets'",
          )
          .get() as { sql: string }
      ).sql,
    ).not.toContain("BETWEEN 2025 AND 2029");
    migrated
      .prepare("UPDATE strategic_plans SET end_year = 2030 WHERE status = 'active'")
      .run();
    expect(() =>
      migrated
        .prepare(
          `INSERT INTO kpi_targets (
             kpi_id, target_scope, target_year, target_value,
             configuration_status
           ) VALUES (?, 'full_plan', 2030, 1, 'draft')`,
        )
        .run(before.kpiId),
    ).not.toThrow();
    expect(migrated.prepare("PRAGMA foreign_key_check").all()).toEqual([]);

    resetDb();
    const reopened = getDb();
    expect(countRows(reopened, "organizations")).toBe(1);
    expect(countRows(reopened, "strategic_plans")).toBe(1);
    expect(countRows(reopened, "installation_audit_events")).toBe(2);
  });

  it("rolls back every schema-12 change when installation ownership cannot be installed", () => {
    const fixture = seedCurrentFixture();
    downgradeInstallationOwnershipToV11(fixture.db);
    fixture.db.exec(`
      CREATE TABLE installation_audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT
      );
    `);
    resetDb();

    expect(() => getDb()).toThrow();

    const verify = new DatabaseSync(dbPath);
    expect(
      Number(
        (
          verify
            .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
            .get() as { value: string }
        ).value,
      ),
    ).toBe(11);
    expect(
      (verify.prepare("PRAGMA table_info(categories)").all() as Array<{ name: string }>).map(
        (column) => column.name,
      ),
    ).not.toContain("plan_id");
    expect(
      verify
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name IN ('organizations', 'strategic_plans')`,
        )
        .all(),
    ).toEqual([]);
    expect(
      (verify.prepare("PRAGMA table_info(installation_audit_events)").all() as Array<{ name: string }>).map(
        (column) => column.name,
      ),
    ).toEqual(["id"]);
    verify.close();
  });

  it("migrates a schema-9 copy additively without changing legacy rows or ids", () => {
    const fixture = seedCurrentFixture();
    const legacyQueries: Record<string, string> = {
      users: "SELECT id, email, name, password_hash, role, created_at, must_change_password, disabled, sessions_valid_after FROM users ORDER BY id",
      categories:
        "SELECT id, slug, name, description, sort_order FROM categories ORDER BY id",
      kpis: `SELECT id, category_id, parent_id, slug, name, unit, unit_type,
                    reporting_frequency, direction, description, sort_order,
                    is_active, created_at FROM kpis ORDER BY id`,
      monthly_entries: "SELECT * FROM monthly_entries ORDER BY id",
      breakdown_entries: "SELECT * FROM breakdown_entries ORDER BY id",
      entry_history: "SELECT * FROM entry_history ORDER BY id",
      kpi_goals: "SELECT * FROM kpi_goals ORDER BY id",
    };
    const before = Object.fromEntries(
      Object.entries(legacyQueries).map(([table, query]) => [
        table,
        fixture.db.prepare(query).all(),
      ]),
    );
    const beforeCounts = Object.fromEntries(
      LEGACY_TABLES.map((table) => [table, countRows(fixture.db, table)]),
    );

    downgradeStrategicFoundationToV9(fixture.db);
    expect(schemaVersion(fixture.db)).toBe(9);
    expect(columnNames(fixture.db, "categories")).not.toContain("archived_at");
    expect(columnNames(fixture.db, "kpis")).not.toContain("updated_at");

    resetDb();
    const migrated = getDb();

    expect(schemaVersion(migrated)).toBe(12);
    for (const [table, query] of Object.entries(legacyQueries)) {
      expect(countRows(migrated, table)).toBe(beforeCounts[table]);
      expect(migrated.prepare(query).all()).toEqual(before[table]);
    }
    expect(
      (migrated.prepare("SELECT id FROM categories").get() as { id: number }).id,
    ).toBe(fixture.categoryId);
    expect(
      (
        migrated.prepare("SELECT id FROM kpis WHERE slug = 'legacy-kpi'").get() as {
          id: number;
        }
      ).id,
    ).toBe(fixture.kpiId);
    expect(
      (migrated.prepare("SELECT id FROM monthly_entries WHERE year = 2026").get() as {
        id: number;
      }).id,
    ).toBe(fixture.entryId);
    expect(
      (migrated.prepare("SELECT id FROM breakdown_entries").get() as { id: number })
        .id,
    ).toBe(fixture.breakdownEntryId);
    expect(
      (migrated.prepare("SELECT id FROM entry_history").get() as { id: number }).id,
    ).toBe(fixture.historyId);
    expect(
      (migrated.prepare("SELECT id FROM kpi_goals").get() as { id: number }).id,
    ).toBe(fixture.goalId);
    expect(
      migrated
        .prepare("SELECT kpi_name, category_name, changed_by_email FROM entry_history")
        .get(),
    ).toEqual({
      kpi_name: "Legacy KPI",
      category_name: "Legacy Category",
      changed_by_email: "migration@example.org",
    });
    expect(
      migrated.prepare("SELECT id FROM categories WHERE updated_at IS NOT NULL").get(),
    ).toBeDefined();
    expect(
      migrated.prepare("SELECT id FROM kpis WHERE updated_at IS NULL").get(),
    ).toBeUndefined();
    for (const table of STRATEGIC_TABLES) {
      expect(countRows(migrated, table)).toBe(0);
    }
    expect(migrated.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("runs the v8 goal migration before installing the v10 foundation", () => {
    const { db, kpiId, userId } = seedCurrentFixture();
    downgradeStrategicFoundationToV9(db);
    db.exec("DROP TABLE kpi_goals;");
    db.exec(`
      CREATE TABLE kpi_goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
        target_year INTEGER NOT NULL,
        goal_type TEXT NOT NULL CHECK (goal_type IN ('pct','number')),
        target_value REAL NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (kpi_id, target_year)
      );
    `);
    db.prepare(
      `INSERT INTO kpi_goals (
         kpi_id, target_year, goal_type, target_value, created_by, updated_by
       ) VALUES (?, 2029, 'number', 3, ?, ?)`,
    ).run(kpiId, userId, userId);
    db.prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '8')",
    ).run();

    resetDb();
    const migrated = getDb();
    const goal = migrated
      .prepare(
        `SELECT kpi_id, target_year, baseline_year, goal_type, target_value
         FROM kpi_goals
         WHERE kpi_id = ?`,
      )
      .get(kpiId);

    expect(SCHEMA_VERSION).toBe(12);
    expect(schemaVersion(migrated)).toBe(12);
    expect(goal).toMatchObject({
      kpi_id: kpiId,
      target_year: 2029,
      baseline_year: 2026,
      goal_type: "number",
      target_value: 3,
    });
    expect(
      (
        migrated.prepare("SELECT email FROM users WHERE id = ?").get(userId) as {
          email: string;
        }
      ).email,
    ).toBe("migration@example.org");
    expect(countRows(migrated, "entry_history")).toBe(1);
    expect(columnNames(migrated, "categories")).toEqual(
      expect.arrayContaining(["archived_at", "updated_at"]),
    );
    for (const table of STRATEGIC_TABLES) {
      expect(countRows(migrated, table)).toBe(0);
    }
  });

  it("migrates schema-10 component slugs to configuration scope without changing ids or child data", () => {
    const { db, kpiId, userId } = seedCurrentFixture();
    downgradeComponentIdentityToV10(db);
    const firstConfigId = Number(
      db
        .prepare(
          `INSERT INTO kpi_measurement_configs (
             kpi_id, effective_from_year, effective_to_year, measurement_type,
             unit, reporting_frequency, aggregation_method,
             configuration_status, created_by, updated_by
           ) VALUES (?, 2025, 2026, 'multi_component', '%', 'annual', 'sum',
                     'active', ?, ?)`,
        )
        .run(kpiId, userId, userId).lastInsertRowid,
    );
    const laterConfigId = Number(
      db
        .prepare(
          `INSERT INTO kpi_measurement_configs (
             kpi_id, effective_from_year, effective_to_year, measurement_type,
             unit, reporting_frequency, aggregation_method,
             configuration_status, created_by, updated_by
           ) VALUES (?, 2027, 2029, 'multi_component', '%', 'annual', 'sum',
                     'active', ?, ?)`,
        )
        .run(kpiId, userId, userId).lastInsertRowid,
    );
    const componentId = Number(
      db
        .prepare(
          `INSERT INTO kpi_components (
             kpi_id, configuration_id, slug, label, measurement_type, unit,
             display_order, configuration_status, created_by, updated_by
           ) VALUES (?, ?, 'city-support', 'City support', 'percentage', '%',
                     10, 'active', ?, ?)`,
        )
        .run(kpiId, firstConfigId, userId, userId).lastInsertRowid,
    );
    const entryId = Number(
      db
        .prepare(
          `INSERT INTO kpi_component_entries (
             component_id, year, period_type, period_index, numerator,
             denominator, updated_by
           ) VALUES (?, 2026, 'annual', 0, 25, 100, ?)`,
        )
        .run(componentId, userId).lastInsertRowid,
    );
    const targetId = Number(
      db
        .prepare(
          `INSERT INTO kpi_targets (
             component_id, target_scope, reporting_year, target_year,
             target_value, configuration_status, created_by, updated_by
           ) VALUES (?, 'annual', 2026, 2026, 30, 'active', ?, ?)`,
        )
        .run(componentId, userId, userId).lastInsertRowid,
    );
    expect(schemaVersion(db)).toBe(10);

    resetDb();
    const migrated = getDb();

    expect(SCHEMA_VERSION).toBe(12);
    expect(schemaVersion(migrated)).toBe(12);
    expect(
      migrated.prepare("SELECT * FROM kpi_components WHERE id = ?").get(componentId),
    ).toMatchObject({
      id: componentId,
      kpi_id: kpiId,
      configuration_id: firstConfigId,
      slug: "city-support",
      aggregation_role: "value",
    });
    expect(
      migrated.prepare("SELECT * FROM kpi_component_entries WHERE id = ?").get(entryId),
    ).toMatchObject({ id: entryId, component_id: componentId, numerator: 25, denominator: 100 });
    expect(
      migrated.prepare("SELECT * FROM kpi_targets WHERE id = ?").get(targetId),
    ).toMatchObject({ id: targetId, component_id: componentId, target_value: 30 });

    expect(() =>
      migrated
        .prepare(
          "UPDATE kpi_measurement_configs SET aggregation_method = 'ratio' WHERE id = ?",
        )
        .run(laterConfigId),
    ).not.toThrow();
    expect(() =>
      migrated
        .prepare(
          `INSERT INTO kpi_components (
             kpi_id, configuration_id, slug, label, measurement_type, unit,
             display_order, configuration_status, created_by, updated_by
           ) VALUES (?, ?, 'city-support', 'Duplicate city support', 'percentage', '%',
                     20, 'active', ?, ?)`,
        )
        .run(kpiId, firstConfigId, userId, userId),
    ).toThrow();

    expect(() =>
      migrated
        .prepare(
          `INSERT INTO kpi_components (
             kpi_id, configuration_id, slug, label, measurement_type, unit,
             display_order, configuration_status, created_by, updated_by
           ) VALUES (?, ?, 'city-support', 'City support', 'percentage', '%',
                     10, 'active', ?, ?)`,
        )
        .run(kpiId, laterConfigId, userId, userId),
    ).not.toThrow();
    expect(migrated.prepare("PRAGMA foreign_key_check").all()).toEqual([]);

    resetDb();
    const reopened = getDb();
    expect(schemaVersion(reopened)).toBe(12);
    expect(
      reopened
        .prepare(
          "SELECT id, configuration_id, slug FROM kpi_components WHERE kpi_id = ? ORDER BY configuration_id",
        )
        .all(kpiId),
    ).toEqual([
      { id: componentId, configuration_id: firstConfigId, slug: "city-support" },
      expect.objectContaining({ configuration_id: laterConfigId, slug: "city-support" }),
    ]);
  });

  it.each([4, 5, 6, 7])(
    "resets incompatible schema %s data while preserving users",
    (legacyVersion) => {
      const { db, userId } = seedCurrentFixture();
      db.prepare(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
      ).run(String(legacyVersion));

      resetDb();
      const migrated = getDb();

      expect(countRows(migrated, "users")).toBe(1);
      expect(
        (
          migrated.prepare("SELECT email FROM users WHERE id = ?").get(userId) as {
            email: string;
          }
        ).email,
      ).toBe("migration@example.org");
      expect(countRows(migrated, "categories")).toBe(0);
      expect(countRows(migrated, "kpis")).toBe(0);
      expect(countRows(migrated, "monthly_entries")).toBe(0);
      expect(countRows(migrated, "entry_history")).toBe(0);
      expect(countRows(migrated, "kpi_goals")).toBe(0);
      expect(
        migrated.prepare("SELECT value FROM meta WHERE key = 'sample_data'").get(),
      ).toBeUndefined();
      expect(schemaVersion(migrated)).toBe(12);
    },
  );
});
