import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * S053-C1: `db:seed` must refuse to wipe a database unless the operator
 * confirms the exact resolved path via SEED_CONFIRM, and must refuse
 * outright under NODE_ENV=production unless --force is passed. The
 * refusal happens before any database access, so these child runs are
 * fast failure paths; the authorized happy path is covered end-to-end
 * by src/lib/auth-secrecy.test.ts (which also asserts the tombstone).
 */

let workDir = "";
let dbPath = "";

beforeEach(() => {
  workDir = mkdtempSync(path.join(os.tmpdir(), "eskpi-seed-guard-"));
  dbPath = path.join(workDir, "kpi.db");
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db
    .prepare("INSERT INTO meta (key, value) VALUES ('marker', 'untouched')")
    .run();
  db.close();
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** Implements the run seed test scenario. */
function runSeed(overrides: Record<string, string>) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  delete env.SEED_CONFIRM;
  delete env.NODE_ENV;
  Object.assign(env, overrides);
  return spawnSync(
    path.join(process.cwd(), "node_modules", ".bin", "tsx"),
    ["scripts/seed.ts"],
    { cwd: process.cwd(), env: env as NodeJS.ProcessEnv, encoding: "utf8" },
  );
}

/** Implements the marker intact test scenario. */
function markerIntact(): boolean {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const row = db
    .prepare("SELECT value FROM meta WHERE key = 'marker'")
    .get() as { value?: string } | undefined;
  db.close();
  return row?.value === "untouched";
}

describe("db:seed destructive-reset guard (S053-C1)", () => {
  it("refuses to wipe when SEED_CONFIRM is unset", () => {
    const res = runSeed({ DATABASE_PATH: dbPath });

    expect(res.status).not.toBe(0);
    expect(`${res.stdout}\n${res.stderr}`).toContain("SEED_CONFIRM");
    expect(markerIntact()).toBe(true);
  });

  it("refuses to wipe when SEED_CONFIRM names a different path", () => {
    const res = runSeed({
      DATABASE_PATH: dbPath,
      SEED_CONFIRM: path.join(workDir, "some-other.db"),
    });

    expect(res.status).not.toBe(0);
    expect(`${res.stdout}\n${res.stderr}`).toContain("SEED_CONFIRM");
    expect(markerIntact()).toBe(true);
  });

  it("refuses under NODE_ENV=production without --force even when confirmed", () => {
    const res = runSeed({
      DATABASE_PATH: dbPath,
      SEED_CONFIRM: dbPath,
      NODE_ENV: "production",
    });

    expect(res.status).not.toBe(0);
    expect(`${res.stdout}\n${res.stderr}`).toContain("production");
    expect(markerIntact()).toBe(true);
  });
});
