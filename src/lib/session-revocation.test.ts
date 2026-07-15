/**
 * D8AD-CAN-003 — durable session-revocation replay tests (req 10).
 *
 * For each security-sensitive account change, a session cookie that
 * was valid BEFORE the change must be rejected (and cleared) AFTER it,
 * even though the cookie itself is cryptographically intact. The
 * revocation is durable because getCurrentUser re-reads the live user
 * row on every protected request and applies:
 *
 *   - deleted  → row absent           → destroy + null
 *   - disabled → disabled flag set    → destroy + null
 *   - revoked  → issuedAt < sessions_valid_after → destroy + null
 *
 * The watermark (sessions_valid_after) is bumped on password reset,
 * password change, role change, and disable/enable, so each of those
 * invalidates every prior session. Deletion needs no bump — the row
 * is gone.
 *
 * These tests replay an OLD captured cookie after:
 *   req 10  (a) password reset   (admin PATCH /api/users)
 *   req 10  (b) deletion          (admin DELETE /api/users)
 *   req 10  (c) disablement       (admin PATCH /api/users/account)
 *   req 10  (d) role downgrade    (admin PATCH /api/users/account)
 *   req 10  (e) credential change (self-service POST /api/auth/change-password)
 *
 * Plus: a disabled / deleted user cannot log in and the login response
 * does not leak that the account formerly existed (req 9); re-enabling
 * bumps the watermark again so a pre-disable cookie stays rejected;
 * an admin cannot target their own account via /api/users/account
 * (self-lockout guard); and a revoked session gets a consistent 401
 * `{ error: "Unauthorized" }` from the data API gate (req 8).
 *
 * Only the cookie transport is faked (`next/headers` `cookies()` →
 * in-memory jar); the real getIronSession, getCurrentUser,
 * requireSession/requireAdmin, and the real route handlers run
 * against a real temp SQLite DB.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const COOKIE_NAME = "eastern_state_kpi_session";

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

import { getCurrentUser, requireAdmin } from "@/features/auth/session";
import { ensureSeedAdmin } from "@/features/auth/server";
import {
  createUser,
  findUserById,
  setUserDisabled,
  updateUserPassword,
  updateUserRole,
} from "@/features/users/server";
import { getDb, resetDb } from "@/lib/db";
import { _resetForTests as resetThrottle } from "@/lib/login-throttle";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as changePasswordPost } from "@/app/api/auth/change-password/route";
import {
  DELETE as usersDelete,
  PATCH as usersPatch,
  POST as usersPost,
} from "@/app/api/users/route";
import { PATCH as accountPatch } from "@/app/api/users/account/route";

let tmpDir: string;
let dbPath: string;
let originalDbPath: string | undefined;
const originalEnv: Record<string, string | undefined> = {};

function jsonReq(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  // D8AD-CAN-004: include CSRF-passing headers by default so the shared
  // request guard lets the request through to the authz layer under
  // test. The session cookie is installed separately via the mocked
  // next/headers jar; the CSRF cookie here is read by the guard via
  // req.cookies. Pass a header in `headers` to override for a
  // CSRF-failure case.
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

function sessionCookie(): string | undefined {
  return jar[COOKIE_NAME] || undefined;
}

/** Log in and return the sealed cookie string for the just-issued session. */
async function loginAndCapture(
  email: string,
  password: string,
  ip = "10.0.0.1",
): Promise<string> {
  resetSession();
  const res = await loginPost(loginReq({ email, password }, ip));
  expect(res.status).toBe(200);
  const cookie = sessionCookie();
  if (!cookie) throw new Error("no session cookie after login");
  return cookie;
}

/** Install a previously-captured sealed cookie into the jar (replay it). */
function replay(cookie: string): void {
  resetSession();
  jar[COOKIE_NAME] = cookie;
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-revocation-"));
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
    "BootAdmin!2026-rotate";
  (process.env as Record<string, string | undefined>).BOOTSTRAP_VIEWER_PASSWORD =
    "BootView!2026-rotate";
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

let adminEmail: string;
let adminPassword: string;
let adminId: number;

beforeEach(() => {
  fs.rmSync(dbPath, { force: true });
  resetDb();
  ensureSeedAdmin();
  resetSession();
  resetThrottle();

  // A dedicated, already-active admin actor (not the must_change
  // bootstrap) so requireAdmin passes for the admin operations below.
  adminEmail = "admin2@example.com";
  adminPassword = "Admin2Pass!2026";
  const admin = createUser({
    email: adminEmail,
    name: "Admin Two",
    password: adminPassword,
    role: "admin",
  });
  adminId = admin.id;
});

/** Log in as the dedicated admin actor (active, non-must_change). */
async function loginAdmin(): Promise<void> {
  resetSession();
  const res = await loginPost(
    loginReq({ email: adminEmail, password: adminPassword }, "10.0.0.2"),
  );
  expect(res.status).toBe(200);
}

describe("req 10a — password reset invalidates prior sessions", () => {
  it("an admin reset bumps the watermark and rejects the user's old cookie", async () => {
    const v = createUser({
      email: "viewer-a@example.com",
      name: "Viewer A",
      password: "ViewerPassA!2026",
      role: "viewer",
    });
    const oldCookie = await loginAndCapture(v.email, "ViewerPassA!2026", "10.0.0.3");
    expect(await getCurrentUser()).not.toBeNull();

    await loginAdmin();
    const ccBefore = findUserById(v.id)!.sessions_valid_after;
    const res = await usersPatch(
      jsonReq("http://localhost/api/users", "PATCH", {
        id: v.id,
        password: "ResetTemp!2026-xyz",
      }),
    );
    expect(res.status).toBe(200);
    expect(findUserById(v.id)!.sessions_valid_after).toBeGreaterThan(ccBefore);

    // Replay the cookie captured BEFORE the reset.
    replay(oldCookie);
    expect(await getCurrentUser()).toBeNull();
    // The invalid cookie was cleared (req 8).
    expect(sessionCookie()).toBeUndefined();
    // A protected API gate returns a consistent 401 (req 8).
    const protectedMutation = await usersPost(jsonReq("http://localhost/api/users", "POST", {}));
    expect(protectedMutation.status).toBe(401);
    expect((await protectedMutation.json()).error).toBe("Unauthorized");
  });
});

describe("req 10b — deletion immediately invalidates all sessions", () => {
  it("a deleted user's old cookie is rejected and the cookie is cleared", async () => {
    const v = createUser({
      email: "viewer-b@example.com",
      name: "Viewer B",
      password: "ViewerPassB!2026",
      role: "viewer",
    });
    const oldCookie = await loginAndCapture(v.email, "ViewerPassB!2026", "10.0.0.4");

    await loginAdmin();
    const res = await usersDelete(
      jsonReq("http://localhost/api/users", "DELETE", { id: v.id }),
    );
    expect(res.status).toBe(200);
    expect(findUserById(v.id)).toBeNull();

    replay(oldCookie);
    expect(await getCurrentUser()).toBeNull();
    expect(sessionCookie()).toBeUndefined();
  });

  it("login as a deleted user returns the generic 401 (no existence leak, req 9)", async () => {
    const v = createUser({
      email: "viewer-b2@example.com",
      name: "Viewer B2",
      password: "ViewerPassB2!2026",
      role: "viewer",
    });
    await loginAdmin();
    await usersDelete(
      jsonReq("http://localhost/api/users", "DELETE", { id: v.id }),
    );

    resetSession();
    const res = await loginPost(
      loginReq({ email: v.email, password: "ViewerPassB2!2026" }, "10.0.0.5"),
    );
    expect(res.status).toBe(401);
    const data = await res.json();
    // Identical message to "no such user" / "wrong password".
    expect(data.error).toBe("Invalid email or password.");
    expect(sessionCookie()).toBeUndefined();
  });
});

describe("req 10c — disablement invalidates prior sessions", () => {
  it("an admin disable rejects the user's old cookie and clears it", async () => {
    const v = createUser({
      email: "viewer-c@example.com",
      name: "Viewer C",
      password: "ViewerPassC!2026",
      role: "viewer",
    });
    const oldCookie = await loginAndCapture(v.email, "ViewerPassC!2026", "10.0.0.6");

    await loginAdmin();
    const ccBefore = findUserById(v.id)!.sessions_valid_after;
    const res = await accountPatch(
      jsonReq("http://localhost/api/users/account", "PATCH", {
        id: v.id,
        disabled: true,
      }),
    );
    expect(res.status).toBe(200);
    expect(findUserById(v.id)!.disabled).toBe(true);
    expect(findUserById(v.id)!.sessions_valid_after).toBeGreaterThan(ccBefore);

    replay(oldCookie);
    expect(await getCurrentUser()).toBeNull();
    expect(sessionCookie()).toBeUndefined();
  });

  it("a disabled user cannot log in and gets the generic 401 (req 9)", async () => {
    const v = createUser({
      email: "viewer-c2@example.com",
      name: "Viewer C2",
      password: "ViewerPassC2!2026",
      role: "viewer",
    });
    await loginAdmin();
    await accountPatch(
      jsonReq("http://localhost/api/users/account", "PATCH", {
        id: v.id,
        disabled: true,
      }),
    );

    resetSession();
    const res = await loginPost(
      loginReq({ email: v.email, password: "ViewerPassC2!2026" }, "10.0.0.7"),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Invalid email or password.");
  });

  it("re-enabling bumps the watermark again so a pre-disable cookie stays rejected", async () => {
    const v = createUser({
      email: "viewer-c3@example.com",
      name: "Viewer C3",
      password: "ViewerPassC3!2026",
      role: "viewer",
    });
    const oldCookie = await loginAndCapture(v.email, "ViewerPassC3!2026", "10.0.0.8");

    await loginAdmin();
    await accountPatch(
      jsonReq("http://localhost/api/users/account", "PATCH", {
        id: v.id,
        disabled: true,
      }),
    );
    const ccAtDisable = findUserById(v.id)!.sessions_valid_after;

    // Re-enable.
    const res = await accountPatch(
      jsonReq("http://localhost/api/users/account", "PATCH", {
        id: v.id,
        disabled: false,
      }),
    );
    expect(res.status).toBe(200);
    expect(findUserById(v.id)!.disabled).toBe(false);
    expect(findUserById(v.id)!.sessions_valid_after).toBeGreaterThan(ccAtDisable);

    // The pre-disable cookie is still rejected (watermark moved again).
    replay(oldCookie);
    expect(await getCurrentUser()).toBeNull();

    // A fresh login with the existing credential works after re-enable.
    const fresh = await loginAndCapture(v.email, "ViewerPassC3!2026", "10.0.0.9");
    expect(fresh).toBeDefined();
    expect(await getCurrentUser()).not.toBeNull();
  });
});

describe("req 10d — role downgrade invalidates prior sessions", () => {
  it("downgrading an admin to viewer bumps the watermark and rejects their old cookie", async () => {
    // A second admin (the target of the downgrade).
    const target = createUser({
      email: "admin3@example.com",
      name: "Admin Three",
      password: "Admin3Pass!2026",
      role: "admin",
    });
    const oldCookie = await loginAndCapture(
      target.email,
      "Admin3Pass!2026",
      "10.0.0.10",
    );
    // Their session is a valid admin session.
    await expect(requireAdmin()).resolves.toMatchObject({ role: "admin" });

    // The actor admin downgrades them.
    await loginAdmin();
    const ccBefore = findUserById(target.id)!.sessions_valid_after;
    const res = await accountPatch(
      jsonReq("http://localhost/api/users/account", "PATCH", {
        id: target.id,
        role: "viewer",
      }),
    );
    expect(res.status).toBe(200);
    expect(findUserById(target.id)!.role).toBe("viewer");
    expect(findUserById(target.id)!.sessions_valid_after).toBeGreaterThan(ccBefore);

    // Replay the old admin cookie — revoked (req 4: no longer has the
    // required role is enforced even more strongly: the session is
    // outright invalidated, not merely downgraded).
    replay(oldCookie);
    expect(await getCurrentUser()).toBeNull();
    expect(sessionCookie()).toBeUndefined();
    // The admin-only API gate rejects the revoked session with 401.
    const protectedMutation = await usersPost(jsonReq("http://localhost/api/users", "POST", {}));
    expect(protectedMutation.status).toBe(401);
  });
});

describe("strictly monotonic session watermark", () => {
  it("advances for every security change even when Date.now does not", () => {
    const target = createUser({
      email: "same-ms@example.com",
      name: "Same Millisecond",
      password: "SameMsPass!2026",
      role: "admin",
    });
    const initial = target.sessions_valid_after;
    const now = vi.spyOn(Date, "now").mockReturnValue(initial);

    try {
      updateUserRole(target.id, "viewer");
      expect(findUserById(target.id)!.sessions_valid_after).toBe(initial + 1);

      updateUserPassword(target.id, "SameMsPass!2026-next", false);
      expect(findUserById(target.id)!.sessions_valid_after).toBe(initial + 2);

      setUserDisabled(target.id, true);
      expect(findUserById(target.id)!.sessions_valid_after).toBe(initial + 3);
    } finally {
      now.mockRestore();
    }
  });
});

describe("req 10e — self-service credential change invalidates prior sessions", () => {
  it("rotating a temp credential rejects the pre-rotation cookie", async () => {
    // A must_change account (bootstrap-style) so the self-service
    // change-password route is reachable.
    const v = createUser({
      email: "viewer-e@example.com",
      name: "Viewer E",
      password: "TempE!2026-rotate",
      role: "viewer",
      mustChangePassword: true,
    });
    const oldCookie = await loginAndCapture(v.email, "TempE!2026-rotate", "10.0.0.11");

    // The change-password route runs against the current session, so
    // install the old cookie as the active session, then rotate.
    replay(oldCookie);
    const ccBefore = findUserById(v.id)!.sessions_valid_after;
    const res = await changePasswordPost(
      jsonReq("http://localhost/api/auth/change-password", "POST", {
        currentPassword: "TempE!2026-rotate",
        newPassword: "PermanentE!2026-xyz",
      }),
    );
    expect(res.status).toBe(200);
    expect(findUserById(v.id)!.sessions_valid_after).toBeGreaterThan(ccBefore);
    // The route destroyed the actor's own session.
    expect(sessionCookie()).toBeUndefined();

    // A session captured BEFORE the rotation is now rejected.
    replay(oldCookie);
    expect(await getCurrentUser()).toBeNull();
    expect(sessionCookie()).toBeUndefined();
  });
});

describe("req 8 — consistent unauthorized response across protected APIs", () => {
  it("a revoked session gets 401 {error:'Unauthorized'} from a protected API gate", async () => {
    const v = createUser({
      email: "viewer-f@example.com",
      name: "Viewer F",
      password: "ViewerPassF!2026",
      role: "viewer",
    });
    const oldCookie = await loginAndCapture(v.email, "ViewerPassF!2026", "10.0.0.12");

    await loginAdmin();
    setUserDisabled(v.id, true);

    replay(oldCookie);
    // POST /api/users reaches the shared session chokepoint first;
    // the revoked session yields a consistent 401 (not 403, not 500).
    const res = await usersPost(jsonReq("http://localhost/api/users", "POST", {}));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });
});

describe("/api/users/account self-target guard", () => {
  it("an admin cannot disable themselves (would lock out with no recovery)", async () => {
    await loginAdmin();
    const res = await accountPatch(
      jsonReq("http://localhost/api/users/account", "PATCH", {
        id: adminId,
        disabled: true,
      }),
    );
    expect(res.status).toBe(400);
    expect(findUserById(adminId)!.disabled).toBe(false);
  });

  it("an admin cannot change their own role", async () => {
    await loginAdmin();
    const res = await accountPatch(
      jsonReq("http://localhost/api/users/account", "PATCH", {
        id: adminId,
        role: "viewer",
      }),
    );
    expect(res.status).toBe(400);
    expect(findUserById(adminId)!.role).toBe("admin");
  });

  it("rejects an empty/invalid body with 400 and bumps nothing", async () => {
    await loginAdmin();
    const target = createUser({
      email: "viewer-g@example.com",
      name: "Viewer G",
      password: "ViewerPassG!2026",
      role: "viewer",
    });
    const ccBefore = findUserById(target.id)!.sessions_valid_after;
    const res = await accountPatch(
      jsonReq("http://localhost/api/users/account", "PATCH", { id: target.id }),
    );
    expect(res.status).toBe(400);
    expect(findUserById(target.id)!.sessions_valid_after).toBe(ccBefore);
  });

  it("a non-admin (viewer) is forbidden (403) and bumps nothing", async () => {
    const v = createUser({
      email: "viewer-h@example.com",
      name: "Viewer H",
      password: "ViewerPassH!2026",
      role: "viewer",
    });
    const target = createUser({
      email: "viewer-i@example.com",
      name: "Viewer I",
      password: "ViewerPassI!2026",
      role: "viewer",
    });
    await loginAndCapture(v.email, "ViewerPassH!2026", "10.0.0.13");
    const ccBefore = findUserById(target.id)!.sessions_valid_after;
    const res = await accountPatch(
      jsonReq("http://localhost/api/users/account", "PATCH", {
        id: target.id,
        role: "admin",
      }),
    );
    expect(res.status).toBe(403);
    expect(findUserById(target.id)!.role).toBe("viewer");
    expect(findUserById(target.id)!.sessions_valid_after).toBe(ccBefore);
  });
});

describe("req 7 — stable user id (not email) is the identity key", () => {
  it("getCurrentUser resolves the session by session.user.id, not by email", async () => {
    // Sanity: the session carries a stable numeric id and the DB
    // lookup is by id. A user whose email later changes (not exposed
    // in the current UI, but the design must not depend on email)
    // would still validate. We assert the lookup path here by
    // confirming findUserById (id-keyed) is what getCurrentUser uses:
    // deleting the row by id invalidates; email is never consulted.
    const v = createUser({
      email: "viewer-j@example.com",
      name: "Viewer J",
      password: "ViewerPassJ!2026",
      role: "viewer",
    });
    const cookie = await loginAndCapture(v.email, "ViewerPassJ!2026", "10.0.0.14");
    replay(cookie);
    const u = await getCurrentUser();
    expect(u?.id).toBe(v.id);

    // Directly mutate the row's email in the DB (simulating an email
    // change outside the app). The session is keyed by id, so it
    // still validates — proving the identity key is the id, not email.
    getDb()
      .prepare("UPDATE users SET email = ? WHERE id = ?")
      .run("renamed@example.com", v.id);
    replay(cookie);
    const u2 = await getCurrentUser();
    expect(u2?.id).toBe(v.id);
    expect(u2?.email).toBe("renamed@example.com");
  });
});
