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
  it.each([12, 13])(
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
      ).toEqual({ value: "14" });
      verify.close();
    },
  );

  it("leaves a populated schema-14 database intact when sample_data metadata is absent", () => {
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

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("leaving existing data intact");
    const verify = new DatabaseSync(databasePath);
    expect(
      verify.prepare("SELECT name FROM categories WHERE id = 1").get(),
    ).toEqual({ name: "Production category" });
    verify.close();
  });

  it("fails closed when the database probe cannot prove an empty disposable database", () => {
    const databasePath = tempDatabase();
    fs.writeFileSync(databasePath, "not a sqlite database", "utf8");

    const result = runEnsureSeeded(databasePath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Refusing destructive sample reseed");
  });

  it("refuses to reseed an empty catalog when snapshot audit rows remain", () => {
    const databasePath = tempDatabase();
    const db = new DatabaseSync(databasePath);
    db.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO meta (key, value) VALUES ('schema_version', '14');
      CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE strategic_audit_events (id INTEGER PRIMARY KEY);
      INSERT INTO strategic_audit_events DEFAULT VALUES;
    `);
    db.close();

    const result = runEnsureSeeded(databasePath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("retains KPI-owned business or audit rows");
    expect(result.stderr).toContain("Refusing destructive sample reseed");
  });

  it("refuses to reseed an empty catalog when Board reporting audit rows remain", () => {
    const databasePath = tempDatabase();
    const db = new DatabaseSync(databasePath);
    db.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO meta (key, value) VALUES ('schema_version', '14');
      CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE board_reporting_audit_events (id INTEGER PRIMARY KEY);
      INSERT INTO board_reporting_audit_events DEFAULT VALUES;
    `);
    db.close();

    const result = runEnsureSeeded(databasePath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("retains KPI-owned business or audit rows");
    expect(result.stderr).toContain("Refusing destructive sample reseed");
  });
});

/** Supports the temp database test scenario. */
function tempDatabase(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ensure-seeded-"));
  tempDirectories.push(directory);
  return path.join(directory, "kpi.db");
}

/** Supports the run ensure seeded test scenario. */
function runEnsureSeeded(databasePath: string) {
  return spawnSync(process.execPath, ["scripts/ensure-seeded.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_PATH: databasePath },
    encoding: "utf8",
  });
}

/** Runs a TypeScript repository script against an isolated database. */
function runTsx(script: string, databasePath: string) {
  return spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", script], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_PATH: databasePath },
    encoding: "utf8",
  });
}
