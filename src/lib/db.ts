import { DatabaseSync, type StatementSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import schemaVersionConfig from "./schema-version.json";

interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

interface DB {
  exec(sql: string): void;
  prepare(sql: string): StatementLike;
  close(): void;
}

interface StatementLike {
  all(...params: unknown[]): Record<string, unknown>[];
  get(...params: unknown[]): Record<string, unknown> | undefined;
  run(...params: unknown[]): RunResult;
}

let _db: DB | null = null;

/** Bump when the KPI/category/entry schema changes; old DBs are reset cleanly. */
export const SCHEMA_VERSION = schemaVersionConfig.schemaVersion;

function resolveDbPath(): string {
  const fromEnv = process.env.DATABASE_PATH;
  if (fromEnv) return fromEnv;
  return path.resolve(process.cwd(), "data", "kpi.db");
}

function wrapDatabase(raw: DatabaseSync): DB {
  const db = raw as unknown as {
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  };
  return {
    exec: (sql: string) => db.exec(sql),
    prepare: (sql: string): StatementLike => {
      const stmt = db.prepare(sql);
      const wrapped = stmt as unknown as {
        all(...params: unknown[]): Record<string, unknown>[];
        get(...params: unknown[]): Record<string, unknown> | undefined;
        run(...params: unknown[]): RunResult;
      };
      return {
        all(...params: unknown[]): Record<string, unknown>[] {
          const rows = wrapped.all(...params);
          return rows.map((r) => ({ ...r }));
        },
        get(...params: unknown[]): Record<string, unknown> | undefined {
          const row = wrapped.get(...params);
          return row ? { ...row } : undefined;
        },
        run(...params: unknown[]): RunResult {
          const result = wrapped.run(...params);
          return {
            changes: Number(result.changes ?? 0),
            lastInsertRowid:
              typeof result.lastInsertRowid === "bigint"
                ? Number(result.lastInsertRowid)
                : Number(result.lastInsertRowid),
          };
        },
      };
    },
    close: () => raw.close(),
  };
}

export function getDb(): DB {
  if (_db) return _db;
  const dbPath = resolveDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const raw = new DatabaseSync(dbPath);
  try {
    raw.exec("PRAGMA journal_mode = WAL;");
    raw.exec("PRAGMA foreign_keys = ON;");
  } catch {
    // Some sandbox environments disallow pragmas; ignore.
  }
  migrateSchema(raw);
  _db = wrapDatabase(raw);
  return _db;
}

/** Users table is stable and never reset by version bumps. */
function ensureUsersTable(raw: DatabaseSync): void {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','viewer')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      must_change_password INTEGER NOT NULL DEFAULT 0,
      disabled INTEGER NOT NULL DEFAULT 0,
      sessions_valid_after INTEGER NOT NULL DEFAULT 0
    );
  `);
  // Idempotent backfill for databases created before the
  // must_change_password / disabled / sessions_valid_after columns
  // existed. CREATE TABLE IF NOT EXISTS does not add columns to an
  // already-existing table, so we ALTER explicitly when a column is
  // missing. Runs on every boot; the PRAGMA probe makes it a no-op
  // once the column is present.
  const cols = raw.prepare("PRAGMA table_info(users)").all() as
    | { name: string }[]
    | undefined;
  const colNames = (cols ?? []).map((c) => c.name);
  if (!colNames.includes("must_change_password")) {
    raw.exec(
      "ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0",
    );
  }
  // `disabled` (D8AD-CAN-003): SQLite boolean (0/1). A disabled
  // account cannot log in (verifyCredentials returns null) and any
  // session cookie that predates the disablement is rejected by
  // getCurrentUser (the sessions_valid_after watermark is bumped at
  // disable time, and a disabled row is also rejected outright).
  if (!colNames.includes("disabled")) {
    raw.exec(
      "ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0",
    );
  }
  // `sessions_valid_after`: the per-user session-revocation watermark
  // (D8AD-CAN-003). Unix-ms timestamp bumped to Date.now() on every
  // security-sensitive account change — password reset, password
  // change, role change, account disable/enable, and (implicitly)
  // deletion (a deleted row is simply absent, so findUserById returns
  // null and the session is rejected regardless of the watermark). A
  // session carries its own `issuedAt` timestamp; if
  // issuedAt < sessions_valid_after the session was issued before the
  // most recent security-sensitive change and is treated as invalid
  // (see src/lib/session.ts::getCurrentUser). DEFAULT 0 means "no
  // change yet", and a session issued at any time >= 0 is valid until
  // the first such change. Existing rows backfill to 0, so the
  // migration does not mass-invalidate sessions.
  //
  // Migration of older databases: this column was previously named
  // `credentials_changed_at` (D8AD-CAN-001, credential-only scope).
  // We rename it to reflect the broader revocation semantics, copying
  // the old value forward so no sessions are mass-invalidated by the
  // rename itself, then drop the old column for cleanliness.
  if (!colNames.includes("sessions_valid_after")) {
    raw.exec(
      "ALTER TABLE users ADD COLUMN sessions_valid_after INTEGER NOT NULL DEFAULT 0",
    );
    if (colNames.includes("credentials_changed_at")) {
      raw.exec(
        "UPDATE users SET sessions_valid_after = credentials_changed_at",
      );
      // The old column is unreferenced after the rename. DROP COLUMN
      // is supported since SQLite 3.35 (2021); node:sqlite bundles a
      // newer build, and the column has no FK/index/check dependency,
      // so this is safe. Wrapped to tolerate any environment that
      // rejects it (the lingering column is harmless if it survives).
      try {
        raw.exec("ALTER TABLE users DROP COLUMN credentials_changed_at");
      } catch {
        // Best-effort: a leftover unused column is not a correctness risk.
      }
    }
  }
}

function currentSchemaVersion(raw: DatabaseSync): number {
  try {
    const row = raw.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
      | { value?: string }
      | undefined;
    return Number(row?.value ?? 0);
  } catch {
    return 0;
  }
}

function migrateSchema(raw: DatabaseSync): void {
  ensureUsersTable(raw);
  ensureMetaTable(raw);
  const version = currentSchemaVersion(raw);
  if (version === SCHEMA_VERSION) {
    ensureStrategicSchemaV10Columns(raw);
    return;
  }

  // v10 → v11 keeps every strategic row and id while narrowing component
  // slug uniqueness to the effective measurement configuration that owns it
  // and adding explicit numerator/denominator roles for ratio aggregation.
  // This lets a logical component continue in a later, non-overlapping
  // definition without rewriting its historical component or child rows.
  if (version === 10) {
    ensureStrategicSchemaV10Columns(raw);
    migrateStrategicSchemaV11(raw);
    return;
  }

  // v9 → v10 is strictly additive. It preserves the legacy catalog, values,
  // KPI targets, and entry audit trail while installing the normalized strategic
  // planning sidecars used by the next dashboard model.
  if (version === 9) {
    migrateStrategicSchemaV10(raw);
    return;
  }

  // v8 → v9 is additive. Goals now carry an explicit, fixed baseline year so
  // multi-year strategic targets (for example, a 2029 target based on 2026
  // actuals) do not depend on nonexistent target_year - 1 data. Existing
  // goals freeze the latest available actual year before their target.
  if (version === 8) {
    migrateGoalBaselineYear(raw);
    // Record the completed v8 → v9 step before running the independently
    // transactional v9 → v10 migration. If v10 fails, the next startup safely
    // retries from schema 9 without replaying the goal-table rebuild.
    raw.exec(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '9');",
    );
    migrateStrategicSchemaV10(raw);
    return;
  }

  // v7 and older are intentionally handled by the reset path below. Version 8
  // replaces the former sample catalog with a new strategic-plan dimension
  // model (5 priorities, 59 annual KPIs, 25 goals); old KPI ids and audit
  // snapshots cannot be mapped safely. Users remain intact. Production
  // operators must back up the database before rollout (ADR 0020).

  // Any other version transition (fresh DB, or an older shape): drop the
  // KPI data tables and recreate cleanly. Users are preserved; the seed
  // script repopulates metrics + entries. entry_history references rows
  // in monthly_entries/breakdown_entries by id, so for a *shape* change
  // (not the snapshot-only v4→v5 bump) it has to be dropped alongside
  // them — the audit trail for the old shape is no longer meaningful.
  resetKpiSchema(raw);
}

function resetKpiSchema(raw: DatabaseSync): void {
  raw.exec("BEGIN IMMEDIATE;");
  try {
    raw.exec("DROP TABLE IF EXISTS entry_history;");
    raw.exec("DROP TABLE IF EXISTS kpi_goals;");
    raw.exec("DROP TABLE IF EXISTS breakdown_entries;");
    raw.exec("DROP TABLE IF EXISTS monthly_entries;");
    raw.exec("DROP TABLE IF EXISTS kpis;");
    raw.exec("DROP TABLE IF EXISTS categories;");
    raw.exec("DELETE FROM meta WHERE key = 'sample_data';");
    initializeSchema(raw);
    raw.exec(
      `INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ${SCHEMA_VERSION});`,
    );
    raw.exec("COMMIT;");
  } catch (error) {
    try {
      raw.exec("ROLLBACK;");
    } catch {
      // Surface the migration error.
    }
    throw error;
  }
}

/**
 * v8 → v9 in-place migration. Rebuilds kpi_goals with a non-null
 * baseline_year and freezes each existing goal to the latest available actual
 * year before its target. A goal with no prior actual falls back to the
 * historical target_year - 1 behavior.
 */
function migrateGoalBaselineYear(raw: DatabaseSync): void {
  const cols = raw.prepare("PRAGMA table_info(kpi_goals)").all() as
    | { name: string }[]
    | undefined;
  if (!cols || cols.length === 0) {
    return;
  }
  const colNames = new Set(cols.map((c) => c.name));
  if (colNames.has("baseline_year")) {
    return;
  }

  raw.exec("BEGIN IMMEDIATE;");
  try {
    raw.exec(`
    CREATE TABLE kpi_goals_v9 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
      target_year INTEGER NOT NULL,
      baseline_year INTEGER NOT NULL CHECK (baseline_year < target_year),
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

    INSERT INTO kpi_goals_v9 (
      id, kpi_id, target_year, baseline_year, goal_type, target_value,
      enabled, notes, created_by, created_at, updated_by, updated_at
    )
    SELECT
      g.id,
      g.kpi_id,
      g.target_year,
      COALESCE(
        (
          SELECT MAX(e.year)
          FROM monthly_entries e
          WHERE e.kpi_id = g.kpi_id
            AND e.year < g.target_year
        ),
        g.target_year - 1
      ),
      g.goal_type,
      g.target_value,
      g.enabled,
      g.notes,
      g.created_by,
      g.created_at,
      g.updated_by,
      g.updated_at
    FROM kpi_goals g;

    DROP TABLE kpi_goals;
    ALTER TABLE kpi_goals_v9 RENAME TO kpi_goals;
    CREATE INDEX idx_kpi_goals_kpi ON kpi_goals(kpi_id);
    CREATE INDEX idx_kpi_goals_year ON kpi_goals(target_year);
  `);
    raw.exec("COMMIT;");
  } catch (error) {
    try {
      raw.exec("ROLLBACK;");
    } catch {
      // Surface the migration error.
    }
    throw error;
  }
}

function tableHasColumn(
  raw: DatabaseSync,
  table: "categories" | "kpis" | "distribution_bands",
  column: string,
): boolean {
  const columns = raw.prepare(`PRAGMA table_info(${table})`).all() as
    | { name: string }[]
    | undefined;
  return (columns ?? []).some((candidate) => candidate.name === column);
}

/**
 * Shape repair for schema-10 development databases created before the
 * distribution derived-group marker landed. New installs get the column from
 * CREATE TABLE; existing schema-10 files receive the same additive column on
 * reopen without changing or deleting a row.
 */
function ensureStrategicSchemaV10Columns(raw: DatabaseSync): void {
  const table = raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'distribution_bands'")
    .get() as { name?: string } | undefined;
  if (
    table?.name === "distribution_bands" &&
    !tableHasColumn(raw, "distribution_bands", "derived_group")
  ) {
    raw.exec(
      "ALTER TABLE distribution_bands ADD COLUMN derived_group TEXT CHECK (derived_group IS NULL OR derived_group IN ('white','non_white'))",
    );
  }
}

/**
 * v10 → v11 additive component-identity and ratio-role migration.
 *
 * SQLite stores table-level UNIQUE constraints in an internal auto-index, so
 * changing `(kpi_id, slug)` to `(configuration_id, slug)` and extending the
 * aggregation constraint requires the documented table-rebuild procedure.
 * Foreign-key enforcement is disabled only around the single transaction;
 * every row and primary key is copied, child tables remain untouched, and
 * `foreign_key_check` must pass before the version is committed.
 */
function migrateStrategicSchemaV11(raw: DatabaseSync): void {
  const foreignKeysEnabled = Number(
    (
      raw.prepare("PRAGMA foreign_keys").get() as
        | { foreign_keys?: number | bigint }
        | undefined
    )?.foreign_keys ?? 0,
  ) === 1;

  if (foreignKeysEnabled) raw.exec("PRAGMA foreign_keys = OFF;");
  try {
    raw.exec("BEGIN IMMEDIATE;");
    try {
      raw.exec(`
        CREATE TABLE kpi_measurement_configs_v11 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE RESTRICT,
          effective_from_year INTEGER NOT NULL CHECK (effective_from_year BETWEEN 1900 AND 2100),
          effective_to_year INTEGER CHECK (
            effective_to_year IS NULL OR
            (effective_to_year BETWEEN 1900 AND 2100 AND effective_to_year >= effective_from_year)
          ),
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
          reporting_frequency TEXT CHECK (
            reporting_frequency IS NULL OR reporting_frequency IN (
              'monthly','quarterly','annual','cumulative','one_time','flexible'
            )
          ),
          aggregation_method TEXT CHECK (
            aggregation_method IS NULL OR aggregation_method IN (
              'none','average','weighted_average','sum','ratio','all_complete'
            )
          ),
          board_level_status TEXT,
          calculation_precision INTEGER NOT NULL DEFAULT 1
            CHECK (calculation_precision BETWEEN 0 AND 6),
          configuration_status TEXT NOT NULL DEFAULT 'draft'
            CHECK (configuration_status IN ('draft','needs_definition','needs_target','ready','active','archived')),
          unresolved_question TEXT,
          owner TEXT,
          due_date TEXT,
          resolution_notes TEXT,
          source_reference TEXT,
          last_reviewed_date TEXT,
          allow_score_over_max INTEGER NOT NULL DEFAULT 0
            CHECK (allow_score_over_max IN (0,1)),
          archived_at TEXT,
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (kpi_id, effective_from_year),
          UNIQUE (id, kpi_id)
        );

        INSERT INTO kpi_measurement_configs_v11 (
          id, kpi_id, effective_from_year, effective_to_year, measurement_type,
          unit, numerator_label, denominator_label, fixed_denominator,
          baseline_value, reporting_frequency, aggregation_method,
          board_level_status, calculation_precision, configuration_status,
          unresolved_question, owner, due_date, resolution_notes,
          source_reference, last_reviewed_date, allow_score_over_max,
          archived_at, created_by, created_at, updated_by, updated_at
        )
        SELECT
          id, kpi_id, effective_from_year, effective_to_year, measurement_type,
          unit, numerator_label, denominator_label, fixed_denominator,
          baseline_value, reporting_frequency, aggregation_method,
          board_level_status, calculation_precision, configuration_status,
          unresolved_question, owner, due_date, resolution_notes,
          source_reference, last_reviewed_date, allow_score_over_max,
          archived_at, created_by, created_at, updated_by, updated_at
        FROM kpi_measurement_configs;

        DROP TABLE kpi_measurement_configs;
        ALTER TABLE kpi_measurement_configs_v11 RENAME TO kpi_measurement_configs;
        CREATE INDEX idx_kpi_measurement_configs_effective
          ON kpi_measurement_configs(kpi_id, effective_from_year, effective_to_year);
        CREATE INDEX idx_kpi_measurement_configs_status
          ON kpi_measurement_configs(configuration_status, archived_at);

        CREATE TABLE kpi_components_v11 (
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
          aggregation_role TEXT NOT NULL DEFAULT 'value'
            CHECK (aggregation_role IN ('value','numerator','denominator')),
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
          UNIQUE (configuration_id, slug),
          UNIQUE (id, kpi_id),
          FOREIGN KEY (configuration_id, kpi_id)
            REFERENCES kpi_measurement_configs(id, kpi_id) ON DELETE RESTRICT
        );

        INSERT INTO kpi_components_v11 (
          id, kpi_id, configuration_id, slug, label, measurement_type, unit,
          numerator_label, denominator_label, fixed_denominator, baseline_value,
          previous_period_value, aggregation_role, weight, display_order, configuration_status,
          unresolved_question, archived_at, created_by, created_at, updated_by,
          updated_at
        )
        SELECT
          id, kpi_id, configuration_id, slug, label, measurement_type, unit,
          numerator_label, denominator_label, fixed_denominator, baseline_value,
          previous_period_value, 'value', weight, display_order, configuration_status,
          unresolved_question, archived_at, created_by, created_at, updated_by,
          updated_at
        FROM kpi_components;

        DROP TABLE kpi_components;
        ALTER TABLE kpi_components_v11 RENAME TO kpi_components;
        CREATE INDEX idx_kpi_components_parent
          ON kpi_components(kpi_id, display_order);
        CREATE INDEX idx_kpi_components_configuration
          ON kpi_components(configuration_id);
      `);

      const violations = raw.prepare("PRAGMA foreign_key_check").all();
      if (violations.length > 0) {
        throw new Error(
          `Schema 11 component migration produced ${violations.length} foreign-key violation(s).`,
        );
      }
      raw.exec(
        `INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ${SCHEMA_VERSION});`,
      );
      raw.exec("COMMIT;");
    } catch (error) {
      try {
        raw.exec("ROLLBACK;");
      } catch {
        // Surface the migration error.
      }
      throw error;
    }
  } finally {
    if (foreignKeysEnabled) raw.exec("PRAGMA foreign_keys = ON;");
  }
}

/**
 * v9 → v10 additive strategic-model foundation.
 *
 * The legacy tables remain authoritative during the staged rollout. No legacy
 * row is rewritten, re-keyed, or deleted here. Strategic foreign keys use
 * RESTRICT (or snapshot-only scalar ids in the audit table), so deleting a
 * priority, goal, KPI, component, target, or distribution definition can never
 * cascade through the new model.
 */
function migrateStrategicSchemaV10(raw: DatabaseSync): void {
  raw.exec("BEGIN IMMEDIATE;");
  try {
    if (!tableHasColumn(raw, "categories", "archived_at")) {
      raw.exec("ALTER TABLE categories ADD COLUMN archived_at TEXT;");
    }
    if (!tableHasColumn(raw, "categories", "updated_at")) {
      raw.exec("ALTER TABLE categories ADD COLUMN updated_at TEXT;");
    }
    if (!tableHasColumn(raw, "kpis", "archived_at")) {
      raw.exec("ALTER TABLE kpis ADD COLUMN archived_at TEXT;");
    }
    if (!tableHasColumn(raw, "kpis", "updated_at")) {
      raw.exec("ALTER TABLE kpis ADD COLUMN updated_at TEXT;");
    }

    // Backfill metadata timestamps without disturbing any existing values.
    raw.exec("UPDATE categories SET updated_at = datetime('now') WHERE updated_at IS NULL;");
    raw.exec(
      "UPDATE kpis SET updated_at = COALESCE(created_at, datetime('now')) WHERE updated_at IS NULL;",
    );

    initializeStrategicSchema(raw);
    raw.exec(
      `INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ${SCHEMA_VERSION});`,
    );
    raw.exec("COMMIT;");
  } catch (error) {
    try {
      raw.exec("ROLLBACK;");
    } catch {
      // Surface the migration error.
    }
    throw error;
  }
}

function ensureMetaTable(raw: DatabaseSync): void {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function initializeStrategicSchema(raw: DatabaseSync): void {
  raw.exec(`
    CREATE INDEX IF NOT EXISTS idx_categories_archived_at ON categories(archived_at);
    CREATE INDEX IF NOT EXISTS idx_kpis_archived_at ON kpis(archived_at);

    CREATE TRIGGER IF NOT EXISTS categories_set_updated_at_after_insert
    AFTER INSERT ON categories
    FOR EACH ROW WHEN NEW.updated_at IS NULL
    BEGIN
      UPDATE categories SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS categories_set_updated_at_after_update
    AFTER UPDATE OF slug, name, description, sort_order, archived_at ON categories
    FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
    BEGIN
      UPDATE categories SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS kpis_set_updated_at_after_insert
    AFTER INSERT ON kpis
    FOR EACH ROW WHEN NEW.updated_at IS NULL
    BEGIN
      UPDATE kpis SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS kpis_set_updated_at_after_update
    AFTER UPDATE OF category_id, parent_id, slug, name, unit, unit_type,
      reporting_frequency, direction, description, sort_order, is_active,
      archived_at ON kpis
    FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
    BEGIN
      UPDATE kpis SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TABLE IF NOT EXISTS strategic_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      priority_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      plan_start_year INTEGER NOT NULL DEFAULT 2025
        CHECK (plan_start_year BETWEEN 1900 AND 2100),
      plan_end_year INTEGER NOT NULL DEFAULT 2029
        CHECK (plan_end_year BETWEEN plan_start_year AND 2100),
      completion_rule TEXT NOT NULL DEFAULT 'all_required_kpis'
        CHECK (completion_rule IN ('all_required_kpis','weighted_average','threshold_count','manual_status')),
      threshold_count INTEGER CHECK (threshold_count IS NULL OR threshold_count > 0),
      threshold_percentage REAL
        CHECK (threshold_percentage IS NULL OR (threshold_percentage >= 0 AND threshold_percentage <= 100)),
      manual_status TEXT CHECK (
        manual_status IS NULL OR manual_status IN ('not_started','in_progress','complete')
      ),
      board_level_status TEXT NOT NULL DEFAULT 'not_reported' CHECK (
        board_level_status IN (
          'not_reported','not_started','on_track','at_risk','off_track',
          'complete','exceeded','not_applicable'
        )
      ),
      configuration_status TEXT NOT NULL DEFAULT 'draft'
        CHECK (configuration_status IN ('draft','needs_definition','needs_target','ready','active','archived')),
      unresolved_question TEXT,
      owner TEXT,
      due_date TEXT,
      resolution_notes TEXT,
      source_reference TEXT,
      last_reviewed_date TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_strategic_goals_priority
      ON strategic_goals(priority_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_strategic_goals_configuration
      ON strategic_goals(configuration_status, archived_at);

    CREATE TABLE IF NOT EXISTS goal_kpis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL REFERENCES strategic_goals(id) ON DELETE RESTRICT,
      kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE RESTRICT,
      is_required INTEGER NOT NULL DEFAULT 1 CHECK (is_required IN (0,1)),
      weight REAL NOT NULL DEFAULT 1 CHECK (weight >= 0),
      display_order INTEGER NOT NULL DEFAULT 0,
      effective_from_year INTEGER NOT NULL DEFAULT 2025
        CHECK (effective_from_year BETWEEN 1900 AND 2100),
      effective_to_year INTEGER CHECK (
        effective_to_year IS NULL OR
        (effective_to_year BETWEEN effective_from_year AND 2100)
      ),
      archived_at TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (goal_id, kpi_id, effective_from_year)
    );

    CREATE INDEX IF NOT EXISTS idx_goal_kpis_goal
      ON goal_kpis(goal_id, display_order);
    CREATE INDEX IF NOT EXISTS idx_goal_kpis_kpi ON goal_kpis(kpi_id);

    CREATE TABLE IF NOT EXISTS kpi_measurement_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE RESTRICT,
      effective_from_year INTEGER NOT NULL CHECK (effective_from_year BETWEEN 1900 AND 2100),
      effective_to_year INTEGER CHECK (
        effective_to_year IS NULL OR
        (effective_to_year BETWEEN 1900 AND 2100 AND effective_to_year >= effective_from_year)
      ),
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
      reporting_frequency TEXT CHECK (
        reporting_frequency IS NULL OR reporting_frequency IN (
          'monthly','quarterly','annual','cumulative','one_time','flexible'
        )
      ),
      aggregation_method TEXT CHECK (
        aggregation_method IS NULL OR aggregation_method IN (
          'none','average','weighted_average','sum','ratio','all_complete'
        )
      ),
      board_level_status TEXT,
      calculation_precision INTEGER NOT NULL DEFAULT 1
        CHECK (calculation_precision BETWEEN 0 AND 6),
      configuration_status TEXT NOT NULL DEFAULT 'draft'
        CHECK (configuration_status IN ('draft','needs_definition','needs_target','ready','active','archived')),
      unresolved_question TEXT,
      owner TEXT,
      due_date TEXT,
      resolution_notes TEXT,
      source_reference TEXT,
      last_reviewed_date TEXT,
      allow_score_over_max INTEGER NOT NULL DEFAULT 0
        CHECK (allow_score_over_max IN (0,1)),
      archived_at TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (kpi_id, effective_from_year),
      UNIQUE (id, kpi_id)
    );

    CREATE INDEX IF NOT EXISTS idx_kpi_measurement_configs_effective
      ON kpi_measurement_configs(kpi_id, effective_from_year, effective_to_year);
    CREATE INDEX IF NOT EXISTS idx_kpi_measurement_configs_status
      ON kpi_measurement_configs(configuration_status, archived_at);

    CREATE TABLE IF NOT EXISTS kpi_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE RESTRICT,
      configuration_id INTEGER NOT NULL,
      year INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2100),
      period_type TEXT NOT NULL
        CHECK (period_type IN ('monthly','quarterly','annual','cumulative','one_time')),
      period_index INTEGER NOT NULL,
      scalar_value REAL,
      numerator REAL,
      denominator REAL CHECK (denominator IS NULL OR denominator >= 0),
      respondent_count INTEGER CHECK (respondent_count IS NULL OR respondent_count >= 0),
      total_score REAL CHECK (total_score IS NULL OR total_score >= 0),
      average_score REAL CHECK (average_score IS NULL OR average_score >= 0),
      max_score_per_respondent REAL
        CHECK (max_score_per_respondent IS NULL OR max_score_per_respondent > 0),
      total_possible_score REAL
        CHECK (total_possible_score IS NULL OR total_possible_score >= 0),
      positive_response_count INTEGER
        CHECK (positive_response_count IS NULL OR positive_response_count >= 0),
      total_response_count INTEGER
        CHECK (total_response_count IS NULL OR total_response_count >= 0),
      boolean_value INTEGER CHECK (boolean_value IS NULL OR boolean_value IN (0,1)),
      milestone_value REAL
        CHECK (milestone_value IS NULL OR (milestone_value >= 0 AND milestone_value <= 100)),
      notes TEXT,
      source_reference TEXT,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (
        (period_type = 'monthly' AND period_index BETWEEN 1 AND 12) OR
        (period_type = 'quarterly' AND period_index BETWEEN 1 AND 4) OR
        (period_type IN ('annual','cumulative','one_time') AND period_index = 0)
      ),
      CHECK (
        scalar_value IS NOT NULL OR numerator IS NOT NULL OR denominator IS NOT NULL OR
        respondent_count IS NOT NULL OR total_score IS NOT NULL OR average_score IS NOT NULL OR
        total_possible_score IS NOT NULL OR positive_response_count IS NOT NULL OR
        total_response_count IS NOT NULL OR boolean_value IS NOT NULL OR
        milestone_value IS NOT NULL
      ),
      UNIQUE (kpi_id, configuration_id, year, period_type, period_index),
      FOREIGN KEY (configuration_id, kpi_id)
        REFERENCES kpi_measurement_configs(id, kpi_id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_kpi_observations_period
      ON kpi_observations(kpi_id, year, period_type, period_index);
    CREATE INDEX IF NOT EXISTS idx_kpi_observations_configuration
      ON kpi_observations(configuration_id);

    CREATE TABLE IF NOT EXISTS kpi_components (
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
      aggregation_role TEXT NOT NULL DEFAULT 'value'
        CHECK (aggregation_role IN ('value','numerator','denominator')),
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
      UNIQUE (configuration_id, slug),
      UNIQUE (id, kpi_id),
      FOREIGN KEY (configuration_id, kpi_id)
        REFERENCES kpi_measurement_configs(id, kpi_id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_kpi_components_parent
      ON kpi_components(kpi_id, display_order);
    CREATE INDEX IF NOT EXISTS idx_kpi_components_configuration
      ON kpi_components(configuration_id);

    CREATE TABLE IF NOT EXISTS kpi_component_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      component_id INTEGER NOT NULL REFERENCES kpi_components(id) ON DELETE RESTRICT,
      year INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2100),
      period_type TEXT NOT NULL
        CHECK (period_type IN ('monthly','quarterly','annual','cumulative','one_time')),
      period_index INTEGER NOT NULL,
      scalar_value REAL,
      numerator REAL,
      denominator REAL CHECK (denominator IS NULL OR denominator >= 0),
      respondent_count INTEGER CHECK (respondent_count IS NULL OR respondent_count >= 0),
      total_score REAL CHECK (total_score IS NULL OR total_score >= 0),
      average_score REAL CHECK (average_score IS NULL OR average_score >= 0),
      max_score_per_respondent REAL
        CHECK (max_score_per_respondent IS NULL OR max_score_per_respondent > 0),
      total_possible_score REAL
        CHECK (total_possible_score IS NULL OR total_possible_score >= 0),
      positive_response_count INTEGER
        CHECK (positive_response_count IS NULL OR positive_response_count >= 0),
      total_response_count INTEGER
        CHECK (total_response_count IS NULL OR total_response_count >= 0),
      boolean_value INTEGER CHECK (boolean_value IS NULL OR boolean_value IN (0,1)),
      milestone_value REAL
        CHECK (milestone_value IS NULL OR (milestone_value >= 0 AND milestone_value <= 100)),
      notes TEXT,
      source_reference TEXT,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (
        (period_type = 'monthly' AND period_index BETWEEN 1 AND 12) OR
        (period_type = 'quarterly' AND period_index BETWEEN 1 AND 4) OR
        (period_type IN ('annual','cumulative','one_time') AND period_index = 0)
      ),
      CHECK (
        scalar_value IS NOT NULL OR numerator IS NOT NULL OR denominator IS NOT NULL OR
        respondent_count IS NOT NULL OR total_score IS NOT NULL OR average_score IS NOT NULL OR
        total_possible_score IS NOT NULL OR positive_response_count IS NOT NULL OR
        total_response_count IS NOT NULL OR boolean_value IS NOT NULL OR
        milestone_value IS NOT NULL
      ),
      UNIQUE (component_id, year, period_type, period_index)
    );

    CREATE INDEX IF NOT EXISTS idx_kpi_component_entries_period
      ON kpi_component_entries(component_id, year, period_type, period_index);

    CREATE TABLE IF NOT EXISTS kpi_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kpi_id INTEGER REFERENCES kpis(id) ON DELETE RESTRICT,
      component_id INTEGER REFERENCES kpi_components(id) ON DELETE RESTRICT,
      target_scope TEXT NOT NULL CHECK (target_scope IN ('annual','full_plan')),
      reporting_year INTEGER CHECK (reporting_year IS NULL OR reporting_year BETWEEN 1900 AND 2100),
      target_year INTEGER NOT NULL CHECK (target_year BETWEEN 1900 AND 2100),
      external_target_year INTEGER NOT NULL DEFAULT 0
        CHECK (external_target_year IN (0,1)),
      target_value REAL,
      structured_target_json TEXT,
      target_description TEXT,
      baseline_year INTEGER CHECK (baseline_year IS NULL OR baseline_year BETWEEN 1900 AND 2100),
      baseline_value REAL,
      configuration_status TEXT NOT NULL DEFAULT 'draft'
        CHECK (configuration_status IN ('draft','needs_definition','needs_target','ready','active','archived')),
      source_reference TEXT,
      last_reviewed_date TEXT,
      archived_at TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (
        (kpi_id IS NOT NULL AND component_id IS NULL) OR
        (kpi_id IS NULL AND component_id IS NOT NULL)
      ),
      CHECK (
        (target_scope = 'annual' AND reporting_year IS NOT NULL) OR
        (target_scope = 'full_plan' AND reporting_year IS NULL)
      ),
      CHECK (external_target_year = 1 OR target_year BETWEEN 2025 AND 2029),
      CHECK (baseline_year IS NULL OR baseline_year < target_year)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_targets_kpi_unique
      ON kpi_targets(kpi_id, target_scope, COALESCE(reporting_year, -1), target_year)
      WHERE kpi_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_targets_component_unique
      ON kpi_targets(component_id, target_scope, COALESCE(reporting_year, -1), target_year)
      WHERE component_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_kpi_targets_year
      ON kpi_targets(target_year, reporting_year, configuration_status);

    CREATE TABLE IF NOT EXISTS distribution_bands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE RESTRICT,
      component_id INTEGER,
      slug TEXT NOT NULL,
      label TEXT NOT NULL,
      effective_from_year INTEGER NOT NULL CHECK (effective_from_year BETWEEN 1900 AND 2100),
      effective_to_year INTEGER CHECK (
        effective_to_year IS NULL OR
        (effective_to_year BETWEEN 1900 AND 2100 AND effective_to_year >= effective_from_year)
      ),
      display_order INTEGER NOT NULL DEFAULT 0,
      is_unknown INTEGER NOT NULL DEFAULT 0 CHECK (is_unknown IN (0,1)),
      is_declined INTEGER NOT NULL DEFAULT 0 CHECK (is_declined IN (0,1)),
      derived_group TEXT CHECK (
        derived_group IS NULL OR derived_group IN ('white','non_white')
      ),
      archived_at TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (component_id, kpi_id)
        REFERENCES kpi_components(id, kpi_id) ON DELETE RESTRICT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_distribution_bands_kpi_unique
      ON distribution_bands(kpi_id, slug, effective_from_year)
      WHERE component_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_distribution_bands_component_unique
      ON distribution_bands(component_id, slug, effective_from_year)
      WHERE component_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_distribution_bands_order
      ON distribution_bands(kpi_id, component_id, display_order);

    CREATE TABLE IF NOT EXISTS distribution_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE RESTRICT,
      component_id INTEGER,
      configuration_id INTEGER NOT NULL,
      year INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2100),
      period_type TEXT NOT NULL
        CHECK (period_type IN ('monthly','quarterly','annual','cumulative','one_time')),
      period_index INTEGER NOT NULL,
      respondent_count INTEGER NOT NULL CHECK (respondent_count >= 0),
      categories_mutually_exclusive INTEGER NOT NULL DEFAULT 1
        CHECK (categories_mutually_exclusive IN (0,1)),
      notes TEXT,
      source_reference TEXT,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (
        (period_type = 'monthly' AND period_index BETWEEN 1 AND 12) OR
        (period_type = 'quarterly' AND period_index BETWEEN 1 AND 4) OR
        (period_type IN ('annual','cumulative','one_time') AND period_index = 0)
      ),
      FOREIGN KEY (component_id, kpi_id)
        REFERENCES kpi_components(id, kpi_id) ON DELETE RESTRICT,
      FOREIGN KEY (configuration_id, kpi_id)
        REFERENCES kpi_measurement_configs(id, kpi_id) ON DELETE RESTRICT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_distribution_observations_kpi_unique
      ON distribution_observations(kpi_id, year, period_type, period_index)
      WHERE component_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_distribution_observations_component_unique
      ON distribution_observations(component_id, year, period_type, period_index)
      WHERE component_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_distribution_observations_configuration
      ON distribution_observations(configuration_id);

    CREATE TABLE IF NOT EXISTS distribution_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      observation_id INTEGER NOT NULL
        REFERENCES distribution_observations(id) ON DELETE RESTRICT,
      band_id INTEGER NOT NULL REFERENCES distribution_bands(id) ON DELETE RESTRICT,
      band_label_snapshot TEXT NOT NULL,
      category_count INTEGER NOT NULL CHECK (category_count >= 0),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (observation_id, band_id)
    );

    CREATE INDEX IF NOT EXISTS idx_distribution_values_observation
      ON distribution_values(observation_id);
    CREATE INDEX IF NOT EXISTS idx_distribution_values_band
      ON distribution_values(band_id);

    CREATE TABLE IF NOT EXISTS strategic_audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL CHECK (entity_type IN (
        'strategic_priority','strategic_goal','goal_membership','kpi',
        'measurement_config','observation','target','component','distribution',
        'distribution_category','distribution_value','priority','goal','goal_kpi',
        'kpi_config','kpi_observation','kpi_component','kpi_component_entry',
        'kpi_target','distribution_band','distribution_observation'
      )),
      entity_id INTEGER NOT NULL,
      event_type TEXT NOT NULL
        CHECK (event_type IN ('create','update','archive','restore','delete','status_change')),
      entity_display_name TEXT NOT NULL,
      parent_priority_name TEXT,
      parent_goal_name TEXT,
      previous_value_json TEXT,
      new_value_json TEXT,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_email_snapshot TEXT,
      source_reference TEXT,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_strategic_audit_entity
      ON strategic_audit_events(entity_type, entity_id, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_strategic_audit_occurred
      ON strategic_audit_events(occurred_at, id);
    CREATE INDEX IF NOT EXISTS idx_strategic_audit_actor
      ON strategic_audit_events(actor_id, occurred_at);
  `);
}

function initializeSchema(raw: DatabaseSync): void {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS kpis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      parent_id INTEGER REFERENCES kpis(id) ON DELETE CASCADE,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT '',
      unit_type TEXT NOT NULL DEFAULT 'count'
        CHECK (unit_type IN ('count','percent','currency','attendance','note','breakdown')),
      reporting_frequency TEXT NOT NULL DEFAULT 'monthly'
        CHECK (reporting_frequency IN ('monthly','annual','flexible')),
      direction TEXT NOT NULL DEFAULT 'higher'
        CHECK (direction IN ('higher','lower','neutral')),
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      archived_at TEXT,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_kpis_category ON kpis(category_id);
    CREATE INDEX IF NOT EXISTS idx_kpis_parent ON kpis(parent_id);

    CREATE TABLE IF NOT EXISTS monthly_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL CHECK (month BETWEEN 0 AND 12),
      value REAL NOT NULL,
      notes TEXT,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (kpi_id, year, month)
    );

    CREATE INDEX IF NOT EXISTS idx_entries_kpi_year ON monthly_entries(kpi_id, year);

    CREATE TABLE IF NOT EXISTS breakdown_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL DEFAULT 0 CHECK (month BETWEEN 0 AND 12),
      label TEXT NOT NULL,
      value REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (kpi_id, year, month, label)
    );

    CREATE INDEX IF NOT EXISTS idx_breakdown_kpi_year ON breakdown_entries(kpi_id, year);
    CREATE INDEX IF NOT EXISTS idx_breakdown_kpi_year_month ON breakdown_entries(kpi_id, year, month);

    -- Audit trail for KPI admin actions. One row per change (create / update /
    -- delete) on monthly_entries and breakdown_entries. prev_value / new_value
    -- capture the before / after so admins can audit or undo a bad write.
    -- entry_id and entry_type refer to the source table — entry_id may refer
    -- to a row that no longer exists after a delete (NULL new_value) or after
    -- a schema bump (the table is dropped). The history itself is durable.
    --
    -- D8AD-CAN-005: the snapshot columns (kpi_name/slug/unit, category_id/
    -- name/slug, changed_by_email) are captured from the CURRENT metadata at
    -- the moment the change is recorded, and are immutable thereafter. They
    -- let listEntryHistory render a history event even after the referenced
    -- KPI/category/user has been deleted or renamed, using LEFT JOINs to the
    -- live tables for the *current* name (nullable) while the snapshot stays
    -- the authoritative historical label. NULL snapshots mark a row whose
    -- metadata was already gone when the snapshot would have been taken
    -- (legacy rows migrated from v4 whose KPI had already been deleted) —
    -- that NULL is the "deleted metadata" tombstone.
    CREATE TABLE IF NOT EXISTS entry_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_type TEXT NOT NULL CHECK (entry_type IN ('monthly','breakdown')),
      entry_id INTEGER,
      kpi_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month_or_label TEXT NOT NULL,
      prev_value REAL,
      new_value REAL,
      prev_notes TEXT,
      new_notes TEXT,
      changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      changed_at TEXT NOT NULL DEFAULT (datetime('now')),
      kpi_name TEXT,
      kpi_slug TEXT,
      kpi_unit TEXT,
      category_id INTEGER,
      category_name TEXT,
      category_slug TEXT,
      changed_by_email TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_history_kpi_year ON entry_history(kpi_id, year);
    CREATE INDEX IF NOT EXISTS idx_history_changed_at ON entry_history(changed_at);
    CREATE INDEX IF NOT EXISTS idx_history_category ON entry_history(category_id);

    -- KPI goals: a per-KPI target that drives dashboard progress indicators.
    -- Each KPI can have at most one active goal per year.
    -- type: 'pct' = percentage-based target (target_value as percentage points,
    --   e.g. 20 means "20% more than baseline");
    --       'number' = absolute target (target_value as raw delta, e.g. 3 means "3 more than baseline").
    -- enabled: 0/1 toggle — goals can be saved but deactivated without deletion.
    CREATE TABLE IF NOT EXISTS kpi_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
      target_year INTEGER NOT NULL,
      baseline_year INTEGER NOT NULL CHECK (baseline_year < target_year),
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

    CREATE INDEX IF NOT EXISTS idx_kpi_goals_kpi ON kpi_goals(kpi_id);
    CREATE INDEX IF NOT EXISTS idx_kpi_goals_year ON kpi_goals(target_year);
  `);
  initializeStrategicSchema(raw);
}

/** Reset connection — useful when env changes during dev hot reload. */
export function resetDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/**
 * Run `fn` inside a SQLite transaction. Commits on normal return, rolls back
 * on any thrown error. Use this for any sequence of writes that must be
 * atomic — e.g. an upsert + audit history insert, where a torn write would
 * silently produce an audit row that does not describe the actual change.
 *
 * Supports nested calls: an inner transaction opens a SAVEPOINT instead of
 * a top-level BEGIN, and the outer transaction's COMMIT (or ROLLBACK)
 * resolves the whole stack. This lets callers compose transactional
 * helpers (e.g. `upsertEntry`) inside a larger unit of work without
 * hitting `cannot start a transaction within a transaction`.
 *
 * Synchronous only: `fn` must be a sync function. If `fn` returns a
 * Promise the COMMIT runs *immediately* after the synchronous return,
 * before any awaited work in `fn` has completed — which would commit
 * a half-finished transaction. None of the current callers use async
 * `fn`, but the constraint is worth documenting so a future caller
 * doesn't introduce a silent torn-write bug.
 */
export function transaction<T>(fn: () => T): T {
  const db = getDb();
  const txDb = db as unknown as DB & { __txStack?: number[] };
  const stack = txDb.__txStack ?? (txDb.__txStack = []);
  const myDepth = stack.length; // 0 = outermost, 1+ = nested savepoint
  const savepoint = `sp_${myDepth}`;
  if (myDepth === 0) {
    db.exec("BEGIN");
  } else {
    db.exec(`SAVEPOINT ${savepoint}`);
  }
  stack.push(myDepth);
  try {
    const result = fn();
    if (myDepth === 0) {
      db.exec("COMMIT");
    } else {
      db.exec(`RELEASE SAVEPOINT ${savepoint}`);
    }
    return result;
  } catch (err) {
    try {
      if (myDepth === 0) {
        db.exec("ROLLBACK");
      } else {
        db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        db.exec(`RELEASE SAVEPOINT ${savepoint}`);
      }
    } catch {
      // Best-effort: surface the original error.
    }
    throw err;
  } finally {
    const popped = stack.pop();
    if (popped !== myDepth) {
      const idx = stack.lastIndexOf(myDepth);
      if (idx >= 0) stack.splice(idx, 1);
    }
    if (stack.length === 0) {
      delete txDb.__txStack;
    }
  }
}
