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
    return;
  }

  // v8 → v9 is additive. Goals now carry an explicit, fixed baseline year so
  // multi-year strategic targets (for example, a 2029 target based on 2026
  // actuals) do not depend on nonexistent target_year - 1 data. Existing
  // goals freeze the latest available actual year before their target.
  if (version === 8) {
    migrateGoalBaselineYear(raw);
    initializeSchema(raw);
    raw.exec(
      `INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ${SCHEMA_VERSION});`,
    );
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

function ensureMetaTable(raw: DatabaseSync): void {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function initializeSchema(raw: DatabaseSync): void {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
