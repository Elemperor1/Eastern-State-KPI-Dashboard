import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "..");

interface SetupResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Runs the real operator command against the isolated test database. */
function runSetup(
  dbPath: string,
  overrides: Record<string, string>,
): SetupResult {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.SETUP_ADMIN_PASSWORD;
  delete env.SETUP_ADMIN_EMAIL;
  delete env.SETUP_ADMIN_CREATE_CONFIRM;
  Object.assign(env, { DATABASE_PATH: dbPath }, overrides);

  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/setup-admin.ts"],
    {
      cwd: REPO_ROOT,
      env,
      encoding: "utf8",
    },
  );
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/** Reads the number of matching real account rows after a child exits. */
function countUsers(dbPath: string, email: string): number {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = db
      .prepare("SELECT COUNT(*) AS count FROM users WHERE email = ?")
      .get(email) as { count: number | bigint };
    return Number(row.count);
  } finally {
    db.close();
  }
}

describe("setup:admin recovery guardrails", () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-setup-admin-"));
    dbPath = path.join(tempDir, "test.db");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates the requested active admin when the database has no active administrator", () => {
    const email = "recovery@example.org";
    const result = runSetup(dbPath, {
      SETUP_ADMIN_EMAIL: email,
      SETUP_ADMIN_PASSWORD: "RecoveryPass!2026",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("created a new ACTIVE ADMIN");
    expect(countUsers(dbPath, email)).toBe(1);
  }, 120000);

  it("refuses to create a missing requested account when an active administrator already exists", () => {
    const first = runSetup(dbPath, {
      SETUP_ADMIN_EMAIL: "existing-admin@example.org",
      SETUP_ADMIN_PASSWORD: "ExistingPass!2026",
    });
    expect(first.status, first.stderr).toBe(0);

    const requestedEmail = "typo-admin@example.org";
    const result = runSetup(dbPath, {
      SETUP_ADMIN_EMAIL: requestedEmail,
      SETUP_ADMIN_PASSWORD: "AccidentalPass!2026",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("active administrator already exists");
    expect(countUsers(dbPath, requestedEmail)).toBe(0);
  }, 120000);

  it("allows explicitly confirmed break-glass creation when an active administrator exists", () => {
    const first = runSetup(dbPath, {
      SETUP_ADMIN_EMAIL: "existing-admin@example.org",
      SETUP_ADMIN_PASSWORD: "ExistingPass!2026",
    });
    expect(first.status, first.stderr).toBe(0);

    const requestedEmail = "confirmed-admin@example.org";
    const result = runSetup(dbPath, {
      SETUP_ADMIN_EMAIL: requestedEmail,
      SETUP_ADMIN_PASSWORD: "ConfirmedPass!2026",
      SETUP_ADMIN_CREATE_CONFIRM: requestedEmail,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("created a new ACTIVE ADMIN");
    expect(countUsers(dbPath, requestedEmail)).toBe(1);
  }, 120000);

  it("rejects a password over the shared UTF-8 byte ceiling before opening the database", () => {
    const result = runSetup(dbPath, {
      SETUP_ADMIN_EMAIL: "recovery@example.org",
      SETUP_ADMIN_PASSWORD: "é".repeat(129),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("256 UTF-8 bytes");
    expect(fs.existsSync(dbPath)).toBe(false);
  }, 120000);
});
