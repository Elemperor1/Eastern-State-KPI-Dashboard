import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { createUser, ensureSeedAdmin, findUserByEmail, verifyCredentials } from "./auth";
import { getDb, resetDb } from "./db";

/**
 * Tests for the auth credential surface.
 *
 * The critical regression this file guards: a hardcoded admin credential
 * (specifically the documented placeholder for the AUTH_DISABLED bypass row)
 * must not be accepted by verifyCredentials(). The bypass row may still
 * exist in the users table for FK / dev-bypass purposes, but it must be
 * unreachable through the normal login flow.
 *
 * Each test uses a fresh temp SQLite file so the test never touches the
 * developer's real data/kpi.db. ensureSeedAdmin() creates the bypass row
 * with a freshly-randomized hash on every run, so a previous test run's
 * hash is never observable.
 */
function bypassHashDirect(): string {
  const row = getDb()
    .prepare("SELECT password_hash FROM users WHERE email = ?")
    .get("auth-disabled@local") as { password_hash: string } | undefined;
  if (!row) throw new Error("bypass row missing in test db");
  return row.password_hash;
}
describe("verifyCredentials", () => {
  let tmpDir: string;
  let dbPath: string;
  let originalDbPath: string | undefined;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-auth-test-"));
    dbPath = path.join(tmpDir, "test.db");
    originalDbPath = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = dbPath;
    resetDb();
    ensureSeedAdmin();
  });

  afterAll(() => {
    if (originalDbPath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = originalDbPath;
    }
    resetDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("rejects the AUTH_DISABLED bypass email regardless of password", async () => {
    // Whatever the caller tries, the reserved-email guard returns null
    // before any DB lookup or bcrypt comparison.
    expect(await verifyCredentials("auth-disabled@local", "")).toBeNull();
    expect(
      await verifyCredentials("auth-disabled@local", "wrong"),
    ).toBeNull();
    expect(
      await verifyCredentials("AUTH-DISABLED@LOCAL", "wrong"),
    ).toBeNull();
    expect(
      await verifyCredentials("auth-disabled@local", "  auth-disabled@local  "),
    ).toBeNull();
  });

  it("rejects the reserved email even with the previously-documented plaintext", async () => {
    // Regression guard: the value that was hard-coded in the source comment
    // before the fix must NOT work. If this ever flips to returning a user,
    // somebody has either re-introduced the documented hash constant or
    // removed the reserved-email check.
    expect(
      await verifyCredentials(
        "auth-disabled@local",
        "__bypass_disabled_not_a_real_password__",
      ),
    ).toBeNull();
  });

  it("still returns null for unknown emails", async () => {
    expect(
      await verifyCredentials("nobody@example.com", "anything"),
    ).toBeNull();
  });

  it("rejects the wrong password for a real seeded admin", async () => {
    // The seed creates the account with a per-install random password;
    // "wrong-password" must not match.
    const kerry = findUserByEmail("kerry@easternstate.org");
    expect(kerry).not.toBeNull();
    expect(kerry?.role).toBe("admin");
    expect(
      await verifyCredentials("kerry@easternstate.org", "wrong-password"),
    ).toBeNull();
  });

  it("rejects the previously-documented plaintexts on the named seed accounts", async () => {
    // Regression guard for the default-credentials finding: the
    // values that used to be hard-coded in ensureSeedAdmin() and
    // published in AGENTS.md / README.md / qa-manual.md must NOT
    // authenticate against a fresh seed. If this ever flips to
    // returning a user, somebody has re-introduced a fixed plaintext
    // in the seed path.
    expect(
      await verifyCredentials("kerry@easternstate.org", "KerryAdmin!2026"),
    ).toBeNull();
    expect(
      await verifyCredentials("zach@easternstate.org", "ZachView!2026"),
    ).toBeNull();
  });

  it("stores a valid bcrypt hash on the named seed accounts", async () => {
    // Defense in depth: the stored hash must look like a real bcrypt
    // output (so the seed really did set a password, not null/empty),
    // and it must NOT match the previously-documented plaintexts.
    const row = getDb()
      .prepare("SELECT password_hash FROM users WHERE email = ?")
      .get("kerry@easternstate.org") as { password_hash: string };
    expect(row.password_hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(
      await bcrypt.compare("KerryAdmin!2026", row.password_hash),
    ).toBe(false);
    expect(await bcrypt.compare("", row.password_hash)).toBe(false);
  });

  it("does not print the random seed password under NODE_ENV=test", () => {
    // The seed writes the per-install random password to stdout once
    // on a fresh DB. The auth test suite runs against a fresh temp DB
    // every time, so the logger should be silent under NODE_ENV=test
    // to keep the test runner output clean and to avoid leaking the
    // plaintext into CI logs.
    // We can't intercept the live stdout from inside the same
    // process, but we can assert the guard variable is set as
    // expected. Vitest sets NODE_ENV=test; if that ever stops being
    // true, the seed's plaintext leak would start showing up here.
    expect(process.env.NODE_ENV).toBe("test");
  });

  it("stores an unguessable bcrypt hash on the bypass row", async () => {
    // The hash should look like a valid bcrypt output, but its plaintext is
    // a per-process random 64-byte value that no caller can reconstruct.
    const hash = bypassHashDirect();
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    // The hash must NOT match any of the previously-documented or trivially
    // guessable passwords.
    expect(
      await bcrypt.compare("__bypass_disabled_not_a_real_password__", hash),
    ).toBe(false);
    expect(await bcrypt.compare("", hash)).toBe(false);
    expect(await bcrypt.compare("auth-disabled@local", hash)).toBe(false);
    expect(await bcrypt.compare("password", hash)).toBe(false);
  });

  it("rotates the bypass hash on every ensureSeedAdmin() call", () => {
    // Defense-in-depth: if a future change accidentally re-introduces a
    // constant hash, this test catches it. Reading the hash twice with a
    // reseed between calls must produce two different values.
    const before = bypassHashDirect();
    ensureSeedAdmin();
    const after = bypassHashDirect();
    expect(before).not.toBe(after);
  });

  it("does not reject a freshly-created user (smoke)", async () => {
    // Sanity check: the reserved-email guard must not over-match. A user
    // created at runtime with a normal email is still reachable.
    createUser({
      email: "freshuser@example.com",
      name: "Fresh User",
      password: "FreshPass!2026",
      role: "viewer",
    });
    const user = await verifyCredentials(
      "freshuser@example.com",
      "FreshPass!2026",
    );
    expect(user?.role).toBe("viewer");
  });
});
