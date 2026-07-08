/**
 * End-to-end workflow tests for the forced first-login credential-change
 * flow (D8AD-CAN-001 req 8).
 *
 * These tests exercise the REAL route handlers (`/api/auth/login`,
 * `/api/auth/change-password`, `/api/auth/me`, `/api/auth/logout`) and
 * a REAL protected mutation gate (`/api/users`) against a real temp SQLite DB.
 * Only the cookie transport is faked: `next/headers` `cookies()` is
 * mocked with an in-memory jar, so the real `getIronSession` and the
 * real `getCurrentUser`/`requireSession`/`requireAdmin` (including the
 * sessions_valid_after revocation watermark check) run unchanged. They cover:
 *
 *   - login of a temporary (must_change) account
 *   - route blocking (data/admin APIs blocked; minimum auth routes open)
 *   - successful replacement (state cleared atomically, session destroyed)
 *   - failed replacement (wrong current / weak new / same-as-current)
 *   - session invalidation (every session issued before the change dies)
 *   - subsequent normal access after a fresh login with the new password
 *   - admin cannot clear must_change without a valid new credential (req 7)
 *
 * Secrecy (req 9 — no temp credential in logs/URLs/errors) is covered
 * separately in auth-secrecy.test.ts; here we additionally assert that
 * error responses never echo the submitted password.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { sealData } from "iron-session";
import { NextRequest } from "next/server";
import type { SessionUser } from "./types";

const COOKIE_NAME = "eastern_state_kpi_session";

/**
 * In-memory cookie jar backing the mocked `cookies()`. iron-session
 * reads/writes a single sealed cookie here, so the real getSession()
 * persists across calls within a test exactly like a real browser
 * cookie, and we can craft "old" sessions (issuedAt < watermark) by
 * sealing them directly into the jar for the invalidation test.
 */
const { jar, resetSession, cookieStore } = vi.hoisted(() => {
  const jar: Record<string, string> = {};
  function resetSession(): void {
    for (const k of Object.keys(jar)) delete jar[k];
  }
  const cookieStore = {
    get: (name: string) =>
      jar[name] != null && jar[name] !== ""
        ? { name, value: jar[name] }
        : undefined,
    set: (nameOrOpts: unknown, value?: string) => {
      if (typeof nameOrOpts === "string") {
        jar[nameOrOpts] = value ?? "";
      } else {
        const o = nameOrOpts as { name: string; value: string };
        jar[o.name] = o.value;
      }
    },
  };
  return { jar, resetSession, cookieStore };
});

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => new Map<string, string>(),
}));

// Auth/DB/session remain real — only the cookie transport is faked.
import { getCurrentUser, requireSession } from "@/features/auth/session";
import { ensureSeedAdmin } from "@/features/auth/server";
import {
  createUser,
  findUserById,
  updateUserPassword,
} from "@/features/users/server";
import { getDb, resetDb } from "@/lib/db";
import { _resetForTests as resetThrottle } from "@/lib/login-throttle";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as changePasswordPost } from "@/app/api/auth/change-password/route";
import { GET as meGet } from "@/app/api/auth/me/route";
import { POST as logoutPost } from "@/app/api/auth/logout/route";
import { POST as usersPost } from "@/app/api/users/route";
import { PATCH as usersPatch } from "@/app/api/users/route";

const ADMIN_EMAIL = "kerry@easternstate.org";
const TEMP_PASSWORD = "TempAdmin!2026-rotate";
const NEW_PASSWORD = "PermanentAdmin!2026-xyz";

let tmpDir: string;
let dbPath: string;
let originalDbPath: string | undefined;
const originalEnv: Record<string, string | undefined> = {};

function jsonReq(
  url: string,
  method: "POST" | "PATCH",
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  // D8AD-CAN-004: include CSRF-passing headers by default (see the
  // matching note in session-revocation.test.ts).
  const csrfCookieName = "eastern_state_kpi_csrf";
  const csrfToken = "test-csrf-token-0123456789abcdef";
  return new NextRequest(
    new Request(url, {
      method,
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        "x-csrf-token": csrfToken,
        cookie: `${csrfCookieName}=${csrfToken}`,
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}

function loginReq(body: unknown, ip = "10.0.0.1"): NextRequest {
  return jsonReq("http://localhost/api/auth/login", "POST", body, {
    "x-forwarded-for": ip,
  });
}

function changeReq(body: unknown): NextRequest {
  return jsonReq("http://localhost/api/auth/change-password", "POST", body);
}

function hashFor(id: number): string {
  return (
    getDb()
      .prepare("SELECT password_hash FROM users WHERE id = ?")
      .get(id) as { password_hash: string }
  ).password_hash;
}

function sessionCookie(): string | undefined {
  return jar[COOKIE_NAME] || undefined;
}

async function loginAsAdmin(ip = "10.0.0.1"): Promise<void> {
  const res = await loginPost(
    loginReq({ email: ADMIN_EMAIL, password: TEMP_PASSWORD }, ip),
  );
  expect(res.status).toBe(200);
}

/** Rotate kerry's temp credential and log in with the new one so the
 *  session is an ACTIVE (non-must_change) admin — required for the
 *  req-7 tests where requireAdmin must pass. */
async function becomeActiveAdmin(): Promise<void> {
  updateUserPassword(1, NEW_PASSWORD, false);
  resetSession();
  const res = await loginPost(
    loginReq({ email: ADMIN_EMAIL, password: NEW_PASSWORD }, "10.0.0.9"),
  );
  expect(res.status).toBe(200);
}

/** Create + log in a non-must_change viewer for role-based 403 tests. */
async function becomeViewer(): Promise<SessionUser> {
  createUser({
    email: "viewer@example.com",
    name: "Viewer",
    password: "ViewerPass!2026",
    role: "viewer",
  });
  resetSession();
  const res = await loginPost(
    loginReq(
      { email: "viewer@example.com", password: "ViewerPass!2026" },
      "10.0.0.8",
    ),
  );
  expect(res.status).toBe(200);
  const u = await getCurrentUser();
  return u!;
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-workflow-"));
  dbPath = path.join(tmpDir, "test.db");
  originalDbPath = process.env.DATABASE_PATH;
  for (const k of [
    "DATABASE_PATH",
    "SESSION_SECRET",
    "TRUST_PROXY",
    "SESSION_SECURE",
    "BOOTSTRAP_ADMIN_PASSWORD",
    "BOOTSTRAP_VIEWER_PASSWORD",
  ]) {
    originalEnv[k] = process.env[k];
  }
  (process.env as Record<string, string | undefined>).DATABASE_PATH = dbPath;
  (process.env as Record<string, string | undefined>).SESSION_SECRET =
    "test-secret-test-secret-test-secret-test";
  (process.env as Record<string, string | undefined>).SESSION_SECURE = "false";
  (process.env as Record<string, string | undefined>).TRUST_PROXY = "true";
  (process.env as Record<string, string | undefined>).BOOTSTRAP_ADMIN_PASSWORD =
    TEMP_PASSWORD;
  (process.env as Record<string, string | undefined>).BOOTSTRAP_VIEWER_PASSWORD =
    "TempView!2026-rotate";
});

afterAll(() => {
  if (originalDbPath === undefined) {
    delete (process.env as Record<string, string | undefined>).DATABASE_PATH;
  } else {
    (process.env as Record<string, string | undefined>).DATABASE_PATH =
      originalDbPath;
  }
  for (const [k, v] of Object.entries(originalEnv)) {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string | undefined>)[k] = v;
  }
  resetDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  // Fresh DB + fresh bootstrap accounts per test so password changes
  // in one test never leak into another.
  fs.rmSync(dbPath, { force: true });
  resetDb();
  ensureSeedAdmin();
  resetSession();
  resetThrottle();
});

describe("login of a temporary (must_change) account", () => {
  it("authenticates and reports mustChangePassword=true", async () => {
    const res = await loginPost(
      loginReq({ email: ADMIN_EMAIL, password: TEMP_PASSWORD }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.email).toBe(ADMIN_EMAIL);
    expect(data.mustChangePassword).toBe(true);
    // A real session cookie was persisted (carries issuedAt).
    expect(sessionCookie()).toBeDefined();
    const me = await getCurrentUser();
    expect(me?.email).toBe(ADMIN_EMAIL);
    expect(me?.must_change_password).toBe(true);
  });

  it("rejects the wrong password without revealing which part failed", async () => {
    const res = await loginPost(
      loginReq({ email: ADMIN_EMAIL, password: "totally-wrong" }),
    );
    expect(res.status).toBe(401);
    const data = await res.json();
    // Generic message — no temp credential, no hint about the email.
    expect(data.error).toBe("Invalid email or password.");
    expect(JSON.stringify(data)).not.toContain(TEMP_PASSWORD);
    expect(sessionCookie()).toBeUndefined();
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("route blocking for a must_change account", () => {
  beforeEach(async () => {
    await loginAsAdmin();
  });

  it("blocks a protected API behind requireSession with a 403 AuthError", async () => {
    // The underlying gate is requireSession throwing 403 for must_change.
    await expect(requireSession()).rejects.toMatchObject({
      name: "AuthError",
      status: 403,
    });
    const res = await usersPost(jsonReq("http://localhost/api/users", "POST", {}));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain(TEMP_PASSWORD);
  });

  it("still permits the minimum auth routes (me, logout, change-password)", async () => {
    // /api/auth/me must NOT apply the must_change 403 gate — the
    // /setup-password page depends on it to read the current user.
    const me = await meGet(new NextRequest("http://localhost/api/auth/me"));
    expect(me.status).toBe(200);
    const meData = await me.json();
    expect(meData.user?.email).toBe(ADMIN_EMAIL);
    expect(meData.user?.must_change_password).toBe(true);

    // /api/auth/logout is reachable and clears the cookie.
    const out = await logoutPost();
    expect(out.status).toBe(200);
    expect(sessionCookie()).toBeUndefined();

    // Re-login (logout cleared the session) and confirm change-password
    // is reachable: it returns 4xx for bad input but NOT 403.
    await loginAsAdmin("10.0.0.3");
    const res = await changePasswordPost(
      changeReq({ currentPassword: "wrong", newPassword: "short" }),
    );
    expect(res.status).not.toBe(403);
  });
});

describe("successful credential replacement", () => {
  beforeEach(async () => {
    await loginAsAdmin();
  });

  it("clears must_change atomically, bumps the watermark, destroys the session", async () => {
    const ccBefore = findUserById(1)!.sessions_valid_after;

    const res = await changePasswordPost(
      changeReq({ currentPassword: TEMP_PASSWORD, newPassword: NEW_PASSWORD }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    // The actor's own session is destroyed (req 6: sessions issued
    // "during" the replacement are invalidated too).
    expect(sessionCookie()).toBeUndefined();
    expect(await getCurrentUser()).toBeNull();

    const after = findUserById(1)!;
    expect(after.must_change_password).toBe(false);
    expect(after.sessions_valid_after).toBeGreaterThan(ccBefore);
    expect(bcrypt.compareSync(NEW_PASSWORD, hashFor(1))).toBe(true);
  });

  it("does not echo the new or current password in the response", async () => {
    const res = await changePasswordPost(
      changeReq({ currentPassword: TEMP_PASSWORD, newPassword: NEW_PASSWORD }),
    );
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain(TEMP_PASSWORD);
    expect(text).not.toContain(NEW_PASSWORD);
  });
});

describe("failed credential replacement leaves state unchanged", () => {
  beforeEach(async () => {
    await loginAsAdmin();
  });

  async function snapshot() {
    const row = findUserById(1)!;
    return {
      must_change: row.must_change_password,
      cc: row.sessions_valid_after,
      hash: hashFor(1),
      cookie: sessionCookie(),
    };
  }

  it("rejects a wrong current password (401) and changes nothing", async () => {
    const before = await snapshot();
    const res = await changePasswordPost(
      changeReq({ currentPassword: "wrong-current", newPassword: NEW_PASSWORD }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toContain("current password");
    const after = await snapshot();
    expect(after.must_change).toBe(true);
    expect(after.cc).toBe(before.cc);
    expect(after.hash).toBe(before.hash);
    // Session cookie untouched.
    expect(after.cookie).toBe(before.cookie);
    expect(JSON.stringify(res)).not.toContain(NEW_PASSWORD);
  });

  it("rejects a weak new password (400) and changes nothing", async () => {
    const before = await snapshot();
    const res = await changePasswordPost(
      changeReq({ currentPassword: TEMP_PASSWORD, newPassword: "7chars" }),
    );
    expect(res.status).toBe(400);
    const after = await snapshot();
    expect(after.must_change).toBe(true);
    expect(after.cc).toBe(before.cc);
    expect(after.hash).toBe(before.hash);
  });

  it("rejects new === current (400) and changes nothing", async () => {
    const before = await snapshot();
    const res = await changePasswordPost(
      changeReq({ currentPassword: TEMP_PASSWORD, newPassword: TEMP_PASSWORD }),
    );
    expect(res.status).toBe(400);
    const after = await snapshot();
    expect(after.must_change).toBe(true);
    expect(after.cc).toBe(before.cc);
    expect(after.hash).toBe(before.hash);
  });
});

describe("session invalidation across credential changes (req 6)", () => {
  beforeEach(async () => {
    await loginAsAdmin();
  });

  it("invalidates every session issued before the change", async () => {
    // The just-logged-in session is valid (issuedAt >= seed watermark).
    expect(await getCurrentUser()).not.toBeNull();
    const ccAfterSeed = findUserById(1)!.sessions_valid_after;

    // Replace the credential (bumps the watermark).
    const res = await changePasswordPost(
      changeReq({ currentPassword: TEMP_PASSWORD, newPassword: NEW_PASSWORD }),
    );
    expect(res.status).toBe(200);
    const ccAfterChange = findUserById(1)!.sessions_valid_after;
    expect(ccAfterChange).toBeGreaterThan(ccAfterSeed);

    // Simulate a session issued BEFORE the change on another device:
    // seal a cookie whose issuedAt is strictly older than the new
    // watermark and drop it into the jar. The real getCurrentUser must
    // reject it (issuedAt < sessions_valid_after) and destroy it.
    const staleSealed = await sealData(
      {
        user: {
          id: 1,
          email: ADMIN_EMAIL,
          name: "Kerry Sautner",
          role: "admin",
          must_change_password: true,
        },
        issuedAt: ccAfterChange - 1,
      },
      { password: process.env.SESSION_SECRET as string },
    );
    jar[COOKIE_NAME] = staleSealed;

    expect(await getCurrentUser()).toBeNull();
    await expect(requireSession()).rejects.toMatchObject({
      name: "AuthError",
      status: 401,
    });
    // The stale cookie was destroyed.
    expect(sessionCookie()).toBeUndefined();
  });

  it("subsequent normal access works after a fresh login with the new password", async () => {
    await changePasswordPost(
      changeReq({ currentPassword: TEMP_PASSWORD, newPassword: NEW_PASSWORD }),
    );
    // Old session is gone; the dashboard would redirect to /login.
    expect(sessionCookie()).toBeUndefined();

    const res = await loginPost(
      loginReq({ email: ADMIN_EMAIL, password: NEW_PASSWORD }, "10.0.0.2"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.mustChangePassword).toBe(false);

    // Fresh session is valid (issuedAt >= watermark) and no longer
    // owes a rotation, so protected mutation gates can proceed to validation.
    const user = await getCurrentUser();
    expect(user?.must_change_password).toBe(false);
    await expect(requireSession()).resolves.toMatchObject({ email: ADMIN_EMAIL });
    const protectedMutation = await usersPost(jsonReq("http://localhost/api/users", "POST", {}));
    expect(protectedMutation.status).toBe(400);
  });
});

describe("admin cannot clear must_change without a valid new credential (req 7)", () => {
  // These tests need requireAdmin to PASS, so each promotes the
  // session to an active (already-rotated) admin rather than logging
  // in as the must_change bootstrap admin (which requireAdmin blocks).

  it("PATCH /api/users requires a password (rejects missing/weak)", async () => {
    await becomeActiveAdmin();
    const noPw = await usersPatch(
      jsonReq("http://localhost/api/users", "PATCH", { id: 2 }),
    );
    expect(noPw.status).toBe(400);
    expect(findUserById(2)!.must_change_password).toBe(true);

    const weakPw = await usersPatch(
      jsonReq("http://localhost/api/users", "PATCH", { id: 2, password: "7chars" }),
    );
    expect(weakPw.status).toBe(400);
    expect(findUserById(2)!.must_change_password).toBe(true);
  });

  it("admin reset always RE-ARMS must_change (never clears it)", async () => {
    await becomeActiveAdmin();
    // A valid admin reset sets a TEMPORARY credential — there is no API
    // field to clear must_change. The schema has no must_change
    // parameter, so an admin cannot toggle the flag off.
    const res = await usersPatch(
      jsonReq("http://localhost/api/users", "PATCH", {
        id: 2,
        password: "AdminResetTemp!2026",
      }),
    );
    expect(res.status).toBe(200);
    const zach = findUserById(2)!;
    expect(zach.must_change_password).toBe(true);
    // The reset also bumped the watermark, invalidating zach's prior
    // sessions (defense-in-depth for req 6).
    expect(zach.sessions_valid_after).toBeGreaterThan(0);
    expect(bcrypt.compareSync("AdminResetTemp!2026", hashFor(2))).toBe(true);
  });

  it("a non-admin (viewer) PATCH is forbidden by role (403)", async () => {
    await becomeViewer();
    const res = await usersPatch(
      jsonReq("http://localhost/api/users", "PATCH", {
        id: 2,
        password: "SneakyReset!2026",
      }),
    );
    expect(res.status).toBe(403);
    // zach's credential was NOT changed.
    expect(bcrypt.compareSync("SneakyReset!2026", hashFor(2))).toBe(false);
  });

  it("a must_change admin session cannot reach the admin user API (403)", async () => {
    // Bootstrap admin has not yet rotated — even an admin role is
    // blocked from admin APIs until the temp credential is replaced.
    await loginAsAdmin();
    const res = await usersPatch(
      jsonReq("http://localhost/api/users", "PATCH", {
        id: 2,
        password: "SneakyReset!2026",
      }),
    );
    expect(res.status).toBe(403);
    expect(bcrypt.compareSync("SneakyReset!2026", hashFor(2))).toBe(false);
  });
});

describe("createUser default rotation flag (regression)", () => {
  it("admin-created users keep a credential watermark baseline", () => {
    const u = createUser({
      email: "invited@example.com",
      name: "Invited User",
      password: "InvitePass!2026",
      role: "viewer",
    });
    expect(u.sessions_valid_after).toBeGreaterThan(0);
    // Default mustChangePassword is false (admin chose the password),
    // but the watermark still exists so a future reset can invalidate
    // this user's sessions.
    expect(u.must_change_password).toBe(false);
  });
});
