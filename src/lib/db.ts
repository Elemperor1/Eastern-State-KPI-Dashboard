import { DatabaseSync, type StatementSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

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
const SCHEMA_VERSION = 3;

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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
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
  // Schema changed (or fresh): drop KPI data tables and recreate cleanly.
  // Users are preserved; the seed script repopulates metrics + entries.
  raw.exec("DROP TABLE IF EXISTS breakdown_entries;");
  raw.exec("DROP TABLE IF EXISTS monthly_entries;");
  raw.exec("DROP TABLE IF EXISTS kpis;");
  raw.exec("DROP TABLE IF EXISTS categories;");
  initializeSchema(raw);
  raw.exec(`INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ${SCHEMA_VERSION});`);
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
      label TEXT NOT NULL,
      value REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (kpi_id, year, label)
    );

    CREATE INDEX IF NOT EXISTS idx_breakdown_kpi_year ON breakdown_entries(kpi_id, year);
  `);
}

/** Reset connection — useful when env changes during dev hot reload. */
export function resetDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
