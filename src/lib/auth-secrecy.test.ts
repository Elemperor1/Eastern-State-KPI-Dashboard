import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { ensureSeedAdmin } from "@/features/auth/server";
import {
  createUser,
  findUserByEmail,
  updateUserPassword,
  updateUserPasswordIfCurrent,
} from "@/features/users/server";
import { getDb, resetDb } from "./db";

/**
 * Security regression tests for first-run account provisioning (D8AD-CAN-001).
 *
 * The invariant this file guards: NO usable credential — the bootstrap
 * admin/viewer password, an operator setup password, or any equivalent
 * authentication secret — is ever written to stdout, stderr, or process
 * logs. We prove this two ways:
 *
 *   1. In-process: spy on console.log/warn/error and process.stdout/stderr
 *      while ensureSeedAdmin() runs with a KNOWN sentinel password, then
 *      assert the sentinel never appears in the captured output — while
 *      simultaneously proving (via bcrypt.compare) that the sentinel IS
 *      the actual stored credential, so its absence from logs is
 *      meaningful rather than vacuous.
 *   2. End-to-end: spawn the real `npm run db:seed` and `npm run setup:admin`
 *      child processes with sentinel env vars and capture their actual
 *      stdout/stderr, asserting the sentinel never appears.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..");

/** Supports the make temp dir test scenario. */
function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Capture everything written to console.log/warn/error and to
 *  process.stdout/stderr during `fn`. Returns the joined output. */
function captureOutput(fn: () => void): {
  stdout: string;
  stderr: string;
  all: string;
} {
  const out: string[] = [];
  const err: string[] = [];
  const spies = [
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      out.push(a.map((x) => String(x)).join(" "));
    }),
    vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => {
      err.push(a.map((x) => String(x)).join(" "));
    }),
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
      err.push(a.map((x) => String(x)).join(" "));
    }),
    vi.spyOn(process.stdout, "write").mockImplementation((s: unknown) => {
      out.push(String(s));
      return true;
    }),
    vi.spyOn(process.stderr, "write").mockImplementation((s: unknown) => {
      err.push(String(s));
      return true;
    }),
  ];
  try {
    fn();
  } finally {
    spies.forEach((s) => s.mockRestore());
  }
  const stdout = out.join("\n");
  const stderr = err.join("\n");
  return { stdout, stderr, all: `${stdout}\n${stderr}` };
}

/** A 20+ char run of base64 alphabet is a strong proxy for a leaked
 *  generated password (24-char base64) or bcrypt hash. Status messages
 *  contain only emails / env-var names / prose, none of which contain a
 *  20-char base64 run (env-var names use underscores, which break the
 *  run). Used for the random-fallback path where the plaintext is
 *  unknown, so we cannot assert a specific sentinel is absent. */
const SECRET_LIKE = /[A-Za-z0-9+/]{20,}/g;

/** Read a user's stored hash + rotation flag via the shared getDb()
 *  connection (the same connection ensureSeedAdmin / updateUserPassword
 *  write through). Reading through a separate DatabaseSync connection
 *  would not reliably see WAL data held by the open writer connection,
 *  so we reuse getDb() — the caller ensures DATABASE_PATH points at the
 *  right file and resetDb() has been called when switching files. */
function readHash(email: string): {
  hash: string;
  must_change: number;
} {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT password_hash AS hash, must_change_password AS must_change FROM users WHERE email = ?",
    )
    .get(email.toLowerCase().trim()) as
    | { hash?: string; must_change?: number }
    | undefined;
  if (!row || !row.hash) throw new Error(`no row for ${email} in active DB`);
  return { hash: row.hash, must_change: Number(row.must_change ?? 0) };
}

/** Point getDb() at `dbPath` (used by the e2e tests to read a database
 *  file a child process just wrote). */
function useDbFile(dbPath: string): void {
  process.env.DATABASE_PATH = dbPath;
  resetDb();
}

describe("ensureSeedAdmin credential secrecy (in-process)", () => {
  let tmpDir: string;
  let dbPath: string;
  let originalDbPath: string | undefined;
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    tmpDir = makeTempDir("es-kpi-secrecy-");
    dbPath = path.join(tmpDir, "test.db");
    originalDbPath = process.env.DATABASE_PATH;
    for (const k of [
      "BOOTSTRAP_ADMIN_PASSWORD",
      "BOOTSTRAP_VIEWER_PASSWORD",
    ]) {
      originalEnv[k] = process.env[k];
    }
  });

  afterAll(() => {
    if (originalDbPath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = originalDbPath;
    }
    for (const k of Object.keys(originalEnv)) {
      if (originalEnv[k] === undefined) delete process.env[k];
      else process.env[k] = originalEnv[k];
    }
    resetDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Fresh DB file per test.
    fs.rmSync(dbPath, { force: true });
    process.env.DATABASE_PATH = dbPath;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    delete process.env.BOOTSTRAP_VIEWER_PASSWORD;
    resetDb();
  });

  it("never writes the operator-provided bootstrap passwords to stdout/stderr", () => {
    const adminSentinel = "SENTINEL-Admin-DoNotLog-2026!";
    const viewerSentinel = "SENTINEL-Viewer-DoNotLog-2026!";
    process.env.BOOTSTRAP_ADMIN_PASSWORD = adminSentinel;
    process.env.BOOTSTRAP_VIEWER_PASSWORD = viewerSentinel;

    const { stdout, stderr, all } = captureOutput(() => ensureSeedAdmin());

    // The sentinels must NOT appear anywhere in captured output.
    expect(stdout).not.toContain(adminSentinel);
    expect(stdout).not.toContain(viewerSentinel);
    expect(stderr).not.toContain(adminSentinel);
    expect(stderr).not.toContain(viewerSentinel);
    expect(all).not.toContain(adminSentinel);
    expect(all).not.toContain(viewerSentinel);

    // The sentinels ARE the actual stored credentials — so their absence
    // from logs is meaningful, not vacuous. If this ever flips to false,
    // either the env secret stopped being used or it stopped being
    // hashed into the row; either way the secrecy assertion above
    // becomes worthless and must be re-grounded.
    const admin = readHash("kerry@easternstate.org");
    const viewer = readHash("zach@easternstate.org");
    expect(bcrypt.compareSync(adminSentinel, admin.hash)).toBe(true);
    expect(bcrypt.compareSync(viewerSentinel, viewer.hash)).toBe(true);

    // Bootstrap credentials are temporary: must_change_password is set.
    expect(admin.must_change).toBe(1);
    expect(viewer.must_change).toBe(1);
  });

  it("emits a non-sensitive status line naming the provisioned accounts", () => {
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "SENTINEL-Admin-DoNotLog-2026!";
    process.env.BOOTSTRAP_VIEWER_PASSWORD = "SENTINEL-Viewer-DoNotLog-2026!";

    const { stdout } = captureOutput(() => ensureSeedAdmin());

    expect(stdout).toContain("kerry@easternstate.org");
    expect(stdout).toContain("zach@easternstate.org");
    // Status references the env-var source, never the plaintext.
    expect(stdout).toContain("BOOTSTRAP_ADMIN_PASSWORD");
    // No warning is emitted when both secrets were operator-provided.
    expect(stdout).toMatch(/provisioned 2 bootstrap account/);
  });

  it("does not log a secret when falling back to random passwords (no env)", () => {
    // No BOOTSTRAP_*_PASSWORD set -> random fallback path. We do not know
    // the plaintext, so assert no secret-like token appears in output at
    // all, and that the operator is told to use setup:admin.
    const { stderr, all } = captureOutput(() => ensureSeedAdmin());

    const secretMatches = all.match(SECRET_LIKE) ?? [];
    // bcrypt hashes of the bypass row are NOT logged, and no plaintext
    // password is logged, so no 20+ char base64 run should appear.
    expect(secretMatches.length).toBe(0);

    // Accounts still provisioned + marked temporary.
    const admin = readHash("kerry@easternstate.org");
    const viewer = readHash("zach@easternstate.org");
    expect(admin.must_change).toBe(1);
    expect(viewer.must_change).toBe(1);
    expect(admin.hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(viewer.hash).toMatch(/^\$2[aby]\$\d{2}\$/);

    // Operator is warned (non-sensitively) that the credential is random
    // and points them at the setup command.
    expect(stderr).toContain("setup:admin");
    expect(stderr).not.toMatch(/password[: ]+\S{8,}/i);
  });

  it("does not regenerate or re-log credentials on a retry against a seeded DB", () => {
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "SENTINEL-Admin-DoNotLog-2026!";
    process.env.BOOTSTRAP_VIEWER_PASSWORD = "SENTINEL-Viewer-DoNotLog-2026!";
    ensureSeedAdmin();
    const before = readHash("kerry@easternstate.org").hash;

    // A second call against the now-seeded DB must be a no-op for the
    // named accounts: same hash (no regeneration), and no sentinel
    // re-logged (no status line for the named accounts at all).
    const { all } = captureOutput(() => ensureSeedAdmin());
    const after = readHash("kerry@easternstate.org").hash;
    expect(after).toBe(before);
    expect(all).not.toContain("SENTINEL-Admin-DoNotLog-2026!");
    expect(all).not.toContain("provisioned 2 bootstrap account");
  });

  it("updateUserPassword(false) rotates the credential and clears must_change", () => {
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "SENTINEL-Admin-DoNotLog-2026!";
    ensureSeedAdmin();
    const kerry = findUserByEmail("kerry@easternstate.org")!;
    expect(kerry.must_change_password).toBe(true);

    const perm = "NewPermanentPass!2026";
    updateUserPassword(kerry.id, perm, false);

    const row = readHash("kerry@easternstate.org");
    expect(row.must_change).toBe(0);
    expect(bcrypt.compareSync(perm, row.hash)).toBe(true);
    // The old temporary credential no longer works.
    expect(bcrypt.compareSync("SENTINEL-Admin-DoNotLog-2026!", row.hash)).toBe(
      false,
    );
  });

  it("updateUserPassword(true) marks an admin-issued reset as temporary", () => {
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "SENTINEL-Admin-DoNotLog-2026!";
    ensureSeedAdmin();
    const kerry = findUserByEmail("kerry@easternstate.org")!;

    const temp = "AdminIssuedTemp!2026";
    updateUserPassword(kerry.id, temp, true);
    const row = readHash("kerry@easternstate.org");
    expect(row.must_change).toBe(1);
    expect(bcrypt.compareSync(temp, row.hash)).toBe(true);
  });

  it("rejects a stale self-service password write after an administrator reset", () => {
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "SENTINEL-Admin-DoNotLog-2026!";
    ensureSeedAdmin();
    const kerry = findUserByEmail("kerry@easternstate.org")!;
    const staleHash = readHash(kerry.email).hash;

    updateUserPassword(kerry.id, "AdministratorReset!2026", true);
    const changed = updateUserPasswordIfCurrent(
      kerry.id,
      staleHash,
      "StaleSelfService!2026",
      false,
    );

    expect(changed).toBe(false);
    const row = readHash(kerry.email);
    expect(bcrypt.compareSync("AdministratorReset!2026", row.hash)).toBe(true);
    expect(bcrypt.compareSync("StaleSelfService!2026", row.hash)).toBe(false);
  });
});

describe("ensureSeedAdmin credential secrecy (end-to-end child process)", () => {
  const adminSentinel = "SENTINEL-Admin-DoNotLog-2026!";
  const viewerSentinel = "SENTINEL-Viewer-DoNotLog-2026!";
  let tmpDir: string;
  let dbPath: string;

  beforeAll(() => {
    tmpDir = makeTempDir("es-kpi-secrecy-e2e-");
    dbPath = path.join(tmpDir, "seed.db");
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    fs.rmSync(dbPath, { force: true });
  });

  /** Supports the child env test scenario. */
  function childEnv(overrides: Record<string, string>): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    // Strip any pre-existing bootstrap/setup secrets from the ambient
    // environment so the only ones the child sees are the sentinels we
    // set explicitly.
    delete env.BOOTSTRAP_ADMIN_PASSWORD;
    delete env.BOOTSTRAP_VIEWER_PASSWORD;
    delete env.SETUP_ADMIN_PASSWORD;
    delete env.SETUP_ADMIN_EMAIL;
    Object.assign(env, overrides);
    return env;
  }

  it("npm run db:seed never writes the bootstrap passwords to stdout/stderr", () => {
    const res = spawnSync("npm", ["run", "db:seed"], {
      cwd: REPO_ROOT,
      env: childEnv({
        DATABASE_PATH: dbPath,
        BOOTSTRAP_ADMIN_PASSWORD: adminSentinel,
        BOOTSTRAP_VIEWER_PASSWORD: viewerSentinel,
      }),
      encoding: "utf8",
    });
    if (res.status !== 0) {
      throw new Error(
        `db:seed failed (status ${res.status}): stdout=${res.stdout}\nstderr=${res.stderr}`,
      );
    }
    const out = `${res.stdout ?? ""}\n${res.stderr ?? ""}`;
    // The real credentials must not appear in the actual child output.
    expect(out).not.toContain(adminSentinel);
    expect(out).not.toContain(viewerSentinel);
    // The seed did run and reported the accounts (non-sensitive).
    expect(out).toContain("kerry@easternstate.org");
    // And the sentinels really were the stored credentials.
    useDbFile(dbPath);
    const admin = readHash("kerry@easternstate.org");
    const viewer = readHash("zach@easternstate.org");
    expect(bcrypt.compareSync(adminSentinel, admin.hash)).toBe(true);
    expect(bcrypt.compareSync(viewerSentinel, viewer.hash)).toBe(true);
    expect(admin.must_change).toBe(1);
    expect(viewer.must_change).toBe(1);
  }, 120000);

  it("npm run setup:admin never writes the new password to stdout/stderr", () => {
    // Seed first (random fallback) so the target account exists.
    const seedRes = spawnSync("npm", ["run", "db:seed"], {
      cwd: REPO_ROOT,
      env: childEnv({ DATABASE_PATH: dbPath }),
      encoding: "utf8",
    });
    expect(seedRes.status).toBe(0);

    const newPass = "SetupAdminPerm!2026";
    const res = spawnSync("npm", ["run", "setup:admin"], {
      cwd: REPO_ROOT,
      env: childEnv({
        DATABASE_PATH: dbPath,
        SETUP_ADMIN_PASSWORD: newPass,
        SETUP_ADMIN_EMAIL: "kerry@easternstate.org",
      }),
      encoding: "utf8",
    });
    if (res.status !== 0) {
      throw new Error(
        `setup:admin failed (status ${res.status}): stdout=${res.stdout}\nstderr=${res.stderr}`,
      );
    }
    const out = `${res.stdout ?? ""}\n${res.stderr ?? ""}`;
    expect(out).not.toContain(newPass);
    expect(out).toContain("kerry@easternstate.org");
    expect(out).toContain("password updated");
    // The password was actually set and the rotation flag cleared.
    useDbFile(dbPath);
    const row = readHash("kerry@easternstate.org");
    expect(bcrypt.compareSync(newPass, row.hash)).toBe(true);
    expect(row.must_change).toBe(0);
  }, 120000);
});

describe("createUser default rotation flag", () => {
  let tmpDir: string;
  let dbPath: string;
  let originalDbPath: string | undefined;

  beforeAll(() => {
    tmpDir = makeTempDir("es-kpi-secrecy-create-");
    dbPath = path.join(tmpDir, "test.db");
    originalDbPath = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = dbPath;
    resetDb();
  });

  afterAll(() => {
    if (originalDbPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDbPath;
    resetDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("defaults must_change_password to false for a normal new user", () => {
    const u = createUser({
      email: "normal@example.com",
      name: "Normal User",
      password: "NormalPass!2026",
      role: "viewer",
    });
    expect(u.must_change_password).toBe(false);
    const db = getDb();
    const row = db
      .prepare("SELECT must_change_password FROM users WHERE id = ?")
      .get(u.id) as { must_change_password: number };
    expect(row.must_change_password).toBe(0);
  });
});
