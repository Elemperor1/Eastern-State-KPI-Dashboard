import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/lib/db";
import { checkReadiness } from "./readiness";

let fixtureDirectory = "";
let readyFixturePath = "";
const testDirectories: string[] = [];

beforeAll(() => {
  fixtureDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "eastern-state-kpi-readiness-fixture-"),
  );
  readyFixturePath = path.join(fixtureDirectory, "ready.db");
  const previousDatabasePath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = readyFixturePath;
  const db = getDb();
  const organizationId = Number(
    db
      .prepare(
        `INSERT INTO organizations (slug, name, short_name)
         VALUES ('readiness-organization', 'Readiness Organization', 'Readiness')`,
      )
      .run().lastInsertRowid,
  );
  const planId = Number(
    db
      .prepare(
        `INSERT INTO strategic_plans (
           organization_id, slug, name, start_year, end_year, status
         ) VALUES (?, 'readiness-plan', 'Readiness Plan', 2025, 2029, 'active')`,
      )
      .run(organizationId).lastInsertRowid,
  );
  const categoryId = Number(
    db
      .prepare(
        `INSERT INTO categories (plan_id, slug, name)
         VALUES (?, 'readiness-priority', 'Readiness Priority')`,
      )
      .run(planId).lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO kpis (
       category_id, slug, name, unit, unit_type, reporting_frequency, direction
     ) VALUES (?, 'readiness-measure', 'Readiness Measure', 'count', 'count', 'annual', 'higher')`,
  ).run(categoryId);
  resetDb();
  if (previousDatabasePath === undefined) {
    delete process.env.DATABASE_PATH;
  } else {
    process.env.DATABASE_PATH = previousDatabasePath;
  }
});

afterAll(() => {
  for (const directory of testDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  if (fixtureDirectory) {
    fs.rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

describe("production readiness database probe", () => {
  it("reports a compatible initialized database as ready without changing its content", () => {
    const databasePath = copyReadyFixture("healthy");
    const before = sha256(databasePath);

    expect(checkReadiness(databasePath)).toEqual({ ready: true });

    expect(sha256(databasePath)).toBe(before);
  });

  it("reports a missing database as unavailable without creating it", () => {
    const databasePath = path.join(tempDirectory("missing"), "missing.db");

    expect(checkReadiness(databasePath)).toEqual({
      ready: false,
      reason: "database_missing",
    });
    expect(fs.existsSync(databasePath)).toBe(false);
  });

  it("reports an incompatible schema without migrating it", () => {
    const databasePath = copyReadyFixture("incompatible");
    const db = new DatabaseSync(databasePath);
    db.prepare("UPDATE meta SET value = '13' WHERE key = 'schema_version'").run();
    db.close();
    const before = sha256(databasePath);

    expect(checkReadiness(databasePath)).toEqual({
      ready: false,
      reason: "database_incompatible",
    });

    expect(sha256(databasePath)).toBe(before);
    const verify = new DatabaseSync(databasePath, { readOnly: true });
    expect(
      verify.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get(),
    ).toEqual({ value: "13" });
    verify.close();
  });

  it("reports an existing path that cannot be opened as a database as unavailable", () => {
    const databasePath = tempDirectory("unavailable");

    expect(checkReadiness(databasePath)).toEqual({
      ready: false,
      reason: "database_unavailable",
    });
  });

  it("reports a locked database as unavailable without waiting indefinitely", () => {
    const databasePath = copyReadyFixture("locked");
    const lock = new DatabaseSync(databasePath);
    lock.exec("PRAGMA journal_mode = DELETE; BEGIN EXCLUSIVE");

    const startedAt = Date.now();
    expect(checkReadiness(databasePath)).toEqual({
      ready: false,
      reason: "database_unavailable",
    });
    expect(Date.now() - startedAt).toBeLessThan(1_000);

    lock.exec("ROLLBACK");
    lock.close();
  });

  it("fails closed while a production migration marker is present", () => {
    const databasePath = copyReadyFixture("migration-in-progress");
    const db = new DatabaseSync(databasePath);
    db.prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('production_migration_state', 'in_progress')",
    ).run();
    db.close();

    expect(checkReadiness(databasePath)).toEqual({
      ready: false,
      reason: "migration_in_progress",
    });
  });

  it("fails closed while required initialization remains pending", () => {
    const databasePath = copyReadyFixture("initialization-pending");
    const db = new DatabaseSync(databasePath);
    db.prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_12_content_migration_pending', '1')",
    ).run();
    db.close();

    expect(checkReadiness(databasePath)).toEqual({
      ready: false,
      reason: "initialization_incomplete",
    });
  });

  it("does not emit raw database errors from the probe", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const databasePath = path.join(tempDirectory("privacy"), "visitor-secret.db");

    checkReadiness(databasePath);

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

/** Copies the canonical ready fixture into an isolated test directory. */
function copyReadyFixture(name: string): string {
  const databasePath = path.join(tempDirectory(name), "kpi.db");
  fs.copyFileSync(readyFixturePath, databasePath);
  return databasePath;
}

/** Creates and tracks an isolated readiness test directory. */
function tempDirectory(name: string): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), `eastern-state-kpi-readiness-${name}-`),
  );
  testDirectories.push(directory);
  return directory;
}

/** Calculates a stable content digest for a database fixture. */
function sha256(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
