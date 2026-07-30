/**
 * Real-boundary integration tests for the /api/users/account admin
 * route (S022-C2).
 *
 * The previous version of this suite mocked `@/features/auth/session`
 * and `@/features/users/server`, so the REAL authorization gate, the
 * REAL CSRF/same-origin request guard (D8AD-CAN-004), and the REAL
 * security contracts of role/disable changes — the
 * sessions_valid_after watermark bump that durably revokes the
 * target's live sessions (D8AD-CAN-003), the disabled-account login
 * refusal, and the actor-attributed lifecycle audit events — were
 * never exercised here.
 *
 * This rewrite follows the src/lib/auth-regression.test.ts pattern:
 * only the cookie transport is faked (in-memory jar via
 * `vi.mock("next/headers", ...)`); a disposable temp SQLite database,
 * iron-session, the login route, the session boundary, the request
 * guard, and the users feature module all run for real.
 *
 * Note on reachability: the last-active-admin 409 mapping exists in
 * the route, but it is unreachable through the real boundary — the
 * actor is always an active admin (requireAdmin), so a non-self
 * subject can never be the last one, and a self-targeted subject is
 * refused with 400 first. That guard is covered at the feature layer
 * (src/features/users/admin-users.test.ts).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/* ------------------------------------------------------------------ *
 * In-memory cookie jar (fakes only the transport; iron-session, the
 * session boundary, the request guard, and the feature layer are
 * real).
 * ------------------------------------------------------------------ */
const { jar, resetSession, cookieStore } = vi.hoisted(() => {
  const jar: Record<string, string> = {};
  /** Supports the reset session test scenario. */
  function resetSession(): void {
    for (const k of Object.keys(jar)) delete jar[k];
  }
  const cookieStore = {
    /** Supports the get test scenario. */
    get: (name: string) =>
      jar[name] != null && jar[name] !== ""
        ? { name, value: jar[name] }
        : undefined,
    /** Supports the set test scenario. */
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
  /** Supports the cookies test scenario. */
  cookies: async () => cookieStore,
  /** Supports the headers test scenario. */
  headers: async () => new Map<string, string>(),
}));

// Real modules — imported AFTER vi.mock so they see the mocked cookies().
import { getDb, resetDb } from "@/lib/db";
import { createUser, findUserById } from "@/features/users/server";
import { _resetForTests as resetThrottle } from "@/lib/login-throttle";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { GET as meGet } from "@/app/api/auth/me/route";
import { PATCH } from "./route";

const COOKIE_NAME = "eastern_state_kpi_session";
const CSRF_COOKIE_NAME = "eastern_state_kpi_csrf";
const CSRF_TOKEN = "test-csrf-token-0123456789abcdef";

interface Account {
  id: number;
  email: string;
  password: string;
  role: "admin" | "viewer" | "board";
}

let tmpDir: string;
let databaseIndex = 0;
let originalDbPath: string | undefined;
const originalEnv: Record<string, string | undefined> = {};

let admin: Account;
let viewer: Account;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-account-route-"));
  originalDbPath = process.env.DATABASE_PATH;
  for (const k of ["DATABASE_PATH", "SESSION_SECRET", "SESSION_SECURE", "TRUST_PROXY"]) {
    originalEnv[k] = process.env[k];
  }
  (process.env as Record<string, string | undefined>).SESSION_SECRET =
    "test-secret-test-secret-test-secret-test";
  (process.env as Record<string, string | undefined>).SESSION_SECURE = "false";
  (process.env as Record<string, string | undefined>).TRUST_PROXY = "true";
});

afterAll(() => {
  if (originalDbPath === undefined) {
    delete (process.env as Record<string, string | undefined>).DATABASE_PATH;
  } else {
    (process.env as Record<string, string | undefined>).DATABASE_PATH = originalDbPath;
  }
  for (const [k, v] of Object.entries(originalEnv)) {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string | undefined>)[k] = v;
  }
  resetDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Fresh disposable DB with one admin and one viewer per test. */
function freshDb(): void {
  (process.env as Record<string, string | undefined>).DATABASE_PATH = path.join(
    tmpDir,
    `account-route-${databaseIndex++}.db`,
  );
  resetDb();
  resetThrottle();
  resetSession();
  const a = createUser({
    email: "account-admin@example.org",
    name: "Account Admin",
    password: "AccountAdmin!2026",
    role: "admin",
  });
  const v = createUser({
    email: "account-viewer@example.org",
    name: "Account Viewer",
    password: "AccountViewer!2026",
    role: "viewer",
  });
  admin = { id: a.id, email: a.email, password: "AccountAdmin!2026", role: "admin" };
  viewer = { id: v.id, email: v.email, password: "AccountViewer!2026", role: "viewer" };
}

beforeEach(() => {
  freshDb();
});

/** Log in as `acct` through the real login route; returns the response. */
async function loginResponse(acct: Account, ip: string): Promise<Response> {
  return loginPost(
    new NextRequest(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({ email: acct.email, password: acct.password }),
      }),
    ),
  );
}

/** Log in as `acct` and capture the issued session cookie. */
async function captureLogin(acct: Account, ip: string): Promise<string> {
  resetSession();
  const res = await loginResponse(acct, ip);
  expect(res.status).toBe(200);
  const cookie = jar[COOKIE_NAME];
  expect(cookie).toBeDefined();
  resetSession();
  return cookie;
}

/** Log in as `acct` and leave the session cookie installed in the jar. */
async function loginAs(acct: Account, ip: string): Promise<void> {
  resetSession();
  const res = await loginResponse(acct, ip);
  expect(res.status).toBe(200);
}

/** The session identity the real /api/auth/me route reports, or null. */
async function sessionUser(cookie: string): Promise<{ id: number } | null> {
  resetSession();
  jar[COOKIE_NAME] = cookie;
  const res = await meGet(
    new NextRequest(new Request("http://localhost/api/auth/me")),
  );
  resetSession();
  const body = (await res.json()) as { user: { id: number } | null };
  return body.user;
}

interface MutationOptions {
  /** Omit the X-CSRF-Token header (cookie stays) to exercise the guard. */
  omitToken?: boolean;
  /** Override the Origin header (same-origin check). */
  origin?: string;
  /** Override the Content-Type header (exact-JSON check). */
  contentType?: string;
}

/** Build a PATCH request that passes the request guard by default. */
function mutationReq(body: unknown, options: MutationOptions = {}): NextRequest {
  const headers: Record<string, string> = {
    "content-type": options.contentType ?? "application/json",
    origin: options.origin ?? "http://localhost",
    cookie: `${CSRF_COOKIE_NAME}=${CSRF_TOKEN}`,
  };
  if (!options.omitToken) {
    headers["x-csrf-token"] = CSRF_TOKEN;
  }
  return new NextRequest(
    new Request("http://localhost/api/users/account", {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

/**
 * Lifecycle audit event types recorded for `subjectId` by a real
 * request actor. The per-test account provisioning runs without an
 * actor (attributed to "System"), so those setup events are excluded
 * and only route-driven, actor-attributed events remain.
 */
function auditEventTypes(subjectId: number): string[] {
  const rows = getDb()
    .prepare(
      `SELECT event_type FROM user_lifecycle_audit_events
       WHERE subject_user_id = ? AND actor_email_snapshot != 'System'
       ORDER BY id`,
    )
    .all(subjectId) as { event_type: string }[];
  return rows.map((row) => row.event_type);
}

/* ------------------------------------------------------------------ *
 * The previously-mocked boundary: real requireAdmin + real request
 * guard now stand between the caller and the feature layer.
 * ------------------------------------------------------------------ */
describe("/api/users/account real authorization boundary", () => {
  it("rejects an unauthenticated PATCH with a uniform 401 before any mutation", async () => {
    const res = await PATCH(mutationReq({ id: viewer.id, role: "admin" }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(findUserById(viewer.id)?.role).toBe("viewer");
    expect(auditEventTypes(viewer.id)).toEqual([]);
  });

  it("rejects a real viewer session with 403 before any mutation", async () => {
    await loginAs(viewer, "10.6.0.1");

    const res = await PATCH(mutationReq({ id: viewer.id, role: "admin" }));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Forbidden" });
    expect(findUserById(viewer.id)?.role).toBe("viewer");
    expect(auditEventTypes(viewer.id)).toEqual([]);
  });

  it("rejects an admin PATCH whose CSRF token header is missing (D8AD-CAN-004)", async () => {
    await loginAs(admin, "10.6.0.2");

    const res = await PATCH(
      mutationReq({ id: viewer.id, role: "admin" }, { omitToken: true }),
    );

    expect(res.status).toBe(403);
    expect(findUserById(viewer.id)?.role).toBe("viewer");
  });

  it("rejects a cross-origin admin PATCH before any mutation", async () => {
    await loginAs(admin, "10.6.0.3");

    const res = await PATCH(
      mutationReq({ id: viewer.id, disabled: true }, { origin: "https://evil.example.com" }),
    );

    expect(res.status).toBe(403);
    expect(findUserById(viewer.id)?.disabled).toBeFalsy();
  });

  it("rejects a non-JSON admin PATCH with 415", async () => {
    await loginAs(admin, "10.6.0.4");

    const res = await PATCH(
      mutationReq({ id: viewer.id, disabled: true }, { contentType: "text/plain" }),
    );

    expect(res.status).toBe(415);
    expect(findUserById(viewer.id)?.disabled).toBeFalsy();
  });
});

/* ------------------------------------------------------------------ *
 * Real feature contracts: role changes and disable/enable revoke the
 * target's sessions durably and write actor-attributed audit events.
 * ------------------------------------------------------------------ */
describe("PATCH /api/users/account real feature boundary", () => {
  it("promotes a viewer to admin, revokes their old session, and returns the refreshed payload", async () => {
    const revoked = await captureLogin(viewer, "10.6.1.1");

    await loginAs(admin, "10.6.1.2");
    const res = await PATCH(mutationReq({ id: viewer.id, role: "admin" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      user: { id: number; role: string };
      users: { id: number; role: string }[];
    };
    expect(body.ok).toBe(true);
    expect(body.user).toMatchObject({ id: viewer.id, role: "admin" });
    expect(body.users.find((u) => u.id === viewer.id)?.role).toBe("admin");

    // The role really changed in the database…
    expect(findUserById(viewer.id)?.role).toBe("admin");
    // …the session issued under the old role is dead (D8AD-CAN-003)…
    expect(await sessionUser(revoked)).toBeNull();
    // …and the change is actor-attributed in the immutable log.
    expect(auditEventTypes(viewer.id)).toEqual(["role_change"]);
  });

  it("disables an account: live session dies and the real login route refuses the credential identically to a wrong password", async () => {
    const revoked = await captureLogin(viewer, "10.6.1.3");

    await loginAs(admin, "10.6.1.4");
    const res = await PATCH(mutationReq({ id: viewer.id, disabled: true }));

    expect(res.status).toBe(200);
    expect(findUserById(viewer.id)?.disabled).toBeTruthy();
    expect(await sessionUser(revoked)).toBeNull();

    // The disabled account cannot log in, and the refusal is the same
    // generic answer a wrong password gets (no existence leak).
    resetSession();
    const login = await loginResponse(viewer, "10.6.1.5");
    expect(login.status).toBe(401);
    await expect(login.json()).resolves.toEqual({
      error: "Invalid email or password.",
    });
    expect(auditEventTypes(viewer.id)).toEqual(["disable"]);
  });

  it("re-enables an account so the credential works again", async () => {
    await loginAs(admin, "10.6.1.6");
    await PATCH(mutationReq({ id: viewer.id, disabled: true }));
    expect(findUserById(viewer.id)?.disabled).toBeTruthy();

    const res = await PATCH(mutationReq({ id: viewer.id, disabled: false }));

    expect(res.status).toBe(200);
    expect(findUserById(viewer.id)?.disabled).toBeFalsy();
    resetSession();
    const login = await loginResponse(viewer, "10.6.1.7");
    expect(login.status).toBe(200);
    expect(auditEventTypes(viewer.id)).toEqual(["disable", "enable"]);
  });

  it("a no-op role update does not bump the revocation watermark", async () => {
    const stillValid = await captureLogin(viewer, "10.6.1.8");
    const watermarkBefore = findUserById(viewer.id)?.sessions_valid_after;

    await loginAs(admin, "10.6.1.9");
    // The viewer is ALREADY a viewer: nothing to change, so no
    // lifecycle mutation (and no session revocation) should happen.
    const res = await PATCH(mutationReq({ id: viewer.id, role: "viewer" }));

    expect(res.status).toBe(200);
    expect(findUserById(viewer.id)?.sessions_valid_after).toBe(watermarkBefore);
    expect(await sessionUser(stillValid)).toMatchObject({ id: viewer.id });
    expect(auditEventTypes(viewer.id)).toEqual([]);
  });

  it("refuses self-targeted account changes before mutating", async () => {
    await loginAs(admin, "10.6.1.10");

    const res = await PATCH(mutationReq({ id: admin.id, role: "viewer" }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "You cannot change your own role or disabled state.",
    });
    expect(findUserById(admin.id)?.role).toBe("admin");
    expect(auditEventTypes(admin.id)).toEqual([]);
  });

  it("returns 404 for a missing target without mutating anything", async () => {
    await loginAs(admin, "10.6.1.11");

    const res = await PATCH(mutationReq({ id: 9999, disabled: true }));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "User not found." });
    expect(auditEventTypes(9999)).toEqual([]);
  });

  it("rejects a change that names neither a role nor a disabled flag", async () => {
    await loginAs(admin, "10.6.1.12");
    const watermarkBefore = findUserById(viewer.id)?.sessions_valid_after;

    const res = await PATCH(mutationReq({ id: viewer.id }));

    expect(res.status).toBe(400);
    expect(findUserById(viewer.id)?.sessions_valid_after).toBe(watermarkBefore);
    expect(auditEventTypes(viewer.id)).toEqual([]);
  });
});
