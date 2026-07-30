import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("ensure-seeded destructive reset guard", () => {
  it("authorizes a proven-safe automatic production seed with the resolved database confirmation", () => {
    const databasePath = tempDatabase();
    const result = runEnsureSeeded(
      databasePath,
      [],
      { NODE_ENV: "production", AUTH_DISABLED: "" },
    );

    expect(result.status, result.stderr).toBe(0);
    const verify = new DatabaseSync(databasePath, { readOnly: true });
    expect(
      verify.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get(),
    ).toEqual({ value: "15" });
    expect(
      verify
        .prepare("SELECT value FROM meta WHERE key = 'last_seed_reset_at'")
        .get(),
    ).toEqual({ value: expect.any(String) });
    verify.close();
  });

  it.each([12, 13, 14])(
    "migrates a populated schema-%i additive predecessor without reseeding it",
    (schemaVersion) => {
      const databasePath = tempDatabase();
      const seeded = runTsx("scripts/seed.ts", databasePath);
      expect(seeded.status, seeded.stderr).toBe(0);
      const before = new DatabaseSync(databasePath);
      before.prepare("UPDATE categories SET name = 'Preserve this category' WHERE id = 1").run();
      before.prepare("UPDATE meta SET value = ? WHERE key = 'schema_version'")
        .run(String(schemaVersion));
      before.close();

      const result = runEnsureSeeded(databasePath);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(`schema ${schemaVersion} is an additive predecessor`);
      const verify = new DatabaseSync(databasePath);
      expect(
        verify.prepare("SELECT name FROM categories WHERE id = 1").get(),
      ).toEqual({ name: "Preserve this category" });
      expect(
        verify.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get(),
      ).toEqual({ value: "15" });
      verify.close();
    },
  );

  it("preserves but refuses an incomplete schema-15 database", () => {
    const databasePath = tempDatabase();
    const db = new DatabaseSync(databasePath);
    db.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO meta (key, value) VALUES ('schema_version', '15');
      CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      INSERT INTO categories (name) VALUES ('Production category');
    `);
    db.close();

    const result = runEnsureSeeded(databasePath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"event":"startup_failure"');
    expect(result.stderr).toContain('"reason":"database_incompatible"');
    expect(result.stderr).toContain("refusing to start");
    const verify = new DatabaseSync(databasePath);
    expect(
      verify.prepare("SELECT name FROM categories WHERE id = 1").get(),
    ).toEqual({ name: "Production category" });
    verify.close();
  });

  it("preserves but refuses an incomplete schema-14 additive predecessor", () => {
    // Schema 14 is an additive predecessor, so initialization runs the
    // migration; the schema steps succeed but the post-migration content
    // probe fails loudly on the missing business tables, so startup refuses
    // WITHOUT reseeding or touching the production rows.
    const databasePath = tempDatabase();
    const db = new DatabaseSync(databasePath);
    db.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO meta (key, value) VALUES ('schema_version', '14');
      CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      INSERT INTO categories (name) VALUES ('Production category');
    `);
    db.close();

    const result = runEnsureSeeded(databasePath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"event":"migration_failure"');
    expect(result.stderr).toContain('"reason":"migration_command_failed"');
    expect(result.stderr).not.toContain("running sample seed");
    const verify = new DatabaseSync(databasePath);
    expect(
      verify.prepare("SELECT name FROM categories WHERE id = 1").get(),
    ).toEqual({ name: "Production category" });
    expect(
      verify.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get(),
    ).toEqual({ value: "15" });
    verify.close();
  });

  it("fails closed when the database probe cannot prove an empty disposable database", () => {
    const databasePath = tempDatabase();
    fs.writeFileSync(databasePath, "not a sqlite database", "utf8");

    const result = runEnsureSeeded(databasePath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"event":"startup_failure"');
    expect(result.stderr).toContain('"reason":"database_unavailable"');
    expect(result.stderr).toContain("not safe for an automatic sample reseed");
    expect(result.stderr).not.toContain(databasePath);
    expect(result.stderr).not.toMatch(/file is not a database|stack/i);
  });

  it.each([
    ["production_migration_state", "in_progress", "migration_in_progress"],
    [
      "schema_12_content_migration_pending",
      "1",
      "initialization_incomplete",
    ],
  ])(
    "refuses startup when %s remains set",
    (key, value, expectedReason) => {
      const databasePath = tempDatabase();
      expect(runTsx("scripts/seed.ts", databasePath).status).toBe(0);
      const database = new DatabaseSync(databasePath);
      database
        .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)")
        .run(key, value);
      database.close();

      const result = runEnsureSeeded(databasePath);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('"event":"startup_failure"');
      expect(result.stderr).toContain(`"reason":"${expectedReason}"`);
      expect(result.stderr).not.toContain(databasePath);
    },
  );

  it("refuses to reseed an empty catalog when snapshot audit rows remain", () => {
    const databasePath = tempDatabase();
    const db = new DatabaseSync(databasePath);
    db.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO meta (key, value) VALUES ('schema_version', '15');
      CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE strategic_audit_events (id INTEGER PRIMARY KEY);
      INSERT INTO strategic_audit_events DEFAULT VALUES;
    `);
    db.close();

    const result = runEnsureSeeded(databasePath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"event":"startup_failure"');
    expect(result.stderr).toContain('"reason":"unsafe_seed_refused"');
    expect(result.stderr).toContain("not safe for an automatic sample reseed");
  });

  it("refuses to reseed an empty catalog when Board reporting audit rows remain", () => {
    const databasePath = tempDatabase();
    const db = new DatabaseSync(databasePath);
    db.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO meta (key, value) VALUES ('schema_version', '15');
      CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE board_reporting_audit_events (id INTEGER PRIMARY KEY);
      INSERT INTO board_reporting_audit_events DEFAULT VALUES;
    `);
    db.close();

    const result = runEnsureSeeded(databasePath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"event":"startup_failure"');
    expect(result.stderr).toContain('"reason":"unsafe_seed_refused"');
    expect(result.stderr).toContain("not safe for an automatic sample reseed");
  });

  it("refuses to reseed an empty catalog when strategic sidecar rows remain", () => {
    const databasePath = tempDatabase();
    const db = new DatabaseSync(databasePath);
    db.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO meta (key, value) VALUES ('schema_version', '15');
      CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE kpi_targets (id INTEGER PRIMARY KEY);
      INSERT INTO kpi_targets DEFAULT VALUES;
    `);
    db.close();

    const result = runEnsureSeeded(databasePath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"event":"startup_failure"');
    expect(result.stderr).toContain('"reason":"unsafe_seed_refused"');
    expect(result.stderr).toContain("not safe for an automatic sample reseed");
    const verify = new DatabaseSync(databasePath);
    expect(
      verify.prepare("SELECT COUNT(*) AS count FROM kpi_targets").get(),
    ).toEqual({ count: 1 });
    verify.close();
  });
});

/** Supports the temp database test scenario. */
function tempDatabase(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ensure-seeded-"));
  tempDirectories.push(directory);
  return path.join(directory, "kpi.db");
}

/** Supports the run ensure seeded test scenario. */
function runEnsureSeeded(
  databasePath: string,
  args: string[] = [],
  env: Record<string, string> = {},
) {
  return spawnSync(process.execPath, ["scripts/ensure-seeded.mjs", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env, DATABASE_PATH: databasePath },
    encoding: "utf8",
  });
}

/** Runs a TypeScript repository script against an isolated database. */
function runTsx(script: string, databasePath: string) {
  return spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", script], {
    cwd: process.cwd(),
    // S053-C1: the destructive seed requires SEED_CONFIRM naming the
    // exact resolved database; these disposable test databases are
    // deliberate reset targets.
    env: {
      ...process.env,
      DATABASE_PATH: databasePath,
      SEED_CONFIRM: databasePath,
    },
    encoding: "utf8",
  });
}
