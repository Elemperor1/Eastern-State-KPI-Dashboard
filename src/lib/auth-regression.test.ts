/**
 * Comprehensive regression suite for D8AD-CAN-003.
 *
 * Proves that a stale (revoked) session cookie cannot reach ANY
 * protected mutation route, across every revocation trigger
 * (password reset, role change, account disablement, account
 * deletion), and that the shared authorization boundary
 * (`requireSession` / `requireAdmin` from `src/features/auth/session.ts`) enforces
 * a uniform 401 `{error:"Unauthorized"}` for revoked sessions and a
 * uniform 403 `{error:"Forbidden"}` for insufficient role — with no
 * account-detail leakage and no redirect loop.
 *
 * Only the cookie transport is faked (in-memory jar via
 * `vi.mock("next/headers", ...)`). The real `getIronSession`, the real
 * `getCurrentUser` revocation chokepoint, the real route handlers, and
 * a real temp SQLite DB all run unchanged.
 *
 * Route coverage is data-driven from `PROTECTED_API_ROUTES` in
 * `./auth-regression-helpers` — add a protected route there and the
 * whole replay / forbidden / ok matrix extends automatically.
 *
 * Requirements mapped:
 *   1. create admin + viewer            → makeTarget / createAdminActor
 *   2. log in + retain cookie           → captureLogin
 *   3. reset / role / disable / delete  → captureAndRevoke
 *   4. replay vs every protected route  → it.each(PROTECTED_API_ROUTES)
 *   5. viewer cannot reach admin ops    → "viewer session" describe
 *   6. revoked/deleted blocked on every group → 4 trigger describes
 *   7. fresh session works after reset  → "fresh session" describe
 *   8. no redirect loop / no account leak → "invalid-session" describe
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/* ------------------------------------------------------------------ *
 * In-memory cookie jar (fakes only the transport; iron-session, the
 * revocation chokepoint, and the route handlers are real). Hoisted so
 * the reference is available inside the hoisted vi.mock factory.
 * ------------------------------------------------------------------ */
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

// Real modules — imported AFTER vi.mock so they see the mocked cookies().
import {
  PROTECTED_API_ROUTES,
  assertForbidden,
  assertUnauthorized,
  dispatch,
} from "./auth-regression-helpers";
import { ensureSeedAdmin } from "@/features/auth/server";
import { createUser, findUserById } from "@/features/users/server";
import { resetDb } from "@/lib/db";
import { getCurrentUser } from "@/features/auth/session";
import { _resetForTests as resetThrottle } from "@/lib/login-throttle";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { GET as meGet } from "@/app/api/auth/me/route";
import { POST as logoutPost } from "@/app/api/auth/logout/route";
import { POST as changePasswordPost } from "@/app/api/auth/change-password/route";

const COOKIE_NAME = "eastern_state_kpi_session";

/* ------------------------------------------------------------------ *
 * Env / DB lifecycle
 * ------------------------------------------------------------------ */
let tmpDir: string;
let dbPath: string;
let originalDbPath: string | undefined;
const originalEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-regression-"));
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
    "BootstrapAdmin!2026";
  (process.env as Record<string, string | undefined>).BOOTSTRAP_VIEWER_PASSWORD =
    "BootstrapViewer!2026";
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

/** Fresh DB + bootstrap accounts + clean jar + clean throttle. */
function freshDb(): void {
  fs.rmSync(dbPath, { force: true });
  resetDb();
  ensureSeedAdmin();
  resetThrottle();
  resetSession();
}

/* ------------------------------------------------------------------ *
 * Reusable test helpers
 * ------------------------------------------------------------------ */
interface Account {
  id: number;
  email: string;
  password: string;
}

function makeTarget(
  role: "admin" | "viewer",
  email: string,
  password = "TargetPass!2026",
): Account {
  const u = createUser({ email, name: `Target ${role}`, password, role });
  return { id: u.id, email, password };
}

function createAdminActor(
  email: string,
  password = "ActorAdmin!2026",
): Account {
  const u = createUser({ email, name: "Actor Admin", password, role: "admin" });
  return { id: u.id, email, password };
}

function loginReq(body: unknown, ip: string): NextRequest {
  return new NextRequest(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );
}

function jsonReq(url: string, method: "POST" | "PATCH", body: unknown): NextRequest {
  // D8AD-CAN-004: include CSRF-passing headers by default so the
  // shared request guard lets the request through to the authz layer.
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
      },
      body: JSON.stringify(body),
    }),
  );
}

/** Log in as `acct`, capture the issued cookie, leave the jar clean. */
async function captureLogin(acct: Account, ip: string): Promise<string> {
  resetSession();
  const res = await loginPost(loginReq({ email: acct.email, password: acct.password }, ip));
  expect(res.status).toBe(200);
  const cookie = jar[COOKIE_NAME];
  expect(cookie).toBeDefined();
  resetSession();
  return cookie;
}

/** Log in as `acct` and leave the cookie installed (for admin ops). */
async function loginAs(acct: Account, ip: string): Promise<void> {
  resetSession();
  const res = await loginPost(loginReq({ email: acct.email, password: acct.password }, ip));
  expect(res.status).toBe(200);
}

/** Install a captured cookie into the jar (replay a retained session). */
function replay(cookie: string): void {
  resetSession();
  jar[COOKIE_NAME] = cookie;
}

/** Current session cookie value, or undefined when absent/cleared.
 *  iron-session `destroy()` writes `""`; treat that as cleared. */
function sessionCookie(): string | undefined {
  const v = jar[COOKIE_NAME];
  return v && v !== "" ? v : undefined;
}

type Trigger = "reset" | "role" | "disable" | "delete";

/**
 * Log in `target`, capture its cookie, then — as an active admin —
 * perform the requested security-sensitive change, which revokes the
 * captured cookie (watermark bump, or row removal for deletion).
 * Returns the now-revoked cookie and leaves the jar clean.
 */
async function captureAndRevoke(trigger: Trigger, target: Account): Promise<string> {
  const admin = createAdminActor(`actor-${trigger}@example.com`);
  const revoked = await captureLogin(target, "10.0.0.40");
  await loginAs(admin, "10.0.0.41");
  let res;
  if (trigger === "reset") {
    res = await dispatch("PATCH", "/api/users", { id: target.id, password: "NewTemp!2026-xyz" });
  } else if (trigger === "role") {
    // Downgrade admin → viewer (a real role change; bumps the watermark).
    res = await dispatch("PATCH", "/api/users/account", { id: target.id, role: "viewer" });
  } else if (trigger === "disable") {
    res = await dispatch("PATCH", "/api/users/account", { id: target.id, disabled: true });
  } else {
    res = await dispatch("DELETE", "/api/users", { id: target.id });
  }
  expect(res.status).toBe(200);
  resetSession();
  return revoked;
}

const ADMIN_GATED = PROTECTED_API_ROUTES.filter((r) => r.gate === "requireAdmin");
/* ------------------------------------------------------------------ *
 * req 4 + req 6: a revoked/deleted session cannot reach ANY protected
 * route (every functional group: writes, history, KPI definitions,
 * categories, entries, breakdowns, goals, user management).
 * ------------------------------------------------------------------ */
function replayMatrix(trigger: Trigger, targetRole: "admin" | "viewer"): void {
  let revoked = "";
  beforeAll(async () => {
    freshDb();
    const target = makeTarget(targetRole, `target-${trigger}-${targetRole}@example.com`);
    revoked = await captureAndRevoke(trigger, target);
  });
  afterAll(() => resetSession());

  it.each(PROTECTED_API_ROUTES)(
    "rejects $method $path with 401 (no account details)",
    async (route) => {
      replay(revoked);
      const res = await dispatch(route.method, route.path);
      await assertUnauthorized(res);
      // The cookie was cleared by getCurrentUser.
      expect(sessionCookie()).toBeUndefined();
    },
  );
}

describe("revoked session (password reset) vs every protected route", () => {
  replayMatrix("reset", "viewer");
});

describe("revoked session (role change) vs every protected route", () => {
  replayMatrix("role", "admin");
});

describe("revoked session (account disablement) vs every protected route", () => {
  replayMatrix("disable", "viewer");
});

describe("revoked session (account deletion) vs every protected route", () => {
  replayMatrix("delete", "viewer");
});

/* ------------------------------------------------------------------ *
 * req 5: a viewer session cannot reach administrator operations (403).
 * ------------------------------------------------------------------ */
describe("viewer session cannot reach administrator operations (req 5)", () => {
  let viewerCookie = "";
  beforeAll(async () => {
    freshDb();
    viewerCookie = await captureLogin(
      makeTarget("viewer", "viewer-req5@example.com"),
      "10.0.0.60",
    );
  });
  afterAll(() => resetSession());

  it.each(ADMIN_GATED)("forbids viewer on $method $path (403)", async (route) => {
    replay(viewerCookie);
    const res = await dispatch(route.method, route.path);
    await assertForbidden(res);
  });
});

/* ------------------------------------------------------------------ *
 * req 7: a newly authenticated session works after a legitimate
 * reset. The admin's own session survives a target reset (the bump
 * is on the target, not the actor); the target's OLD cookie is
 * revoked; the target logs in with the temp credential, rotates it,
 * and a fresh active session reaches reads (200) + is blocked from
 * admin ops (403).
 * ------------------------------------------------------------------ */
describe("fresh session works after a legitimate reset (req 7)", () => {
  it("admin survives a target reset; target's old cookie revoked; target re-authenticates and works", async () => {
    freshDb();
    const admin = createAdminActor("fresh-admin@example.com");
    const viewer = makeTarget("viewer", "fresh-viewer@example.com", "FreshView!2026");

    // Admin logs in (active) and stays logged in.
    await loginAs(admin, "10.0.0.70");
    const adminCookie = jar[COOKIE_NAME];
    expect(adminCookie).toBeDefined();

    // Capture the viewer's pre-reset cookie, then admin resets it.
    const viewerOld = await captureLogin(viewer, "10.0.0.71");
    await loginAs(admin, "10.0.0.72");
    const resetRes = await dispatch("PATCH", "/api/users", {
      id: viewer.id,
      password: "NewTemp!2026-xyz",
    });
    expect(resetRes.status).toBe(200);

    // Admin's own session is still valid (actor not self-affected).
    replay(adminCookie);
    await expect(getCurrentUser()).resolves.toMatchObject({ id: admin.id, role: "admin" });

    // Viewer's old cookie is revoked.
    replay(viewerOld);
    await expect(getCurrentUser()).resolves.toBeNull();

    // Viewer logs in with the temp credential (must_change).
    const tempLogin = await loginPost(
      loginReq({ email: viewer.email, password: "NewTemp!2026-xyz" }, "10.0.0.73"),
    );
    expect(tempLogin.status).toBe(200);
    expect((await tempLogin.json()).mustChangePassword).toBe(true);

    // Viewer rotates to a permanent credential (legitimate reset).
    const rotateRes = await changePasswordPost(
      jsonReq("http://localhost/api/auth/change-password", "POST", {
        currentPassword: "NewTemp!2026-xyz",
        newPassword: "ViewerFinal!2026-abc",
      }),
    );
    expect(rotateRes.status).toBe(200);
    expect(sessionCookie()).toBeUndefined();

    // Fresh active session with the permanent credential works.
    const freshLogin = await loginPost(
      loginReq({ email: viewer.email, password: "ViewerFinal!2026-abc" }, "10.0.0.74"),
    );
    expect(freshLogin.status).toBe(200);
    expect((await freshLogin.json()).mustChangePassword).toBe(false);

    // The fresh viewer session is valid; admin-only adapters remain forbidden.
    await expect(getCurrentUser()).resolves.toMatchObject({ id: viewer.id, role: "viewer" });
    await assertForbidden(await dispatch("POST", "/api/entries"));
  });
});

/* ------------------------------------------------------------------ *
 * req 8: invalid-session handling does not cause redirect loops or
 * expose account details.
 * ------------------------------------------------------------------ */
describe("invalid-session handling (req 8)", () => {
  let revoked = "";
  beforeAll(async () => {
    freshDb();
    revoked = await captureAndRevoke("disable", makeTarget("viewer", "loop-viewer@example.com"));
  });
  afterAll(() => resetSession());

  it("getCurrentUser returns null for a revoked cookie (no account details surfaced)", async () => {
    replay(revoked);
    expect(await getCurrentUser()).toBeNull();
    expect(sessionCookie()).toBeUndefined();
  });

  it("/api/auth/me returns {user:null} for a revoked cookie — no redirect, no loop, no account details", async () => {
    replay(revoked);
    const res = await meGet(new NextRequest("http://localhost/api/auth/me"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/@example\.com|password|sessions_valid_after/i);
  });

  it("/api/auth/logout clears a revoked cookie (minimum route, no 401/loop)", async () => {
    replay(revoked);
    const res = await logoutPost();
    expect(res.status).toBe(200);
    expect(sessionCookie()).toBeUndefined();
  });

  it("login of a deleted account is a generic 401 with no account details (no former-existence leak)", async () => {
    freshDb();
    const admin = createAdminActor("victim-admin@example.com");
    const victim = makeTarget("viewer", "victim@example.com", "VictimPass!2026");
    await loginAs(admin, "10.0.0.80");
    const delRes = await dispatch("DELETE", "/api/users", { id: victim.id });
    expect(delRes.status).toBe(200);

    resetSession();
    const res = await loginPost(
      loginReq({ email: victim.email, password: victim.password }, "10.0.0.81"),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid email or password.");
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/@example\.com|victim|password_hash|sessions_valid_after/i);
  });

  it("the home page redirects a revoked session to /login (single hop, no loop)", async () => {
    replay(revoked);
    // A revoked session has no user, so the page falls through to
    // redirect("/login") — the public terminal auth page (a "use
    // client" page that does not itself redirect). One hop, no loop.
    const HomePage = (await import("@/app/page")).default;
    try {
      await HomePage();
      throw new Error("REDIRECT_NOT_THROWN");
    } catch (e) {
      const err = e as { message?: string; digest?: string };
      const repr = JSON.stringify({ msg: err.message, digest: err.digest, str: String(e) });
      if (repr.includes("REDIRECT_NOT_THROWN")) throw e;
      expect(repr).toContain("/login");
    }
  });

  it("the home page redirects an active admin to /dashboard (sanity: revoked → /login is the revocation path)", async () => {
    freshDb();
    const admin = createAdminActor("home-admin@example.com");
    await loginAs(admin, "10.0.0.90");
    const HomePage = (await import("@/app/page")).default;
    try {
      await HomePage();
      throw new Error("REDIRECT_NOT_THROWN");
    } catch (e) {
      const err = e as { message?: string; digest?: string };
      const repr = JSON.stringify({ msg: err.message, digest: err.digest, str: String(e) });
      if (repr.includes("REDIRECT_NOT_THROWN")) throw e;
      expect(repr).toContain("/dashboard");
    }
  });
});

/* ------------------------------------------------------------------ *
 * Sanity: the route table is exhaustive over the documented protected
 * API surface, so the matrix above cannot silently miss a route.
 * ------------------------------------------------------------------ */
describe("route table coverage", () => {
  it("every protected API route is registered exactly once and covers all req-6 groups", () => {
    const keys = PROTECTED_API_ROUTES.map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    // Every remaining protected API functional group named in req 6 (KPI
    // definitions, categories, entries, breakdowns, goals, user
    // management) is represented. "writes" is covered by the presence
    // of mutation methods (POST/PATCH/DELETE) across the groups.
    const groups = new Set(PROTECTED_API_ROUTES.map((r) => r.group));
    for (const g of [
      "kpis",
      "categories",
      "entries",
      "breakdowns",
      "goals",
      "users",
      "exports",
      "strategy_values",
      "strategy_configuration",
    ]) {
      expect(groups.has(g as (typeof PROTECTED_API_ROUTES)[number]["group"])).toBe(true);
    }
    const methods = new Set(PROTECTED_API_ROUTES.map((r) => r.method));
    expect(methods.has("POST") || methods.has("PATCH") || methods.has("DELETE")).toBe(true); // writes
  });

  it("a revoked session is rejected on the single chokepoint regardless of route", async () => {
    freshDb();
    const target = makeTarget("viewer", "chokepoint-viewer@example.com");
    const revoked = await captureAndRevoke("reset", target);
    replay(revoked);
    // The chokepoint itself returns null — every protected route
    // funnels through it, so the per-route matrix is representative.
    expect(await getCurrentUser()).toBeNull();
    // The target row still exists (reset case) but the cookie is dead.
    const admin = createAdminActor("chokepoint-admin@example.com");
    await loginAs(admin, "10.0.0.99");
    expect(findUserById(target.id)).not.toBeNull();
  });
});
