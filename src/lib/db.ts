import { DatabaseSync, type StatementSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import schemaVersionConfig from "./schema-version.json";

interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface DB {
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

/**
 * Bounded lock-wait for the main application connection (DB-002). Without an
 * explicit busy_timeout, node:sqlite gives up on a contended write
 * immediately (SQLITE_BUSY), so a single overlapping writer (an operator
 * migration, a backup, or a checkpoint) would surface as request failures.
 * Five seconds is long enough to ride out a short competing write and short
 * enough that a genuinely wedged database still fails fast instead of
 * queueing requests indefinitely. The readiness probe keeps its own, much
 * shorter 250 ms budget (src/features/health/readiness-core.mjs).
 */
export const DB_BUSY_TIMEOUT_MS = 5_000;

interface ConnectionPragmaDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    get(): Record<string, unknown> | undefined;
  };
  close(): void;
}

/**
 * Configures the SQLite connection pragmas before any schema work begins.
 *
 * Exported so the fail-closed foreign-key invariant can be tested with a
 * deterministic connection double instead of depending on host SQLite
 * failures that are difficult to induce portably.
 */
export function configureConnectionPragmas(
  raw: ConnectionPragmaDatabase,
): void {
  try {
    raw.exec("PRAGMA journal_mode = WAL;");
  } catch {
    // WAL is a performance/durability preference. Some read-only or
    // restricted environments refuse it, so it must not suppress the
    // mandatory foreign-key policy below.
  }
  try {
    // Belt and braces with the DatabaseSync `timeout` option used by getDb:
    // this pragma is the introspectable SQLite-native setting (DB-002).
    raw.exec(`PRAGMA busy_timeout = ${DB_BUSY_TIMEOUT_MS};`);
  } catch {
    // The constructor timeout remains active when this tuning pragma is
    // unavailable. Foreign-key enforcement is still mandatory below.
  }

  try {
    raw.exec("PRAGMA foreign_keys = ON;");
    const row = raw.prepare("PRAGMA foreign_keys").get();
    const foreignKeysEnabled = Number(
      row?.foreign_keys ?? Object.values(row ?? {})[0] ?? 0,
    );
    if (foreignKeysEnabled !== 1) {
      throw new Error("SQLite did not enable foreign-key enforcement.");
    }
  } catch (cause) {
    try {
      raw.close();
    } catch {
      // Preserve the policy failure: this handle is rejected and never
      // published even if the host also refuses the close operation.
    }
    throw new Error(
      "SQLite foreign-key enforcement could not be enabled; refusing to open the application database.",
      { cause },
    );
  }
}

/**
 * Resolves the application database path.
 *
 * Empty DATABASE_PATH values intentionally use the repository-local default,
 * matching the long-standing getDb() contract. Operator scripts import this
 * helper so their probes and readiness markers cannot target a different
 * SQLite file from the application migration boundary.
 */
export function resolveDbPath(): string {
  const fromEnv = process.env.DATABASE_PATH;
  if (fromEnv) return fromEnv;
  return path.resolve(process.cwd(), "data", "kpi.db");
}

/** Implements the wrap database operation. */
function wrapDatabase(raw: DatabaseSync): DB {
  const db = raw as unknown as {
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  };
  return {
    /** Implements the exec operation. */
    exec: (sql: string) => db.exec(sql),
    /** Implements the prepare operation. */
    prepare: (sql: string): StatementLike => {
      const stmt = db.prepare(sql);
      const wrapped = stmt as unknown as {
        all(...params: unknown[]): Record<string, unknown>[];
        get(...params: unknown[]): Record<string, unknown> | undefined;
        run(...params: unknown[]): RunResult;
      };
      return {
        /** Implements the all operation. */
        all(...params: unknown[]): Record<string, unknown>[] {
          const rows = wrapped.all(...params);
          return rows.map((r) => ({ ...r }));
        },
        /** Retrieves the requested data. */
        get(...params: unknown[]): Record<string, unknown> | undefined {
          const row = wrapped.get(...params);
          return row ? { ...row } : undefined;
        },
        /** Runs the run workflow. */
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
    /** Implements the close operation. */
    close: () => raw.close(),
  };
}

/** Retrieves db. */
export function getDb(): DB {
  if (_db) return _db;
  const dbPath = resolveDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const raw = new DatabaseSync(dbPath, { timeout: DB_BUSY_TIMEOUT_MS });
  configureConnectionPragmas(raw);
  try {
    migrateSchema(raw);
    reconcileInterruptedPlanActivation(raw);
  } catch (error) {
    // Do not leak an open handle when migration refuses the database (for
    // example a schema written by a newer release); the next getDb() retry
    // must start from a clean slate. Preserve the migration failure if the
    // rejected handle also refuses cleanup.
    try {
      raw.close();
    } catch {
      // The migration error is the actionable root cause.
    }
    throw error;
  }
  _db = wrapDatabase(raw);
  return _db;
}

/**
 * Reconciles a process interruption at the durable activation checkpoints.
 *
 * A clearly pre-commit operation is closed and saving is reopened. A clearly
 * committed transition is verified forward and finalized. Every ambiguous
 * combination remains paused and marks integrity blocked; startup never
 * guesses, rolls a committed transition back, or silently reopens writes.
 */
function reconcileInterruptedPlanActivation(raw: DatabaseSync): void {
  const table = raw.prepare(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name = 'plan_activation_operations'`,
  ).get();
  if (!table) return;
  const pending = raw.prepare(
    `SELECT * FROM plan_activation_operations
     WHERE phase IN (
       'pausing','backup_verified','committed_unverified',
       'verification_failed','integrity_incident'
     )
     ORDER BY requested_at, activation_id`,
  ).all() as Array<Record<string, unknown>>;
  const totalPlans = Number(
    (raw.prepare("SELECT COUNT(*) AS count FROM strategic_plans").get() as { count: number }).count,
  );
  const activeCount = Number(
    (raw.prepare(
      "SELECT COUNT(*) AS count FROM strategic_plans WHERE lifecycle_state = 'active' AND archived_at IS NULL",
    ).get() as { count: number }).count,
  );
  if (pending.length === 0) {
    if (totalPlans > 0 && activeCount !== 1) {
      raw.exec(`
        INSERT OR REPLACE INTO meta (key, value)
          VALUES ('plan_activation_write_pause', '1');
        INSERT OR REPLACE INTO meta (key, value)
          VALUES ('plan_activation_internal_write', '0');
        INSERT OR REPLACE INTO meta (key, value)
          VALUES ('active_plan_integrity_blocked', '1');
      `);
    }
    return;
  }

  raw.exec("BEGIN IMMEDIATE;");
  try {
    raw.exec(
      `INSERT OR REPLACE INTO meta (key, value)
         VALUES ('plan_activation_internal_write', '1')`,
    );
    if (pending.length !== 1) {
      raw.exec(`
        INSERT OR REPLACE INTO meta (key, value)
          VALUES ('plan_activation_write_pause', '1');
        INSERT OR REPLACE INTO meta (key, value)
          VALUES ('active_plan_integrity_blocked', '1');
        INSERT OR REPLACE INTO meta (key, value)
          VALUES ('plan_activation_internal_write', '0');
      `);
      raw.exec("COMMIT;");
      return;
    }
    const operation = pending[0];
    const activationId = String(operation.activation_id);
    const predecessorPlanId = Number(operation.predecessor_plan_id);
    const successorPlanId = Number(operation.successor_plan_id);
    const phase = String(operation.phase);
    const states = raw.prepare(
      `SELECT id, lifecycle_state, status, archived_at, activation_id
       FROM strategic_plans WHERE id IN (?, ?)`,
    ).all(predecessorPlanId, successorPlanId) as Array<Record<string, unknown>>;
    const predecessor = states.find((row) => Number(row.id) === predecessorPlanId);
    const successor = states.find((row) => Number(row.id) === successorPlanId);
    const preCommit =
      ["pausing", "backup_verified"].includes(phase) &&
      predecessor?.lifecycle_state === "active" &&
      predecessor.status === "active" &&
      successor?.lifecycle_state === "draft" &&
      successor.status === "draft" &&
      activeCount === 1;
    const lifecycleEventCount = Number(
      (raw.prepare(
        `SELECT COUNT(*) AS count
         FROM strategic_plan_lifecycle_events
         WHERE activation_id = ? AND action IN ('archive','activate')`,
      ).get(activationId) as { count: number }).count,
    );
    const boardScope = raw.prepare(
      "SELECT id FROM board_reporting_scopes WHERE plan_id = ?",
    ).get(successorPlanId);
    const foreignKeyClean = raw.prepare("PRAGMA foreign_key_check").all().length === 0;
    const committed =
      phase === "committed_unverified" &&
      predecessor?.lifecycle_state === "archived" &&
      predecessor.status === "archived" &&
      predecessor.archived_at !== null &&
      successor?.lifecycle_state === "active" &&
      successor.status === "active" &&
      successor.activation_id === activationId &&
      activeCount === 1 &&
      lifecycleEventCount === 2 &&
      Boolean(boardScope) &&
      foreignKeyClean;
    if (preCommit) {
      raw.prepare(
        `UPDATE plan_activation_operations
         SET phase = 'failed_precommit', failure_code = 'restart_before_commit',
             updated_at = datetime('now')
         WHERE activation_id = ?`,
      ).run(activationId);
      raw.prepare(
        `INSERT INTO activation_recovery_audit_events (
           recovery_id, activation_id, backup_id, action, operator_snapshot,
           integrity_result, details_json
         ) VALUES (?, ?, ?, 'reopen_service', 'Automatic startup reconciliation',
                   'verified_precommit_unchanged', ?)`,
      ).run(
        `startup-${activationId}-precommit`,
        activationId,
        String(operation.backup_id ?? "no-backup-created"),
        JSON.stringify({ phase, predecessorPlanId, successorPlanId }),
      );
      raw.exec(`
        INSERT OR REPLACE INTO meta (key, value)
          VALUES ('plan_activation_write_pause', '0');
        INSERT OR REPLACE INTO meta (key, value)
          VALUES ('active_plan_integrity_blocked', '0');
      `);
    } else if (committed) {
      raw.prepare(
        `UPDATE plan_activation_operations
         SET phase = 'verified', verified_at = COALESCE(verified_at, datetime('now')),
             failure_code = NULL, updated_at = datetime('now')
         WHERE activation_id = ?`,
      ).run(activationId);
      raw.prepare(
        `INSERT INTO activation_recovery_audit_events (
           recovery_id, activation_id, backup_id, action, operator_snapshot,
           integrity_result, details_json
         ) VALUES (?, ?, ?, 'repair_forward', 'Automatic startup reconciliation',
                   'verified_committed_transition', ?)`,
      ).run(
        `startup-${activationId}-forward`,
        activationId,
        String(operation.backup_id ?? "unknown-backup"),
        JSON.stringify({ phase, predecessorPlanId, successorPlanId }),
      );
      raw.prepare(
        `INSERT OR IGNORE INTO strategic_plan_lifecycle_events (
           event_id, plan_id, predecessor_plan_id, action, before_state,
           after_state, checked_plan_revision, checked_predecessor_revision,
           confirmation_text, result_json, activation_id
         ) VALUES (?, ?, ?, 'activation_recovered', 'active', 'active',
                   ?, NULL, NULL, ?, ?)`,
      ).run(
        `startup-recovered-${activationId}`,
        successorPlanId,
        predecessorPlanId,
        Number(operation.requested_revision),
        JSON.stringify({ automatic: true, verified_forward: true }),
        activationId,
      );
      raw.exec(`
        INSERT OR REPLACE INTO meta (key, value)
          VALUES ('plan_activation_write_pause', '0');
        INSERT OR REPLACE INTO meta (key, value)
          VALUES ('active_plan_integrity_blocked', '0');
      `);
    } else if (
      phase === "verification_failed" ||
      phase === "integrity_incident"
    ) {
      raw.exec(`
        INSERT OR REPLACE INTO meta (key, value)
          VALUES ('plan_activation_write_pause', '1');
        INSERT OR REPLACE INTO meta (key, value)
          VALUES ('active_plan_integrity_blocked', '1');
      `);
    } else {
      raw.prepare(
        `UPDATE plan_activation_operations
         SET phase = 'integrity_incident',
             failure_code = 'ambiguous_restart_state',
             updated_at = datetime('now')
         WHERE activation_id = ?`,
      ).run(activationId);
      raw.exec(`
        INSERT OR REPLACE INTO meta (key, value)
          VALUES ('plan_activation_write_pause', '1');
        INSERT OR REPLACE INTO meta (key, value)
          VALUES ('active_plan_integrity_blocked', '1');
      `);
    }
    raw.exec(
      `INSERT OR REPLACE INTO meta (key, value)
         VALUES ('plan_activation_internal_write', '0')`,
    );
    raw.exec("COMMIT;");
  } catch (error) {
    try {
      raw.exec("ROLLBACK;");
    } catch {
      // Preserve the reconciliation failure.
    }
    try {
      raw.exec(`
        INSERT OR REPLACE INTO meta (key, value)
          VALUES ('plan_activation_write_pause', '1');
        INSERT OR REPLACE INTO meta (key, value)
          VALUES ('plan_activation_internal_write', '0');
        INSERT OR REPLACE INTO meta (key, value)
          VALUES ('active_plan_integrity_blocked', '1');
      `);
    } catch {
      // Opening the application will fail below; do not mask the root cause.
    }
    throw error;
  }
}

/** Users table is stable and never reset by version bumps. */
function ensureUsersTable(raw: DatabaseSync): void {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','viewer','board')),
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
  ensureBoardUserRole(raw);
}

/**
 * Schema 13 widens the durable user-role check without changing user ids,
 * credentials, revocation watermarks, or any referencing audit rows.
 */
function ensureBoardUserRole(raw: DatabaseSync): void {
  const table = raw.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'",
  ).get() as { sql?: string } | undefined;
  if (table?.sql?.includes("'board'")) return;

  const foreignKeysEnabled = Number(
    (raw.prepare("PRAGMA foreign_keys").get() as { foreign_keys?: number } | undefined)
      ?.foreign_keys ?? 0,
  ) === 1;
  if (foreignKeysEnabled) raw.exec("PRAGMA foreign_keys = OFF;");
  try {
    raw.exec("BEGIN IMMEDIATE;");
    try {
      raw.exec(`
        CREATE TABLE users_v13 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('admin','viewer','board')),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          must_change_password INTEGER NOT NULL DEFAULT 0,
          disabled INTEGER NOT NULL DEFAULT 0,
          sessions_valid_after INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO users_v13 (
          id, email, name, password_hash, role, created_at,
          must_change_password, disabled, sessions_valid_after
        )
        SELECT id, email, name, password_hash, role, created_at,
               must_change_password, disabled, sessions_valid_after
        FROM users;
        DROP TABLE users;
        ALTER TABLE users_v13 RENAME TO users;
      `);
      const violations = raw.prepare("PRAGMA foreign_key_check").all();
      if (violations.length > 0) {
        throw new Error(
          `Schema 13 Board-role migration produced ${violations.length} foreign-key violation(s).`,
        );
      }
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

/** Records completion of the role-only schema-13 migration. */
function recordSchemaV13(raw: DatabaseSync): void {
  raw.exec(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '13');",
  );
}

/** Creates the schema-14 database-authoritative Board reporting model. */
function initializeBoardReportingSchema(raw: DatabaseSync): void {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS board_reporting_scopes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL UNIQUE
        REFERENCES strategic_plans(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS board_reporting_priorities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope_id INTEGER NOT NULL
        REFERENCES board_reporting_scopes(id) ON DELETE CASCADE,
      priority_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      display_title TEXT NOT NULL CHECK (length(trim(display_title)) BETWEEN 1 AND 240),
      display_order INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (scope_id, priority_id)
    );

    CREATE INDEX IF NOT EXISTS idx_board_reporting_priorities_scope
      ON board_reporting_priorities(scope_id, display_order, id);

    CREATE TABLE IF NOT EXISTS board_reporting_statements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_priority_id INTEGER NOT NULL
        REFERENCES board_reporting_priorities(id) ON DELETE CASCADE,
      statement_text TEXT NOT NULL
        CHECK (length(trim(statement_text)) BETWEEN 1 AND 1000),
      display_order INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_board_reporting_statements_priority
      ON board_reporting_statements(board_priority_id, display_order, id);

    CREATE TABLE IF NOT EXISTS board_reporting_statement_kpis (
      statement_id INTEGER NOT NULL
        REFERENCES board_reporting_statements(id) ON DELETE CASCADE,
      kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE RESTRICT,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (statement_id, kpi_id)
    );

    CREATE INDEX IF NOT EXISTS idx_board_reporting_statement_kpis_kpi
      ON board_reporting_statement_kpis(kpi_id, statement_id);

    CREATE TABLE IF NOT EXISTS board_reporting_audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope_id INTEGER NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('create','update')),
      previous_value_json TEXT,
      new_value_json TEXT NOT NULL,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_email_snapshot TEXT,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_board_reporting_audit_occurred
      ON board_reporting_audit_events(occurred_at, id);

    INSERT OR IGNORE INTO meta (key, value)
      VALUES ('board_reporting_scope_initialized', '0');
  `);
}

/**
 * Applies the additive schema-14 Board reporting migration. The DDL, the
 * one-time bootstrap marker, and the version record commit or roll back as
 * one unit (lane_sqlite carryover): a fault mid-step must leave the
 * database exactly at schema 13 so the next startup retries cleanly.
 */
function migrateBoardReportingSchemaV14(raw: DatabaseSync): void {
  raw.exec("BEGIN IMMEDIATE;");
  try {
    initializeBoardReportingSchema(raw);
    raw.exec(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '14');",
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
 * Creates the schema-15 immutable user lifecycle audit log. Every account
 * creation, password reset/change, role change, disable/enable, and deletion
 * writes one row here inside the same transaction as the mutation it
 * describes, so no administrative account change can happen silently.
 * Password hashes are never stored; events carry only non-secret snapshots.
 *
 * `subject_user_id` deliberately has NO foreign key: deletion events must
 * keep pointing at the (now removed) account id, and removing a user must
 * never cascade into or null out the audit trail that recorded it. The
 * subject's email/name/role are snapshotted onto the event for the same
 * reason.
 */
function initializeUserLifecycleAuditSchema(raw: DatabaseSync): void {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS user_lifecycle_audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_user_id INTEGER,
      subject_email_snapshot TEXT NOT NULL,
      subject_name_snapshot TEXT NOT NULL,
      subject_role_snapshot TEXT,
      event_type TEXT NOT NULL CHECK (event_type IN (
        'create','password_reset','password_change',
        'role_change','disable','enable','delete'
      )),
      previous_value_json TEXT,
      new_value_json TEXT,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_email_snapshot TEXT,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_user_lifecycle_audit_subject
      ON user_lifecycle_audit_events(subject_user_id, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_user_lifecycle_audit_occurred
      ON user_lifecycle_audit_events(occurred_at, id);
    CREATE INDEX IF NOT EXISTS idx_user_lifecycle_audit_actor
      ON user_lifecycle_audit_events(actor_id, occurred_at);
  `);
}

/**
 * Applies the additive schema-14 -> schema-15 user lifecycle audit step.
 * Same atomicity contract as the v13 -> v14 step above: the audit-log DDL
 * and the version record commit or roll back together.
 */
function migrateUserLifecycleAuditSchemaV15(raw: DatabaseSync): void {
  raw.exec("BEGIN IMMEDIATE;");
  try {
    initializeUserLifecycleAuditSchema(raw);
    raw.exec(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '15');",
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
 * Creates the schema-16 Successor Strategic Plan lifecycle model.
 *
 * The migration deliberately adds lifecycle metadata and immutable evidence
 * beside the existing plan-owned records. Existing ids, content, results,
 * Board scope, and audit rows are never rewritten or re-keyed. The sole
 * backfill mirrors each existing plan's already-authoritative `status` into
 * `lifecycle_state`; it does not invent a predecessor or create a Draft.
 */
function initializePlanLifecycleSchema(raw: DatabaseSync): void {
  if (!tableHasColumn(raw, "strategic_plans", "lifecycle_state")) {
    raw.exec(
      `ALTER TABLE strategic_plans
       ADD COLUMN lifecycle_state TEXT NOT NULL DEFAULT 'draft'
       CHECK (lifecycle_state IN ('draft','active','archived','cancelled'))`,
    );
    raw.exec(
      `UPDATE strategic_plans
       SET lifecycle_state = status
       WHERE lifecycle_state <> status`,
    );
  }
  if (!tableHasColumn(raw, "strategic_plans", "predecessor_plan_id")) {
    raw.exec(
      `ALTER TABLE strategic_plans
       ADD COLUMN predecessor_plan_id INTEGER
       REFERENCES strategic_plans(id) ON DELETE RESTRICT`,
    );
  }
  if (!tableHasColumn(raw, "strategic_plans", "creation_method")) {
    raw.exec(
      `ALTER TABLE strategic_plans
       ADD COLUMN creation_method TEXT NOT NULL DEFAULT 'original'
       CHECK (creation_method IN ('original','blank','structural_clone'))`,
    );
  }
  if (!tableHasColumn(raw, "strategic_plans", "whole_plan_revision")) {
    raw.exec(
      `ALTER TABLE strategic_plans
       ADD COLUMN whole_plan_revision INTEGER NOT NULL DEFAULT 1
       CHECK (whole_plan_revision > 0)`,
    );
  }
  if (!tableHasColumn(raw, "strategic_plans", "clone_source_revision")) {
    raw.exec(
      "ALTER TABLE strategic_plans ADD COLUMN clone_source_revision INTEGER",
    );
  }
  if (!tableHasColumn(raw, "strategic_plans", "approval_source")) {
    raw.exec(
      "ALTER TABLE strategic_plans ADD COLUMN approval_source TEXT",
    );
  }
  if (!tableHasColumn(raw, "strategic_plans", "source_changed_at")) {
    raw.exec(
      "ALTER TABLE strategic_plans ADD COLUMN source_changed_at TEXT",
    );
  }
  if (!tableHasColumn(raw, "strategic_plans", "cancelled_at")) {
    raw.exec(
      "ALTER TABLE strategic_plans ADD COLUMN cancelled_at TEXT",
    );
  }
  if (!tableHasColumn(raw, "strategic_plans", "activated_at")) {
    raw.exec(
      "ALTER TABLE strategic_plans ADD COLUMN activated_at TEXT",
    );
  }
  if (!tableHasColumn(raw, "strategic_plans", "activation_id")) {
    raw.exec(
      "ALTER TABLE strategic_plans ADD COLUMN activation_id TEXT",
    );
  }

  if (!tableHasColumn(raw, "board_reporting_scopes", "review_status")) {
    raw.exec(
      `ALTER TABLE board_reporting_scopes
       ADD COLUMN review_status TEXT NOT NULL DEFAULT 'approved'
       CHECK (review_status IN ('needs_review','approved','intentional_empty'))`,
    );
  }
  if (!tableHasColumn(raw, "board_reporting_scopes", "reviewed_by")) {
    raw.exec(
      `ALTER TABLE board_reporting_scopes
       ADD COLUMN reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL`,
    );
  }
  if (!tableHasColumn(raw, "board_reporting_scopes", "reviewed_at")) {
    raw.exec(
      "ALTER TABLE board_reporting_scopes ADD COLUMN reviewed_at TEXT",
    );
  }
  if (!tableHasColumn(raw, "board_reporting_priorities", "review_status")) {
    raw.exec(
      `ALTER TABLE board_reporting_priorities
       ADD COLUMN review_status TEXT NOT NULL DEFAULT 'approved'
       CHECK (review_status IN ('needs_review','approved'))`,
    );
  }
  if (!tableHasColumn(raw, "board_reporting_priorities", "reviewed_by")) {
    raw.exec(
      `ALTER TABLE board_reporting_priorities
       ADD COLUMN reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL`,
    );
  }
  if (!tableHasColumn(raw, "board_reporting_priorities", "reviewed_at")) {
    raw.exec(
      "ALTER TABLE board_reporting_priorities ADD COLUMN reviewed_at TEXT",
    );
  }
  if (!tableHasColumn(raw, "board_reporting_priorities", "archived_at")) {
    raw.exec(
      "ALTER TABLE board_reporting_priorities ADD COLUMN archived_at TEXT",
    );
  }
  if (!tableHasColumn(raw, "board_reporting_statements", "archived_at")) {
    raw.exec(
      "ALTER TABLE board_reporting_statements ADD COLUMN archived_at TEXT",
    );
  }

  raw.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_strategic_plans_single_draft
      ON strategic_plans(organization_id)
      WHERE lifecycle_state = 'draft' AND cancelled_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_strategic_plans_lifecycle_active
      ON strategic_plans(organization_id)
      WHERE lifecycle_state = 'active';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_strategic_plans_activation_id
      ON strategic_plans(activation_id)
      WHERE activation_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_strategic_plans_predecessor
      ON strategic_plans(predecessor_plan_id);

    CREATE TABLE IF NOT EXISTS plan_section_reviews (
      plan_id INTEGER NOT NULL
        REFERENCES strategic_plans(id) ON DELETE RESTRICT,
      section TEXT NOT NULL
        CHECK (section IN ('plan_details','plan_structure','targets_board')),
      review_status TEXT NOT NULL DEFAULT 'needs_review'
        CHECK (review_status IN ('needs_review','approved')),
      predecessor_revision INTEGER,
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (plan_id, section)
    );

    CREATE TABLE IF NOT EXISTS successor_lineage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL
        REFERENCES organizations(id) ON DELETE RESTRICT,
      predecessor_plan_id INTEGER NOT NULL
        REFERENCES strategic_plans(id) ON DELETE RESTRICT,
      successor_plan_id INTEGER NOT NULL
        REFERENCES strategic_plans(id) ON DELETE RESTRICT,
      item_kind TEXT NOT NULL CHECK (item_kind IN (
        'priority','goal','kpi','measurement_config','component',
        'distribution_band','membership','target','board_scope',
        'board_priority','board_statement'
      )),
      predecessor_item_id INTEGER NOT NULL,
      successor_item_id INTEGER NOT NULL,
      relationship_type TEXT NOT NULL
        CHECK (relationship_type IN ('copied_from','merged_from','split_from')),
      predecessor_name_snapshot TEXT NOT NULL,
      predecessor_context_json TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (
        successor_plan_id, item_kind, successor_item_id,
        predecessor_item_id, relationship_type
      ),
      CHECK (predecessor_plan_id <> successor_plan_id)
    );

    CREATE INDEX IF NOT EXISTS idx_successor_lineage_successor
      ON successor_lineage(successor_plan_id, item_kind, successor_item_id);
    CREATE INDEX IF NOT EXISTS idx_successor_lineage_predecessor
      ON successor_lineage(predecessor_plan_id, item_kind, predecessor_item_id);

    CREATE TABLE IF NOT EXISTS plan_item_reviews (
      plan_id INTEGER NOT NULL
        REFERENCES strategic_plans(id) ON DELETE RESTRICT,
      item_kind TEXT NOT NULL CHECK (item_kind IN (
        'priority','goal','kpi','measurement_config','component',
        'distribution_band','membership','target','board_priority'
      )),
      item_id INTEGER NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'needs_review'
        CHECK (review_status IN ('needs_review','approved')),
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (plan_id, item_kind, item_id)
    );

    CREATE TABLE IF NOT EXISTS plan_question_decisions (
      plan_id INTEGER NOT NULL
        REFERENCES strategic_plans(id) ON DELETE RESTRICT,
      item_kind TEXT NOT NULL,
      item_id INTEGER NOT NULL,
      classification TEXT NOT NULL
        CHECK (classification IN ('must_resolve','follow_up')),
      explanation TEXT,
      expected_revision TEXT NOT NULL,
      decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      decided_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (plan_id, item_kind, item_id)
    );

    CREATE TABLE IF NOT EXISTS plan_readiness_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL
        REFERENCES strategic_plans(id) ON DELETE RESTRICT,
      requirement_key TEXT NOT NULL,
      requirement_label_snapshot TEXT NOT NULL,
      reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 2000),
      plan_revision INTEGER NOT NULL CHECK (plan_revision > 0),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      activation_id TEXT,
      activated_at TEXT,
      resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resolved_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_readiness_override_open
      ON plan_readiness_overrides(plan_id, requirement_key)
      WHERE resolved_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_plan_readiness_override_activation
      ON plan_readiness_overrides(activation_id);

    CREATE TABLE IF NOT EXISTS strategic_plan_lifecycle_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      plan_id INTEGER NOT NULL,
      predecessor_plan_id INTEGER,
      action TEXT NOT NULL CHECK (action IN (
        'create_blank','create_structural_clone','cancel','activate','archive',
        'activation_recovered'
      )),
      before_state TEXT,
      after_state TEXT NOT NULL,
      checked_plan_revision INTEGER,
      checked_predecessor_revision INTEGER,
      confirmation_text TEXT,
      result_json TEXT NOT NULL,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_email_snapshot TEXT,
      activation_id TEXT,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_plan_lifecycle_plan
      ON strategic_plan_lifecycle_events(plan_id, occurred_at, id);
    CREATE INDEX IF NOT EXISTS idx_plan_lifecycle_action
      ON strategic_plan_lifecycle_events(action, occurred_at, id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_lifecycle_activation_action
      ON strategic_plan_lifecycle_events(activation_id, plan_id, action)
      WHERE activation_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS plan_activation_operations (
      activation_id TEXT PRIMARY KEY,
      predecessor_plan_id INTEGER NOT NULL
        REFERENCES strategic_plans(id) ON DELETE RESTRICT,
      successor_plan_id INTEGER NOT NULL
        REFERENCES strategic_plans(id) ON DELETE RESTRICT,
      requested_revision INTEGER NOT NULL CHECK (requested_revision > 0),
      phase TEXT NOT NULL CHECK (phase IN (
        'pausing','backup_verified','committed_unverified','verified',
        'failed_precommit','verification_failed','integrity_incident'
      )),
      backup_id TEXT,
      backup_path TEXT,
      backup_sha256 TEXT,
      backup_size INTEGER,
      warning_snapshot_json TEXT NOT NULL DEFAULT '[]',
      override_snapshot_json TEXT NOT NULL DEFAULT '[]',
      requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      requested_at TEXT NOT NULL DEFAULT (datetime('now')),
      committed_at TEXT,
      committed_write_counter INTEGER CHECK (
        committed_write_counter IS NULL OR committed_write_counter >= 0
      ),
      verified_at TEXT,
      failure_code TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (predecessor_plan_id <> successor_plan_id)
    );

    CREATE INDEX IF NOT EXISTS idx_plan_activation_phase
      ON plan_activation_operations(phase, requested_at);

    CREATE TABLE IF NOT EXISTS activation_recovery_audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recovery_id TEXT NOT NULL UNIQUE,
      activation_id TEXT NOT NULL,
      backup_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN (
        'preserve_failed_database','restore_pre_activation_backup',
        'repair_forward','reopen_service'
      )),
      operator_snapshot TEXT NOT NULL,
      integrity_result TEXT NOT NULL,
      details_json TEXT NOT NULL,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TRIGGER IF NOT EXISTS successor_lineage_immutable_update
    BEFORE UPDATE ON successor_lineage
    BEGIN
      SELECT RAISE(ABORT, 'SUCCESSOR_LINEAGE_IMMUTABLE');
    END;
    CREATE TRIGGER IF NOT EXISTS successor_lineage_immutable_delete
    BEFORE DELETE ON successor_lineage
    BEGIN
      SELECT RAISE(ABORT, 'SUCCESSOR_LINEAGE_IMMUTABLE');
    END;
    CREATE TRIGGER IF NOT EXISTS plan_lifecycle_events_immutable_update
    BEFORE UPDATE ON strategic_plan_lifecycle_events
    BEGIN
      SELECT RAISE(ABORT, 'PLAN_LIFECYCLE_EVENT_IMMUTABLE');
    END;
    CREATE TRIGGER IF NOT EXISTS plan_lifecycle_events_immutable_delete
    BEFORE DELETE ON strategic_plan_lifecycle_events
    BEGIN
      SELECT RAISE(ABORT, 'PLAN_LIFECYCLE_EVENT_IMMUTABLE');
    END;
    CREATE TRIGGER IF NOT EXISTS activation_recovery_events_immutable_update
    BEFORE UPDATE ON activation_recovery_audit_events
    BEGIN
      SELECT RAISE(ABORT, 'ACTIVATION_RECOVERY_EVENT_IMMUTABLE');
    END;
    CREATE TRIGGER IF NOT EXISTS activation_recovery_events_immutable_delete
    BEFORE DELETE ON activation_recovery_audit_events
    BEGIN
      SELECT RAISE(ABORT, 'ACTIVATION_RECOVERY_EVENT_IMMUTABLE');
    END;

    INSERT OR IGNORE INTO meta (key, value)
      VALUES ('plan_activation_write_pause', '0');
    INSERT OR IGNORE INTO meta (key, value)
      VALUES ('plan_activation_internal_write', '0');
    INSERT OR IGNORE INTO meta (key, value)
      VALUES ('active_plan_integrity_blocked', '0');
    INSERT OR IGNORE INTO meta (key, value)
      VALUES ('authoritative_write_counter', '0');
    INSERT OR IGNORE INTO meta (key, value)
      VALUES ('seed_reset_internal_write', '0');

    CREATE TRIGGER IF NOT EXISTS strategic_audit_events_immutable_update
    BEFORE UPDATE ON strategic_audit_events
    WHEN COALESCE(
      (SELECT value FROM meta WHERE key = 'seed_reset_internal_write'),
      '0'
    ) <> '1'
    AND NOT (
      OLD.actor_id IS NOT NULL AND NEW.actor_id IS NULL
      AND NEW.id IS OLD.id
      AND NEW.entity_type IS OLD.entity_type
      AND NEW.entity_id IS OLD.entity_id
      AND NEW.event_type IS OLD.event_type
      AND NEW.entity_display_name IS OLD.entity_display_name
      AND NEW.parent_priority_name IS OLD.parent_priority_name
      AND NEW.parent_goal_name IS OLD.parent_goal_name
      AND NEW.previous_value_json IS OLD.previous_value_json
      AND NEW.new_value_json IS OLD.new_value_json
      AND NEW.actor_email_snapshot IS OLD.actor_email_snapshot
      AND NEW.source_reference IS OLD.source_reference
      AND NEW.occurred_at IS OLD.occurred_at
    )
    BEGIN
      SELECT RAISE(ABORT, 'STRATEGIC_AUDIT_EVENT_IMMUTABLE');
    END;
    CREATE TRIGGER IF NOT EXISTS strategic_audit_events_immutable_delete
    BEFORE DELETE ON strategic_audit_events
    WHEN COALESCE(
      (SELECT value FROM meta WHERE key = 'seed_reset_internal_write'),
      '0'
    ) <> '1'
    BEGIN
      SELECT RAISE(ABORT, 'STRATEGIC_AUDIT_EVENT_IMMUTABLE');
    END;
    CREATE TRIGGER IF NOT EXISTS installation_audit_events_immutable_update
    BEFORE UPDATE ON installation_audit_events
    WHEN COALESCE(
      (SELECT value FROM meta WHERE key = 'seed_reset_internal_write'),
      '0'
    ) <> '1'
    AND NOT (
      OLD.actor_id IS NOT NULL AND NEW.actor_id IS NULL
      AND NEW.id IS OLD.id
      AND NEW.entity_type IS OLD.entity_type
      AND NEW.entity_id IS OLD.entity_id
      AND NEW.event_type IS OLD.event_type
      AND NEW.entity_display_name IS OLD.entity_display_name
      AND NEW.previous_value_json IS OLD.previous_value_json
      AND NEW.new_value_json IS OLD.new_value_json
      AND NEW.actor_email_snapshot IS OLD.actor_email_snapshot
      AND NEW.occurred_at IS OLD.occurred_at
    )
    BEGIN
      SELECT RAISE(ABORT, 'INSTALLATION_AUDIT_EVENT_IMMUTABLE');
    END;
    CREATE TRIGGER IF NOT EXISTS installation_audit_events_immutable_delete
    BEFORE DELETE ON installation_audit_events
    WHEN COALESCE(
      (SELECT value FROM meta WHERE key = 'seed_reset_internal_write'),
      '0'
    ) <> '1'
    BEGIN
      SELECT RAISE(ABORT, 'INSTALLATION_AUDIT_EVENT_IMMUTABLE');
    END;
    CREATE TRIGGER IF NOT EXISTS entry_history_immutable_update
    BEFORE UPDATE ON entry_history
    WHEN COALESCE(
      (SELECT value FROM meta WHERE key = 'seed_reset_internal_write'),
      '0'
    ) <> '1'
    AND NOT (
      OLD.changed_by IS NOT NULL AND NEW.changed_by IS NULL
      AND NEW.id IS OLD.id
      AND NEW.entry_type IS OLD.entry_type
      AND NEW.entry_id IS OLD.entry_id
      AND NEW.kpi_id IS OLD.kpi_id
      AND NEW.year IS OLD.year
      AND NEW.month_or_label IS OLD.month_or_label
      AND NEW.prev_value IS OLD.prev_value
      AND NEW.new_value IS OLD.new_value
      AND NEW.prev_notes IS OLD.prev_notes
      AND NEW.new_notes IS OLD.new_notes
      AND NEW.changed_at IS OLD.changed_at
      AND NEW.kpi_name IS OLD.kpi_name
      AND NEW.kpi_slug IS OLD.kpi_slug
      AND NEW.kpi_unit IS OLD.kpi_unit
      AND NEW.category_id IS OLD.category_id
      AND NEW.category_name IS OLD.category_name
      AND NEW.category_slug IS OLD.category_slug
      AND NEW.changed_by_email IS OLD.changed_by_email
    )
    BEGIN
      SELECT RAISE(ABORT, 'ENTRY_HISTORY_IMMUTABLE');
    END;
    CREATE TRIGGER IF NOT EXISTS entry_history_immutable_delete
    BEFORE DELETE ON entry_history
    WHEN COALESCE(
      (SELECT value FROM meta WHERE key = 'seed_reset_internal_write'),
      '0'
    ) <> '1'
    BEGIN
      SELECT RAISE(ABORT, 'ENTRY_HISTORY_IMMUTABLE');
    END;
  `);
  if (
    !tableHasColumn(
      raw,
      "plan_activation_operations",
      "committed_write_counter",
    )
  ) {
    raw.exec(
      `ALTER TABLE plan_activation_operations
       ADD COLUMN committed_write_counter INTEGER
       CHECK (
         committed_write_counter IS NULL OR committed_write_counter >= 0
       )`,
    );
  }
  initializePlanLifecycleTriggers(raw);
}

interface PlanOwnedTriggerDefinition {
  table: string;
  newPlanIdSql: string;
  oldPlanIdSql: string;
  section: "plan_structure" | "targets_board";
  activeOnly: boolean;
}

/**
 * Advances a durable monotonic witness for every authoritative application
 * table mutation. Activation captures the value after its atomic lifecycle
 * transaction. A recovery restore is safe only while the current value still
 * equals that committed witness, proving that no later business write reached
 * the database even if pause markers were temporarily changed.
 */
function initializeAuthoritativeWriteCounterTriggers(
  raw: DatabaseSync,
): void {
  const excluded = new Set([
    "meta",
    "plan_activation_operations",
    "activation_recovery_audit_events",
  ]);
  const tables = raw
    .prepare(
      `SELECT name FROM sqlite_schema
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all() as Array<{ name: string }>;
  for (const { name } of tables) {
    if (excluded.has(name)) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`Unsafe table name while installing write witness: ${name}`);
    }
    for (const operation of ["INSERT", "UPDATE", "DELETE"] as const) {
      const triggerName = `${name}_activation_write_counter_${operation.toLowerCase()}`;
      raw.exec(`
        CREATE TRIGGER IF NOT EXISTS "${triggerName}"
        AFTER ${operation} ON "${name}"
        BEGIN
          UPDATE meta
          SET value = CAST(value AS INTEGER) + 1
          WHERE key = 'authoritative_write_counter';
        END;
      `);
    }
  }
}

/**
 * Installs the database-enforced write pause, Archived/Cancelled
 * immutability, result-to-Active ownership, Whole-Plan Revision advancement,
 * and predecessor-change review triggers. The table and ownership expressions
 * are static application constants, never request input.
 */
function initializePlanLifecycleTriggers(raw: DatabaseSync): void {
  const definitions: PlanOwnedTriggerDefinition[] = [
    {
      table: "categories",
      newPlanIdSql: "NEW.plan_id",
      oldPlanIdSql: "OLD.plan_id",
      section: "plan_structure",
      activeOnly: false,
    },
    {
      table: "kpis",
      newPlanIdSql:
        "(SELECT plan_id FROM categories WHERE id = NEW.category_id)",
      oldPlanIdSql:
        "(SELECT plan_id FROM categories WHERE id = OLD.category_id)",
      section: "plan_structure",
      activeOnly: false,
    },
    {
      table: "strategic_goals",
      newPlanIdSql:
        "(SELECT priority.plan_id FROM categories priority WHERE priority.id = NEW.priority_id)",
      oldPlanIdSql:
        "(SELECT priority.plan_id FROM categories priority WHERE priority.id = OLD.priority_id)",
      section: "plan_structure",
      activeOnly: false,
    },
    {
      table: "goal_kpis",
      newPlanIdSql:
        "(SELECT priority.plan_id FROM strategic_goals goal JOIN categories priority ON priority.id = goal.priority_id WHERE goal.id = NEW.goal_id)",
      oldPlanIdSql:
        "(SELECT priority.plan_id FROM strategic_goals goal JOIN categories priority ON priority.id = goal.priority_id WHERE goal.id = OLD.goal_id)",
      section: "plan_structure",
      activeOnly: false,
    },
    {
      table: "kpi_measurement_configs",
      newPlanIdSql:
        "(SELECT priority.plan_id FROM kpis kpi JOIN categories priority ON priority.id = kpi.category_id WHERE kpi.id = NEW.kpi_id)",
      oldPlanIdSql:
        "(SELECT priority.plan_id FROM kpis kpi JOIN categories priority ON priority.id = kpi.category_id WHERE kpi.id = OLD.kpi_id)",
      section: "plan_structure",
      activeOnly: false,
    },
    {
      table: "kpi_components",
      newPlanIdSql:
        "(SELECT priority.plan_id FROM kpis kpi JOIN categories priority ON priority.id = kpi.category_id WHERE kpi.id = NEW.kpi_id)",
      oldPlanIdSql:
        "(SELECT priority.plan_id FROM kpis kpi JOIN categories priority ON priority.id = kpi.category_id WHERE kpi.id = OLD.kpi_id)",
      section: "plan_structure",
      activeOnly: false,
    },
    {
      table: "distribution_bands",
      newPlanIdSql:
        "(SELECT priority.plan_id FROM kpis kpi JOIN categories priority ON priority.id = kpi.category_id WHERE kpi.id = NEW.kpi_id)",
      oldPlanIdSql:
        "(SELECT priority.plan_id FROM kpis kpi JOIN categories priority ON priority.id = kpi.category_id WHERE kpi.id = OLD.kpi_id)",
      section: "plan_structure",
      activeOnly: false,
    },
    {
      table: "kpi_targets",
      newPlanIdSql:
        "(SELECT priority.plan_id FROM kpis kpi JOIN categories priority ON priority.id = kpi.category_id LEFT JOIN kpi_components component ON component.id = NEW.component_id WHERE kpi.id = COALESCE(NEW.kpi_id, component.kpi_id))",
      oldPlanIdSql:
        "(SELECT priority.plan_id FROM kpis kpi JOIN categories priority ON priority.id = kpi.category_id LEFT JOIN kpi_components component ON component.id = OLD.component_id WHERE kpi.id = COALESCE(OLD.kpi_id, component.kpi_id))",
      section: "targets_board",
      activeOnly: false,
    },
    {
      table: "board_reporting_scopes",
      newPlanIdSql: "NEW.plan_id",
      oldPlanIdSql: "OLD.plan_id",
      section: "targets_board",
      activeOnly: false,
    },
    {
      table: "board_reporting_priorities",
      newPlanIdSql:
        "(SELECT plan_id FROM board_reporting_scopes WHERE id = NEW.scope_id)",
      oldPlanIdSql:
        "(SELECT plan_id FROM board_reporting_scopes WHERE id = OLD.scope_id)",
      section: "targets_board",
      activeOnly: false,
    },
    {
      table: "board_reporting_statements",
      newPlanIdSql:
        "(SELECT scope.plan_id FROM board_reporting_priorities priority JOIN board_reporting_scopes scope ON scope.id = priority.scope_id WHERE priority.id = NEW.board_priority_id)",
      oldPlanIdSql:
        "(SELECT scope.plan_id FROM board_reporting_priorities priority JOIN board_reporting_scopes scope ON scope.id = priority.scope_id WHERE priority.id = OLD.board_priority_id)",
      section: "targets_board",
      activeOnly: false,
    },
    {
      table: "board_reporting_statement_kpis",
      newPlanIdSql:
        "(SELECT scope.plan_id FROM board_reporting_statements statement JOIN board_reporting_priorities priority ON priority.id = statement.board_priority_id JOIN board_reporting_scopes scope ON scope.id = priority.scope_id WHERE statement.id = NEW.statement_id)",
      oldPlanIdSql:
        "(SELECT scope.plan_id FROM board_reporting_statements statement JOIN board_reporting_priorities priority ON priority.id = statement.board_priority_id JOIN board_reporting_scopes scope ON scope.id = priority.scope_id WHERE statement.id = OLD.statement_id)",
      section: "targets_board",
      activeOnly: false,
    },
    {
      table: "board_reporting_audit_events",
      newPlanIdSql:
        "(SELECT plan_id FROM board_reporting_scopes WHERE id = NEW.scope_id)",
      oldPlanIdSql:
        "(SELECT plan_id FROM board_reporting_scopes WHERE id = OLD.scope_id)",
      section: "targets_board",
      activeOnly: false,
    },
    {
      table: "plan_section_reviews",
      newPlanIdSql: "NEW.plan_id",
      oldPlanIdSql: "OLD.plan_id",
      section: "plan_structure",
      activeOnly: false,
    },
    {
      table: "plan_item_reviews",
      newPlanIdSql: "NEW.plan_id",
      oldPlanIdSql: "OLD.plan_id",
      section: "plan_structure",
      activeOnly: false,
    },
    {
      table: "plan_question_decisions",
      newPlanIdSql: "NEW.plan_id",
      oldPlanIdSql: "OLD.plan_id",
      section: "plan_structure",
      activeOnly: false,
    },
    {
      table: "plan_readiness_overrides",
      newPlanIdSql: "NEW.plan_id",
      oldPlanIdSql: "OLD.plan_id",
      section: "targets_board",
      activeOnly: false,
    },
    {
      table: "kpi_observations",
      newPlanIdSql:
        "(SELECT priority.plan_id FROM kpis kpi JOIN categories priority ON priority.id = kpi.category_id WHERE kpi.id = NEW.kpi_id)",
      oldPlanIdSql:
        "(SELECT priority.plan_id FROM kpis kpi JOIN categories priority ON priority.id = kpi.category_id WHERE kpi.id = OLD.kpi_id)",
      section: "plan_structure",
      activeOnly: true,
    },
    {
      table: "kpi_component_entries",
      newPlanIdSql:
        "(SELECT priority.plan_id FROM kpi_components component JOIN kpis kpi ON kpi.id = component.kpi_id JOIN categories priority ON priority.id = kpi.category_id WHERE component.id = NEW.component_id)",
      oldPlanIdSql:
        "(SELECT priority.plan_id FROM kpi_components component JOIN kpis kpi ON kpi.id = component.kpi_id JOIN categories priority ON priority.id = kpi.category_id WHERE component.id = OLD.component_id)",
      section: "plan_structure",
      activeOnly: true,
    },
    {
      table: "distribution_observations",
      newPlanIdSql:
        "(SELECT priority.plan_id FROM kpis kpi JOIN categories priority ON priority.id = kpi.category_id WHERE kpi.id = NEW.kpi_id)",
      oldPlanIdSql:
        "(SELECT priority.plan_id FROM kpis kpi JOIN categories priority ON priority.id = kpi.category_id WHERE kpi.id = OLD.kpi_id)",
      section: "plan_structure",
      activeOnly: true,
    },
    {
      table: "distribution_values",
      newPlanIdSql:
        "(SELECT priority.plan_id FROM distribution_observations observation JOIN kpis kpi ON kpi.id = observation.kpi_id JOIN categories priority ON priority.id = kpi.category_id WHERE observation.id = NEW.observation_id)",
      oldPlanIdSql:
        "(SELECT priority.plan_id FROM distribution_observations observation JOIN kpis kpi ON kpi.id = observation.kpi_id JOIN categories priority ON priority.id = kpi.category_id WHERE observation.id = OLD.observation_id)",
      section: "plan_structure",
      activeOnly: true,
    },
    {
      table: "monthly_entries",
      newPlanIdSql:
        "(SELECT priority.plan_id FROM kpis kpi JOIN categories priority ON priority.id = kpi.category_id WHERE kpi.id = NEW.kpi_id)",
      oldPlanIdSql:
        "(SELECT priority.plan_id FROM kpis kpi JOIN categories priority ON priority.id = kpi.category_id WHERE kpi.id = OLD.kpi_id)",
      section: "plan_structure",
      activeOnly: true,
    },
    {
      table: "breakdown_entries",
      newPlanIdSql:
        "(SELECT priority.plan_id FROM kpis kpi JOIN categories priority ON priority.id = kpi.category_id WHERE kpi.id = NEW.kpi_id)",
      oldPlanIdSql:
        "(SELECT priority.plan_id FROM kpis kpi JOIN categories priority ON priority.id = kpi.category_id WHERE kpi.id = OLD.kpi_id)",
      section: "plan_structure",
      activeOnly: true,
    },
    {
      table: "kpi_goals",
      newPlanIdSql:
        "(SELECT priority.plan_id FROM kpis kpi JOIN categories priority ON priority.id = kpi.category_id WHERE kpi.id = NEW.kpi_id)",
      oldPlanIdSql:
        "(SELECT priority.plan_id FROM kpis kpi JOIN categories priority ON priority.id = kpi.category_id WHERE kpi.id = OLD.kpi_id)",
      section: "targets_board",
      activeOnly: false,
    },
  ];

  raw.exec(`
    CREATE TRIGGER IF NOT EXISTS strategic_plans_pause_insert
    BEFORE INSERT ON strategic_plans
    WHEN (SELECT value FROM meta WHERE key = 'plan_activation_write_pause') = '1'
      AND (SELECT value FROM meta WHERE key = 'plan_activation_internal_write') <> '1'
    BEGIN
      SELECT RAISE(ABORT, 'PLAN_WRITES_PAUSED');
    END;
    CREATE TRIGGER IF NOT EXISTS strategic_plans_pause_update
    BEFORE UPDATE ON strategic_plans
    WHEN (SELECT value FROM meta WHERE key = 'plan_activation_write_pause') = '1'
      AND (SELECT value FROM meta WHERE key = 'plan_activation_internal_write') <> '1'
    BEGIN
      SELECT RAISE(ABORT, 'PLAN_WRITES_PAUSED');
    END;
    CREATE TRIGGER IF NOT EXISTS strategic_plans_pause_delete
    BEFORE DELETE ON strategic_plans
    WHEN (SELECT value FROM meta WHERE key = 'plan_activation_write_pause') = '1'
      AND (SELECT value FROM meta WHERE key = 'plan_activation_internal_write') <> '1'
    BEGIN
      SELECT RAISE(ABORT, 'PLAN_WRITES_PAUSED');
    END;
    CREATE TRIGGER IF NOT EXISTS strategic_plans_immutable_update
    BEFORE UPDATE ON strategic_plans
    WHEN OLD.lifecycle_state IN ('archived','cancelled')
      AND (SELECT value FROM meta WHERE key = 'plan_activation_internal_write') <> '1'
    BEGIN
      SELECT RAISE(ABORT, 'PLAN_IS_READ_ONLY');
    END;
    CREATE TRIGGER IF NOT EXISTS strategic_plans_no_delete
    BEFORE DELETE ON strategic_plans
    WHEN COALESCE(
      (SELECT value FROM meta WHERE key = 'seed_reset_internal_write'),
      '0'
    ) <> '1'
    BEGIN
      SELECT RAISE(ABORT, 'PLAN_DELETION_FORBIDDEN');
    END;
    CREATE TRIGGER IF NOT EXISTS strategic_plans_original_state_sync
    AFTER INSERT ON strategic_plans
    WHEN NEW.creation_method = 'original'
      AND NEW.lifecycle_state = 'draft'
      AND NEW.status IN ('active','archived')
    BEGIN
      UPDATE strategic_plans
      SET lifecycle_state = NEW.status
      WHERE id = NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS strategic_plans_details_revision
    AFTER UPDATE OF name, description, start_year, end_year, source_reference,
      approval_source ON strategic_plans
    WHEN OLD.lifecycle_state IN ('active','draft')
      AND NEW.whole_plan_revision = OLD.whole_plan_revision
    BEGIN
      UPDATE strategic_plans
      SET whole_plan_revision = whole_plan_revision + 1
      WHERE id = NEW.id;
      UPDATE strategic_plans
      SET source_changed_at = datetime('now'),
          whole_plan_revision = whole_plan_revision + 1
      WHERE predecessor_plan_id = NEW.id AND lifecycle_state = 'draft';
      UPDATE plan_section_reviews
      SET review_status = 'needs_review', reviewed_by = NULL,
          reviewed_at = NULL, updated_at = datetime('now')
      WHERE plan_id IN (
        SELECT id FROM strategic_plans
        WHERE predecessor_plan_id = NEW.id AND lifecycle_state = 'draft'
      );
    END;
  `);

  for (const table of [
    "users",
    "organizations",
    "installation_audit_events",
    "strategic_audit_events",
    "user_lifecycle_audit_events",
    "entry_history",
    "successor_lineage",
    "strategic_plan_lifecycle_events",
    "activation_recovery_audit_events",
  ]) {
    raw.exec(`
      CREATE TRIGGER IF NOT EXISTS ${table}_activation_pause_insert
      BEFORE INSERT ON ${table}
      WHEN (SELECT value FROM meta WHERE key = 'plan_activation_write_pause') = '1'
        AND (SELECT value FROM meta WHERE key = 'plan_activation_internal_write') <> '1'
      BEGIN
        SELECT RAISE(ABORT, 'PLAN_WRITES_PAUSED');
      END;
      CREATE TRIGGER IF NOT EXISTS ${table}_activation_pause_update
      BEFORE UPDATE ON ${table}
      WHEN (SELECT value FROM meta WHERE key = 'plan_activation_write_pause') = '1'
        AND (SELECT value FROM meta WHERE key = 'plan_activation_internal_write') <> '1'
      BEGIN
        SELECT RAISE(ABORT, 'PLAN_WRITES_PAUSED');
      END;
      CREATE TRIGGER IF NOT EXISTS ${table}_activation_pause_delete
      BEFORE DELETE ON ${table}
      WHEN (SELECT value FROM meta WHERE key = 'plan_activation_write_pause') = '1'
        AND (SELECT value FROM meta WHERE key = 'plan_activation_internal_write') <> '1'
      BEGIN
        SELECT RAISE(ABORT, 'PLAN_WRITES_PAUSED');
      END;
    `);
  }

  for (const definition of definitions) {
    const insertLifecycleCheck = definition.activeOnly
      ? `<> 'active'`
      : `IN ('archived','cancelled')`;
    raw.exec(`
      CREATE TRIGGER IF NOT EXISTS ${definition.table}_plan_pause_insert
      BEFORE INSERT ON ${definition.table}
      WHEN (SELECT value FROM meta WHERE key = 'plan_activation_write_pause') = '1'
        AND (SELECT value FROM meta WHERE key = 'plan_activation_internal_write') <> '1'
      BEGIN
        SELECT RAISE(ABORT, 'PLAN_WRITES_PAUSED');
      END;
      CREATE TRIGGER IF NOT EXISTS ${definition.table}_plan_pause_update
      BEFORE UPDATE ON ${definition.table}
      WHEN (SELECT value FROM meta WHERE key = 'plan_activation_write_pause') = '1'
        AND (SELECT value FROM meta WHERE key = 'plan_activation_internal_write') <> '1'
      BEGIN
        SELECT RAISE(ABORT, 'PLAN_WRITES_PAUSED');
      END;
      CREATE TRIGGER IF NOT EXISTS ${definition.table}_plan_pause_delete
      BEFORE DELETE ON ${definition.table}
      WHEN (SELECT value FROM meta WHERE key = 'plan_activation_write_pause') = '1'
        AND (SELECT value FROM meta WHERE key = 'plan_activation_internal_write') <> '1'
      BEGIN
        SELECT RAISE(ABORT, 'PLAN_WRITES_PAUSED');
      END;
      CREATE TRIGGER IF NOT EXISTS ${definition.table}_plan_state_insert
      BEFORE INSERT ON ${definition.table}
      WHEN (
        SELECT lifecycle_state FROM strategic_plans
        WHERE id = ${definition.newPlanIdSql}
      ) ${insertLifecycleCheck}
      BEGIN
        SELECT RAISE(ABORT, 'PLAN_IS_READ_ONLY');
      END;
      CREATE TRIGGER IF NOT EXISTS ${definition.table}_plan_state_update
      BEFORE UPDATE ON ${definition.table}
      WHEN (
        (
          SELECT lifecycle_state FROM strategic_plans
          WHERE id = ${definition.oldPlanIdSql}
        ) ${insertLifecycleCheck}
        OR
        (
          SELECT lifecycle_state FROM strategic_plans
          WHERE id = ${definition.newPlanIdSql}
        ) ${insertLifecycleCheck}
      )
      BEGIN
        SELECT RAISE(ABORT, 'PLAN_IS_READ_ONLY');
      END;
      CREATE TRIGGER IF NOT EXISTS ${definition.table}_plan_state_delete
      BEFORE DELETE ON ${definition.table}
      WHEN (
        SELECT lifecycle_state FROM strategic_plans
        WHERE id = ${definition.oldPlanIdSql}
      ) ${insertLifecycleCheck}
      BEGIN
        SELECT RAISE(ABORT, 'PLAN_IS_READ_ONLY');
      END;
      CREATE TRIGGER IF NOT EXISTS ${definition.table}_whole_plan_insert
      AFTER INSERT ON ${definition.table}
      BEGIN
        UPDATE strategic_plans
        SET whole_plan_revision = whole_plan_revision + 1
        WHERE id = ${definition.newPlanIdSql}
          AND lifecycle_state IN ('active','draft');
        UPDATE strategic_plans
        SET source_changed_at = datetime('now'),
            whole_plan_revision = whole_plan_revision + 1
        WHERE predecessor_plan_id = ${definition.newPlanIdSql}
          AND lifecycle_state = 'draft';
        UPDATE plan_section_reviews
        SET review_status = 'needs_review', reviewed_by = NULL,
            reviewed_at = NULL, updated_at = datetime('now')
        WHERE plan_id IN (
          SELECT id FROM strategic_plans
          WHERE predecessor_plan_id = ${definition.newPlanIdSql}
            AND lifecycle_state = 'draft'
        ) AND section = '${definition.section}';
      END;
      CREATE TRIGGER IF NOT EXISTS ${definition.table}_whole_plan_update
      AFTER UPDATE ON ${definition.table}
      BEGIN
        UPDATE strategic_plans
        SET whole_plan_revision = whole_plan_revision + 1
        WHERE id IN (
            ${definition.oldPlanIdSql},
            ${definition.newPlanIdSql}
          )
          AND lifecycle_state IN ('active','draft');
        UPDATE strategic_plans
        SET source_changed_at = datetime('now'),
            whole_plan_revision = whole_plan_revision + 1
        WHERE predecessor_plan_id IN (
            ${definition.oldPlanIdSql},
            ${definition.newPlanIdSql}
          )
          AND lifecycle_state = 'draft';
        UPDATE plan_section_reviews
        SET review_status = 'needs_review', reviewed_by = NULL,
            reviewed_at = NULL, updated_at = datetime('now')
        WHERE plan_id IN (
          SELECT id FROM strategic_plans
          WHERE predecessor_plan_id IN (
              ${definition.oldPlanIdSql},
              ${definition.newPlanIdSql}
            )
            AND lifecycle_state = 'draft'
        ) AND section = '${definition.section}';
      END;
      CREATE TRIGGER IF NOT EXISTS ${definition.table}_whole_plan_delete
      AFTER DELETE ON ${definition.table}
      BEGIN
        UPDATE strategic_plans
        SET whole_plan_revision = whole_plan_revision + 1
        WHERE id = ${definition.oldPlanIdSql}
          AND lifecycle_state IN ('active','draft');
        UPDATE strategic_plans
        SET source_changed_at = datetime('now'),
            whole_plan_revision = whole_plan_revision + 1
        WHERE predecessor_plan_id = ${definition.oldPlanIdSql}
          AND lifecycle_state = 'draft';
        UPDATE plan_section_reviews
        SET review_status = 'needs_review', reviewed_by = NULL,
            reviewed_at = NULL, updated_at = datetime('now')
        WHERE plan_id IN (
          SELECT id FROM strategic_plans
          WHERE predecessor_plan_id = ${definition.oldPlanIdSql}
            AND lifecycle_state = 'draft'
        ) AND section = '${definition.section}';
      END;
    `);
  }
  initializeAuthoritativeWriteCounterTriggers(raw);
}

/**
 * Applies the additive schema-15 -> schema-16 lifecycle step as one
 * transaction. A fault at any DDL or backfill point rolls the entire step
 * back, leaving schema 15 available for a safe retry.
 */
function migratePlanLifecycleSchemaV16(raw: DatabaseSync): void {
  raw.exec("BEGIN IMMEDIATE;");
  try {
    initializePlanLifecycleSchema(raw);
    raw.exec(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '16');",
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
 * Reads the persisted schema version without changing the database.
 *
 * A missing `meta` table or missing `schema_version` row identifies a fresh
 * database. Once the row exists, however, its value is a trust boundary:
 * malformed metadata must fail closed instead of being coerced to `NaN` and
 * falling through to the intentional legacy reset path.
 */
function currentSchemaVersion(raw: DatabaseSync): number {
  const metaTable = raw
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'",
    )
    .get();
  if (!metaTable) return 0;

  let row: { value?: unknown } | undefined;
  try {
    row = raw
      .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
      .get() as { value?: unknown } | undefined;
  } catch (error) {
    throw new Error(
      "Invalid persisted schema version metadata; refusing to migrate or reset this database.",
      { cause: error },
    );
  }

  if (!row) return 0;
  const value = row.value;
  const version =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^(?:0|[1-9]\d*)$/u.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new Error(
      `Invalid persisted schema version ${JSON.stringify(value)}; ` +
        "refusing to migrate or reset this database.",
    );
  }
  return version;
}

/** Applies the migrate schema operation. */
function migrateSchema(raw: DatabaseSync): void {
  // Probe before any DDL. A database written by a newer release may contain
  // user columns and constraints this release does not understand; even an
  // otherwise idempotent repair could destroy that future schema before the
  // refusal below.
  const version = currentSchemaVersion(raw);
  if (version > SCHEMA_VERSION) {
    // Fail closed: a database written by a NEWER release must never enter the
    // legacy fall-through reset path below. Historically that path attempted
    // to drop KPI-owned tables and only survived because foreign-key
    // enforcement made the DROPs fail; make the refusal explicit instead of
    // relying on that incidental protection.
    throw new Error(
      `Database schema version ${version} is newer than this application supports (${SCHEMA_VERSION}). ` +
        `Upgrade the application to a release that understands schema ${version}; refusing to migrate or reset this database.`,
    );
  }
  ensureUsersTable(raw);
  ensureMetaTable(raw);
  if (version === SCHEMA_VERSION) {
    ensureStrategicSchemaV10Columns(raw);
    initializeBoardReportingSchema(raw);
    initializeUserLifecycleAuditSchema(raw);
    initializePlanLifecycleSchema(raw);
    return;
  }

  if (version === 15) {
    ensureStrategicSchemaV10Columns(raw);
    initializeBoardReportingSchema(raw);
    initializeUserLifecycleAuditSchema(raw);
    migratePlanLifecycleSchemaV16(raw);
    return;
  }

  // v14 -> v15 is additive: it installs the immutable user lifecycle audit
  // log without touching any existing business or audit rows.
  if (version === 14) {
    ensureStrategicSchemaV10Columns(raw);
    initializeBoardReportingSchema(raw);
    migrateUserLifecycleAuditSchemaV15(raw);
    migratePlanLifecycleSchemaV16(raw);
    return;
  }

  if (version === 13) {
    ensureStrategicSchemaV10Columns(raw);
    migrateBoardReportingSchemaV14(raw);
    migrateUserLifecycleAuditSchemaV15(raw);
    migratePlanLifecycleSchemaV16(raw);
    return;
  }

  // v12 -> v13 only widens users.role to include the Board reporting role.
  // ensureUsersTable performs the preservation-safe table rebuild above.
  if (version === 12) {
    ensureStrategicSchemaV10Columns(raw);
    recordSchemaV13(raw);
    migrateBoardReportingSchemaV14(raw);
    migrateUserLifecycleAuditSchemaV15(raw);
    migratePlanLifecycleSchemaV16(raw);
    return;
  }

  // v11 -> v12 adds the durable installation/plan owner and attaches every
  // existing Strategic Priority to that plan without changing a business id.
  if (version === 11) {
    ensureStrategicSchemaV10Columns(raw);
    migrateInstallationSchemaV12(raw);
    recordSchemaV13(raw);
    migrateBoardReportingSchemaV14(raw);
    migrateUserLifecycleAuditSchemaV15(raw);
    migratePlanLifecycleSchemaV16(raw);
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
    migrateInstallationSchemaV12(raw);
    recordSchemaV13(raw);
    migrateBoardReportingSchemaV14(raw);
    migrateUserLifecycleAuditSchemaV15(raw);
    migratePlanLifecycleSchemaV16(raw);
    return;
  }

  // v9 → v10 is strictly additive. It preserves the legacy catalog, values,
  // KPI targets, and entry audit trail while installing the normalized strategic
  // planning sidecars used by the next dashboard model.
  if (version === 9) {
    migrateStrategicSchemaV10(raw);
    migrateStrategicSchemaV11(raw);
    migrateInstallationSchemaV12(raw);
    recordSchemaV13(raw);
    migrateBoardReportingSchemaV14(raw);
    migrateUserLifecycleAuditSchemaV15(raw);
    migratePlanLifecycleSchemaV16(raw);
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
    migrateStrategicSchemaV11(raw);
    migrateInstallationSchemaV12(raw);
    recordSchemaV13(raw);
    migrateBoardReportingSchemaV14(raw);
    migrateUserLifecycleAuditSchemaV15(raw);
    migratePlanLifecycleSchemaV16(raw);
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

/** Removes or resets kpi schema. */
function resetKpiSchema(raw: DatabaseSync): void {
  raw.exec("BEGIN IMMEDIATE;");
  try {
    raw.exec("DROP TABLE IF EXISTS user_lifecycle_audit_events;");
    raw.exec("DROP TABLE IF EXISTS board_reporting_audit_events;");
    raw.exec("DROP TABLE IF EXISTS board_reporting_statement_kpis;");
    raw.exec("DROP TABLE IF EXISTS board_reporting_statements;");
    raw.exec("DROP TABLE IF EXISTS board_reporting_priorities;");
    raw.exec("DROP TABLE IF EXISTS board_reporting_scopes;");
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

/** Implements the table has column operation. */
function tableHasColumn(
  raw: DatabaseSync,
  table:
    | "categories"
    | "kpis"
    | "distribution_bands"
    | "strategic_plans"
    | "board_reporting_scopes"
    | "board_reporting_priorities"
    | "board_reporting_statements"
    | "plan_activation_operations",
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
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '11');",
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

/** Applies the initialize installation schema operation. */
function initializeInstallationSchema(raw: DatabaseSync): void {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','archived')),
      archived_at TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_single_active
      ON organizations((1))
      WHERE status = 'active' AND archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS strategic_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL
        REFERENCES organizations(id) ON DELETE RESTRICT,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      start_year INTEGER NOT NULL CHECK (start_year BETWEEN 1900 AND 2100),
      end_year INTEGER NOT NULL CHECK (end_year BETWEEN start_year AND 2100),
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','active','archived')),
      revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
      source_reference TEXT,
      archived_at TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (organization_id, slug)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_strategic_plans_active_organization
      ON strategic_plans(organization_id)
      WHERE status = 'active' AND archived_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_strategic_plans_status
      ON strategic_plans(status, archived_at);

    CREATE TABLE IF NOT EXISTS installation_audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('organization','strategic_plan')),
      entity_id INTEGER NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('create','update','archive','restore')),
      entity_display_name TEXT NOT NULL,
      previous_value_json TEXT,
      new_value_json TEXT,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_email_snapshot TEXT,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_installation_audit_entity
      ON installation_audit_events(entity_type, entity_id, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_installation_audit_occurred
      ON installation_audit_events(occurred_at, id);
  `);
}

/**
 * v11 -> v12 database-authority migration.
 *
 * The embedded values below are a one-time historical migration input. After
 * schema 12 is recorded, ordinary startup never compares or reconciles these
 * values with persisted installation content.
 */
function migrateInstallationSchemaV12(raw: DatabaseSync): void {
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
      initializeInstallationSchema(raw);
      const organization = raw.prepare(
        `INSERT INTO organizations (slug, name, short_name, status)
         VALUES ('eastern-state-penitentiary-historic-site',
                 'Eastern State Penitentiary Historic Site',
                 'Eastern State', 'active')
         RETURNING id`,
      ).get() as { id: number };
      const plan = raw.prepare(
        `INSERT INTO strategic_plans (
           organization_id, slug, name, start_year, end_year, status,
           source_reference
         ) VALUES (?, 'strategic-plan-2025-2029', 'Strategic Plan',
                   2025, 2029, 'active',
                   'Eastern State Strategic Dashboard 2025-2029 (8.1.25)')
         RETURNING id`,
      ).get(Number(organization.id)) as { id: number };
      raw.prepare(
        `INSERT INTO installation_audit_events (
           entity_type, entity_id, event_type, entity_display_name,
           previous_value_json, new_value_json
         ) VALUES ('organization', ?, 'create', ?, NULL, ?)`,
      ).run(
        Number(organization.id),
        "Eastern State Penitentiary Historic Site",
        JSON.stringify({
          slug: "eastern-state-penitentiary-historic-site",
          name: "Eastern State Penitentiary Historic Site",
          short_name: "Eastern State",
          status: "active",
        }),
      );
      raw.prepare(
        `INSERT INTO installation_audit_events (
           entity_type, entity_id, event_type, entity_display_name,
           previous_value_json, new_value_json
         ) VALUES ('strategic_plan', ?, 'create', ?, NULL, ?)`,
      ).run(
        Number(plan.id),
        "Strategic Plan",
        JSON.stringify({
          organization_id: Number(organization.id),
          slug: "strategic-plan-2025-2029",
          name: "Strategic Plan",
          start_year: 2025,
          end_year: 2029,
          status: "active",
          source_reference:
            "Eastern State Strategic Dashboard 2025-2029 (8.1.25)",
        }),
      );

      raw.exec(`
        DROP TRIGGER IF EXISTS categories_set_updated_at_after_insert;
        DROP TRIGGER IF EXISTS categories_set_updated_at_after_update;
        DROP INDEX IF EXISTS idx_categories_archived_at;

        CREATE TABLE categories_v12 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          plan_id INTEGER NOT NULL REFERENCES strategic_plans(id) ON DELETE RESTRICT,
          slug TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          archived_at TEXT,
          updated_at TEXT
        );
      `);
      raw.prepare(
        `INSERT INTO categories_v12 (
           id, plan_id, slug, name, description, sort_order, archived_at,
           updated_at
         )
         SELECT id, ?, slug, name, description, sort_order, archived_at,
                updated_at
         FROM categories`,
      ).run(Number(plan.id));
      raw.exec(`
        DROP TABLE categories;
        ALTER TABLE categories_v12 RENAME TO categories;
        CREATE INDEX idx_categories_archived_at ON categories(archived_at);

        CREATE TRIGGER categories_set_updated_at_after_insert
        AFTER INSERT ON categories
        FOR EACH ROW WHEN NEW.updated_at IS NULL
        BEGIN
          UPDATE categories SET updated_at = datetime('now') WHERE id = NEW.id;
        END;

        CREATE TRIGGER categories_set_updated_at_after_update
        AFTER UPDATE OF plan_id, slug, name, description, sort_order, archived_at
        ON categories
        FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
        BEGIN
          UPDATE categories SET updated_at = datetime('now') WHERE id = NEW.id;
        END;

        DROP INDEX IF EXISTS idx_strategic_goals_priority;
        DROP INDEX IF EXISTS idx_strategic_goals_configuration;

        CREATE TABLE strategic_goals_v12 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          priority_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
          slug TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          plan_start_year INTEGER NOT NULL
            CHECK (plan_start_year BETWEEN 1900 AND 2100),
          plan_end_year INTEGER NOT NULL
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

        INSERT INTO strategic_goals_v12 (
          id, priority_id, slug, name, description, plan_start_year,
          plan_end_year, completion_rule, threshold_count,
          threshold_percentage, manual_status, board_level_status,
          configuration_status, unresolved_question, owner, due_date,
          resolution_notes, source_reference, last_reviewed_date, sort_order,
          archived_at, created_by, created_at, updated_by, updated_at
        )
        SELECT id, priority_id, slug, name, description, plan_start_year,
               plan_end_year, completion_rule, threshold_count,
               threshold_percentage, manual_status, board_level_status,
               configuration_status, unresolved_question, owner, due_date,
               resolution_notes, source_reference, last_reviewed_date, sort_order,
               archived_at, created_by, created_at, updated_by, updated_at
        FROM strategic_goals;

        DROP TABLE strategic_goals;
        ALTER TABLE strategic_goals_v12 RENAME TO strategic_goals;
        CREATE INDEX idx_strategic_goals_priority
          ON strategic_goals(priority_id, sort_order);
        CREATE INDEX idx_strategic_goals_configuration
          ON strategic_goals(configuration_status, archived_at);

        DROP INDEX IF EXISTS idx_goal_kpis_goal;
        DROP INDEX IF EXISTS idx_goal_kpis_kpi;

        CREATE TABLE goal_kpis_v12 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          goal_id INTEGER NOT NULL REFERENCES strategic_goals(id) ON DELETE RESTRICT,
          kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE RESTRICT,
          is_required INTEGER NOT NULL DEFAULT 1 CHECK (is_required IN (0,1)),
          weight REAL NOT NULL DEFAULT 1 CHECK (weight >= 0),
          display_order INTEGER NOT NULL DEFAULT 0,
          effective_from_year INTEGER NOT NULL
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

        INSERT INTO goal_kpis_v12 (
          id, goal_id, kpi_id, is_required, weight, display_order,
          effective_from_year, effective_to_year, archived_at, created_by,
          created_at, updated_by, updated_at
        )
        SELECT id, goal_id, kpi_id, is_required, weight, display_order,
               effective_from_year, effective_to_year, archived_at, created_by,
               created_at, updated_by, updated_at
        FROM goal_kpis;

        DROP TABLE goal_kpis;
        ALTER TABLE goal_kpis_v12 RENAME TO goal_kpis;
        CREATE INDEX idx_goal_kpis_goal ON goal_kpis(goal_id, display_order);
        CREATE INDEX idx_goal_kpis_kpi ON goal_kpis(kpi_id);

        DROP INDEX IF EXISTS idx_kpi_targets_kpi_unique;
        DROP INDEX IF EXISTS idx_kpi_targets_component_unique;
        DROP INDEX IF EXISTS idx_kpi_targets_year;

        CREATE TABLE kpi_targets_v12 (
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
          CHECK (baseline_year IS NULL OR baseline_year < target_year)
        );

        INSERT INTO kpi_targets_v12 (
          id, kpi_id, component_id, target_scope, reporting_year, target_year,
          external_target_year, target_value, structured_target_json,
          target_description, baseline_year, baseline_value,
          configuration_status, source_reference, last_reviewed_date,
          archived_at, created_by, created_at, updated_by, updated_at
        )
        SELECT id, kpi_id, component_id, target_scope, reporting_year, target_year,
               external_target_year, target_value, structured_target_json,
               target_description, baseline_year, baseline_value,
               configuration_status, source_reference, last_reviewed_date,
               archived_at, created_by, created_at, updated_by, updated_at
        FROM kpi_targets;

        DROP TABLE kpi_targets;
        ALTER TABLE kpi_targets_v12 RENAME TO kpi_targets;
        CREATE UNIQUE INDEX idx_kpi_targets_kpi_unique
          ON kpi_targets(kpi_id, target_scope, COALESCE(reporting_year, -1), target_year)
          WHERE kpi_id IS NOT NULL;
        CREATE UNIQUE INDEX idx_kpi_targets_component_unique
          ON kpi_targets(component_id, target_scope, COALESCE(reporting_year, -1), target_year)
          WHERE component_id IS NOT NULL;
        CREATE INDEX idx_kpi_targets_year
          ON kpi_targets(target_year, reporting_year, configuration_status);
      `);

      const violations = raw.prepare("PRAGMA foreign_key_check").all();
      if (violations.length > 0) {
        throw new Error(
          `Schema 12 installation migration produced ${violations.length} foreign-key violation(s).`,
        );
      }
      raw.exec(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '12');",
      );
      raw.exec(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_12_content_migration_pending', '1');",
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
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '10');",
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

/** Implements the ensure meta table operation. */
function ensureMetaTable(raw: DatabaseSync): void {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

/** Applies the initialize strategic schema operation. */
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
      plan_start_year INTEGER NOT NULL
        CHECK (plan_start_year BETWEEN 1900 AND 2100),
      plan_end_year INTEGER NOT NULL
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
      effective_from_year INTEGER NOT NULL
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

/** Applies the initialize schema operation. */
function initializeSchema(raw: DatabaseSync): void {
  initializeInstallationSchema(raw);
  raw.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES strategic_plans(id) ON DELETE RESTRICT,
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
  initializeBoardReportingSchema(raw);
  initializeUserLifecycleAuditSchema(raw);
  initializePlanLifecycleSchema(raw);
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
