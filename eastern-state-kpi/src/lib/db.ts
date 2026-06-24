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
  pragma?(source: string): unknown;
}

interface StatementLike {
  all(...params: unknown[]): Record<string, unknown>[];
  get(...params: unknown[]): Record<string, unknown> | undefined;
  run(...params: unknown[]): RunResult;
}

let _db: DB | null = null;

function resolveDbPath(): string {
  const fromEnv = process.env.DATABASE_PATH;
  if (fromEnv) return fromEnv;
  // Default: <projectRoot>/data/kpi.db
  return path.resolve(process.cwd(), "data", "kpi.db");
}

/**
 * Wrap a node:sqlite DatabaseSync so that:
 *  - `lastInsertRowid` is always a Number (node:sqlite returns BigInt for some versions).
 *  - `.all(...)` rows are plain objects (not null-prototype), so JSON serialization and
 *    property access match the better-sqlite3 ergonomics we depend on.
 *
 * The underlying StatementSync types from node:sqlite are loose — we re-cast to keep
 * our call sites clean.
 */
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
  // node:sqlite has WAL too, but pragma syntax is identical.
  try {
    raw.exec("PRAGMA journal_mode = WAL;");
    raw.exec("PRAGMA foreign_keys = ON;");
  } catch {
    // Some sandbox environments disallow pragmas; ignore.
  }
  initializeSchema(raw);
  _db = wrapDatabase(raw);
  return _db;
}

function initializeSchema(raw: DatabaseSync): void {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','viewer')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

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
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT '',
      format TEXT NOT NULL DEFAULT 'number' CHECK (format IN ('number','currency','percent')),
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_kpis_category ON kpis(category_id);

    CREATE TABLE IF NOT EXISTS monthly_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
      value REAL NOT NULL,
      notes TEXT,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (kpi_id, year, month)
    );

    CREATE INDEX IF NOT EXISTS idx_entries_kpi_year ON monthly_entries(kpi_id, year);
  `);
}

/** Reset connection — useful when env changes during dev hot reload. */
export function resetDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}