import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb, SCHEMA_VERSION } from "@/lib/db";

/**
 * Atomicity contract for the additive v13→v14 and v14→v15 migration steps
 * (lane_sqlite carryover): each step's DDL, one-time bootstrap marker, and
 * schema_version record must commit or roll back as one unit. A fault
 * injected at the first meta write must leave the database exactly at its
 * pre-migration state, and the next startup must retry cleanly.
 */

let tmpDir = "";
let dbPath = "";
let originalDbPath: string | undefined;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-schema-atomicity-"));
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

describe("additive migration step atomicity", () => {
  it("preserves the migration error when rejected-connection cleanup also fails", () => {
    const raw = new DatabaseSync(dbPath);
    raw.exec(`
      CREATE TABLE meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO meta (key, value)
      VALUES ('schema_version', '${SCHEMA_VERSION + 1}');
    `);
    raw.close();

    const closeDescriptor = Object.getOwnPropertyDescriptor(
      DatabaseSync.prototype,
      "close",
    );
    if (typeof closeDescriptor?.value !== "function") {
      throw new Error("DatabaseSync.close is unavailable.");
    }
    const originalClose = closeDescriptor.value as (
      this: DatabaseSync,
    ) => void;
    const closeSpy = vi
      .spyOn(DatabaseSync.prototype, "close")
      .mockImplementation(function (this: DatabaseSync) {
        Reflect.apply(originalClose, this, []);
        throw new Error("injected close failure");
      });

    try {
      expect(() => getDb()).toThrow(
        `Database schema version ${SCHEMA_VERSION + 1} is newer than this application supports (${SCHEMA_VERSION}).`,
      );
      expect(closeSpy).toHaveBeenCalledTimes(1);
    } finally {
      closeSpy.mockRestore();
    }
  });

  it("rolls back the whole v13 -> v14 step when the version record write fails", () => {
    seedCurrentDatabase();
    downgradeToV13();
    installMetaInsertFaultTrigger();

    resetDb();
    expect(() => getDb()).toThrow();

    const probe = new DatabaseSync(dbPath, { readOnly: true });
    try {
      expect(metaValue(probe, "schema_version")).toBe("13");
      expect(metaValue(probe, "board_reporting_scope_initialized")).toBeUndefined();
      for (const table of [
        "board_reporting_scopes",
        "board_reporting_priorities",
        "board_reporting_statements",
        "board_reporting_statement_kpis",
        "board_reporting_audit_events",
        "user_lifecycle_audit_events",
      ]) {
        expect(tableExists(probe, table)).toBe(false);
      }
    } finally {
      probe.close();
    }

    // The fault is removed: the next startup must retry and converge.
    removeMetaInsertFaultTrigger();
    resetDb();
    const healed = getDb();
    expect(
      (healed.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as {
        value: string;
      }).value,
    ).toBe("16");
  });

  it("rolls back the whole v14 -> v15 step when the version record write fails", () => {
    seedCurrentDatabase();
    const db = getDb();
    db.exec(`
      DROP TABLE user_lifecycle_audit_events;
      INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '14');
    `);
    installMetaInsertFaultTrigger();

    resetDb();
    expect(() => getDb()).toThrow();

    const probe = new DatabaseSync(dbPath, { readOnly: true });
    try {
      expect(metaValue(probe, "schema_version")).toBe("14");
      expect(tableExists(probe, "user_lifecycle_audit_events")).toBe(false);
      // The v14 board-reporting storage was committed by the earlier,
      // independently transactional step and must be untouched.
      expect(tableExists(probe, "board_reporting_scopes")).toBe(true);
    } finally {
      probe.close();
    }

    removeMetaInsertFaultTrigger();
    resetDb();
    const healed = getDb();
    expect(
      (healed.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as {
        value: string;
      }).value,
    ).toBe("16");
  });

  it("rolls back the whole v15 -> v16 lifecycle step when the version record write fails", () => {
    seedCurrentDatabase();
    downgradeToV15();
    installMetaInsertFaultTrigger();

    resetDb();
    expect(() => getDb()).toThrow();

    const probe = new DatabaseSync(dbPath, { readOnly: true });
    try {
      expect(metaValue(probe, "schema_version")).toBe("15");
      for (const table of [
        "plan_section_reviews",
        "successor_lineage",
        "plan_item_reviews",
        "plan_question_decisions",
        "plan_readiness_overrides",
        "strategic_plan_lifecycle_events",
        "plan_activation_operations",
        "activation_recovery_audit_events",
      ]) {
        expect(tableExists(probe, table)).toBe(false);
      }
    } finally {
      probe.close();
    }

    removeMetaInsertFaultTrigger();
    resetDb();
    const healed = getDb();
    expect(metaValue(healed as unknown as DatabaseSync, "schema_version")).toBe("16");
    expect(
      healed.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'plan_activation_operations'",
      ).get(),
    ).toEqual({ name: "plan_activation_operations" });
    expect(
      healed
        .prepare("PRAGMA table_info(plan_activation_operations)")
        .all()
        .some((column) => column.name === "committed_write_counter"),
    ).toBe(true);
    expect(
      healed
        .prepare(
          "SELECT value FROM meta WHERE key = 'authoritative_write_counter'",
        )
        .get(),
    ).toEqual({ value: "0" });
    expect(
      Number(
        (
          healed
            .prepare(
              `SELECT COUNT(*) AS count FROM sqlite_master
               WHERE type = 'trigger'
                 AND name LIKE '%_activation_write_counter_%'`,
            )
            .get() as { count: number }
        ).count,
      ),
    ).toBeGreaterThan(0);
  });
});

/** Creates a fresh current-schema database through the app boundary. */
function seedCurrentDatabase(): void {
  getDb();
}

/** Rewinds the current database to the schema-13 shape. */
function downgradeToV13(): void {
  const db = getDb();
  db.exec(`
    DROP TABLE board_reporting_audit_events;
    DROP TABLE board_reporting_statement_kpis;
    DROP TABLE board_reporting_statements;
    DROP TABLE board_reporting_priorities;
    DROP TABLE board_reporting_scopes;
    DROP TABLE user_lifecycle_audit_events;
    DELETE FROM meta WHERE key = 'board_reporting_scope_initialized';
    INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '13');
  `);
}

/** Rewinds lifecycle-only objects while retaining the complete schema-15 data. */
function downgradeToV15(): void {
  const db = getDb();
  const triggers = db.prepare(
    `SELECT name FROM sqlite_master
     WHERE type = 'trigger' AND (
       name LIKE '%_plan_%' OR
       name LIKE '%_activation_pause_%' OR
       name LIKE '%_activation_write_counter_%' OR
       name LIKE 'strategic_plans_%' OR
       name LIKE 'successor_lineage_%' OR
       name LIKE 'plan_lifecycle_events_%' OR
       name LIKE 'activation_recovery_events_%'
     )`,
  ).all() as Array<{ name: string }>;
  for (const trigger of triggers) {
    db.exec(`DROP TRIGGER "${trigger.name.replaceAll('"', '""')}"`);
  }
  db.exec(`
    DROP TABLE activation_recovery_audit_events;
    DROP TABLE plan_activation_operations;
    DROP TABLE strategic_plan_lifecycle_events;
    DROP TABLE plan_readiness_overrides;
    DROP TABLE plan_question_decisions;
    DROP TABLE plan_item_reviews;
    DROP TABLE successor_lineage;
    DROP TABLE plan_section_reviews;
    DELETE FROM meta WHERE key IN (
      'plan_activation_write_pause',
      'plan_activation_internal_write',
      'active_plan_integrity_blocked',
      'authoritative_write_counter'
    );
    INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '15');
  `);
}

/** Installs a persistent trigger that aborts the next meta INSERT. */
function installMetaInsertFaultTrigger(): void {
  const db = getDb();
  // Scoped to the schema_version write so the fault lands inside the
  // migration step under test, not on an unrelated meta insert.
  db.exec(`
    CREATE TRIGGER injected_meta_insert_fault
    BEFORE INSERT ON meta
    WHEN NEW.key = 'schema_version'
    BEGIN
      SELECT RAISE(ABORT, 'injected migration fault');
    END;
  `);
}

/** Removes the fault trigger through a direct connection. */
function removeMetaInsertFaultTrigger(): void {
  const raw = new DatabaseSync(dbPath);
  try {
    raw.exec("DROP TRIGGER IF EXISTS injected_meta_insert_fault;");
  } finally {
    raw.close();
  }
}

/** Reads one meta value through a raw connection. */
function metaValue(raw: DatabaseSync, key: string): string | undefined {
  const row = raw.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value?: string }
    | undefined;
  return row?.value;
}

/** Reports whether a table exists in the database file. */
function tableExists(raw: DatabaseSync, table: string): boolean {
  return (
    raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table) !== undefined
  );
}
