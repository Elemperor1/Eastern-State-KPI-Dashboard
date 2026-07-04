/**
 * Reusable helpers for the D8AD-CAN-003 regression suite
 * (`src/lib/auth-regression.test.ts` and other authz tests).
 *
 * These helpers are pure with respect to the cookie transport: the
 * caller owns the in-memory cookie jar (set up per test file via
 * `vi.mock("next/headers", ...)`), installs a captured cookie before
 * calling `dispatch`, and inspects the returned Response. The helpers
 * only know how to (a) create accounts, (b) call any protected API
 * route handler by (method, path), and (c) assert the shared
 * authorization-boundary response shapes.
 *
 * ## Protected API routes covered by the suite
 *
 * Every route below is gated by the SHARED authorization boundary in
 * `src/lib/session.ts` — `requireSession` (any authenticated,
 * non-must_change user) and `requireAdmin` (additionally role ===
 * "admin"). A revoked session (deleted / disabled / watermark-bumped)
 * yields 401 `{error:"Unauthorized"}` on ALL of them, because
 * `requireAdmin` calls `requireSession` first and `getCurrentUser`
 * returns null for a revoked cookie. A valid viewer session yields
 * 403 `{error:"Forbidden"}` on the admin-gated routes and 200 on the
 * read routes.
 *
 *   GET    /api/breakdowns        requireSession   (breakdowns read)
 *   POST   /api/breakdowns        requireAdmin     (breakdowns write)
 *   DELETE /api/breakdowns        requireAdmin     (breakdowns write)
 *   GET    /api/categories        requireSession   (categories read)
 *   POST   /api/categories        requireAdmin     (categories write)
 *   PATCH  /api/categories        requireAdmin     (categories write)
 *   DELETE /api/categories        requireAdmin     (categories write)
 *   GET    /api/entries           requireSession   (entries read)
 *   POST   /api/entries           requireAdmin     (entries write)
 *   DELETE /api/entries           requireAdmin     (entries write)
 *   GET    /api/entries/history   requireAdmin     (audit history)
 *   GET    /api/entries/years     requireSession   (entries read)
 *   GET    /api/kpis              requireSession   (KPI definitions read)
 *   POST   /api/kpis              requireAdmin     (KPI definitions write)
 *   PATCH  /api/kpis              requireAdmin     (KPI definitions write)
 *   DELETE /api/kpis              requireAdmin     (KPI definitions write)
 *   GET    /api/meta              requireSession   (meta read)
 *   GET    /api/users             requireAdmin     (user management read)
 *   POST   /api/users             requireAdmin     (user management write)
 *   PATCH  /api/users             requireAdmin     (user management write — password reset)
 *   DELETE /api/users             requireAdmin     (user management write — deletion)
 *   PATCH  /api/users/account     requireAdmin     (user management write — role/disable)
 *
 * ## Routes that CANNOT use the shared authorization boundary
 *
 * These are intentionally outside `requireSession`/`requireAdmin` so
 * the auth-minimum surface stays reachable by the very users who owe
 * a rotation or who are logging out / inspecting their own session.
 * The regression suite does not gate-replay them, but it does verify
 * they do not leak account details for an invalid session:
 *
 *   POST   /api/auth/login         PUBLIC — the entry point; cannot be
 *                                  gated (no session to check). Throttled.
 *   POST   /api/auth/logout        Uses `getSession` directly (not
 *                                  requireSession) so a stale/revoked
 *                                  cookie can still be cleared; it only
 *                                  destroys the cookie and returns ok.
 *   GET    /api/auth/me            Uses `getCurrentUser` WITHOUT the
 *                                  must_change 403 gate; returns
 *                                  `{user:null}` (200) for an absent /
 *                                  revoked session — the /setup-password
 *                                  page depends on this. Minimum route.
 *   POST   /api/auth/change-password  Uses `getCurrentUser` WITHOUT the
 *                                  403 gate; reachable by must_change
 *                                  users performing their rotation.
 *                                  Minimum route.
 *
 * Page routes (`/`, `/dashboard/*`, `/admin/*`) also sit outside the
 * throw-based shared gate: they call `getCurrentUser` + `redirect()`
 * (to `/login` when there is no user, to `/setup-password` when
 * `must_change_password`). They share the `getCurrentUser` revocation
 * chokepoint but not the `requireSession`/`requireAdmin` JSON-gate.
 * A revoked cookie there yields a single redirect to `/login` (the
 * terminal public auth page), not a loop, and exposes no account
 * details — verified via `getCurrentUser` returning null + the
 * `/login` page being public.
 */
import { expect } from "vitest";
import { NextRequest } from "next/server";
import { createUser } from "./auth";
import type { User } from "./types";

import * as breakdowns from "@/app/api/breakdowns/route";
import * as categories from "@/app/api/categories/route";
import * as entries from "@/app/api/entries/route";
import * as entriesHistory from "@/app/api/entries/history/route";
import * as entriesYears from "@/app/api/entries/years/route";
import * as kpis from "@/app/api/kpis/route";
import * as meta from "@/app/api/meta/route";
import * as users from "@/app/api/users/route";
import * as usersAccount from "@/app/api/users/account/route";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
export type Gate = "requireSession" | "requireAdmin";

export interface ProtectedRoute {
  method: HttpMethod;
  path: string;
  gate: Gate;
  /** Functional group, for the requirement-6 coverage matrix. */
  group:
    | "reads"
    | "writes"
    | "history"
    | "kpis"
    | "categories"
    | "entries"
    | "breakdowns"
    | "users";
  /** Whether the handler signature accepts a NextRequest argument. */
  takesReq: boolean;
}

/**
 * The exhaustive table of protected API routes covered by the
 * regression suite. Adding a new protected route? Add it here and the
 * whole replay/forbidden/ok matrix extends automatically.
 */
export const PROTECTED_API_ROUTES: ProtectedRoute[] = [
  { method: "GET", path: "/api/breakdowns", gate: "requireSession", group: "breakdowns", takesReq: true },
  { method: "POST", path: "/api/breakdowns", gate: "requireAdmin", group: "breakdowns", takesReq: true },
  { method: "DELETE", path: "/api/breakdowns", gate: "requireAdmin", group: "breakdowns", takesReq: true },
  { method: "GET", path: "/api/categories", gate: "requireSession", group: "categories", takesReq: false },
  { method: "POST", path: "/api/categories", gate: "requireAdmin", group: "categories", takesReq: true },
  { method: "PATCH", path: "/api/categories", gate: "requireAdmin", group: "categories", takesReq: true },
  { method: "DELETE", path: "/api/categories", gate: "requireAdmin", group: "categories", takesReq: true },
  { method: "GET", path: "/api/entries", gate: "requireSession", group: "entries", takesReq: true },
  { method: "POST", path: "/api/entries", gate: "requireAdmin", group: "entries", takesReq: true },
  { method: "DELETE", path: "/api/entries", gate: "requireAdmin", group: "entries", takesReq: true },
  { method: "GET", path: "/api/entries/history", gate: "requireAdmin", group: "history", takesReq: true },
  { method: "GET", path: "/api/entries/years", gate: "requireSession", group: "entries", takesReq: false },
  { method: "GET", path: "/api/kpis", gate: "requireSession", group: "kpis", takesReq: false },
  { method: "POST", path: "/api/kpis", gate: "requireAdmin", group: "kpis", takesReq: true },
  { method: "PATCH", path: "/api/kpis", gate: "requireAdmin", group: "kpis", takesReq: true },
  { method: "DELETE", path: "/api/kpis", gate: "requireAdmin", group: "kpis", takesReq: true },
  { method: "GET", path: "/api/meta", gate: "requireSession", group: "reads", takesReq: false },
  { method: "GET", path: "/api/users", gate: "requireAdmin", group: "users", takesReq: false },
  { method: "POST", path: "/api/users", gate: "requireAdmin", group: "users", takesReq: true },
  { method: "PATCH", path: "/api/users", gate: "requireAdmin", group: "users", takesReq: true },
  { method: "DELETE", path: "/api/users", gate: "requireAdmin", group: "users", takesReq: true },
  { method: "PATCH", path: "/api/users/account", gate: "requireAdmin", group: "users", takesReq: true },
];

type Handler = (req?: NextRequest) => Promise<Response>;

const HANDLERS: Record<string, Handler> = {
  "GET /api/breakdowns": breakdowns.GET as Handler,
  "POST /api/breakdowns": breakdowns.POST as Handler,
  "DELETE /api/breakdowns": breakdowns.DELETE as Handler,
  "GET /api/categories": categories.GET as Handler,
  "POST /api/categories": categories.POST as Handler,
  "PATCH /api/categories": categories.PATCH as Handler,
  "DELETE /api/categories": categories.DELETE as Handler,
  "GET /api/entries": entries.GET as Handler,
  "POST /api/entries": entries.POST as Handler,
  "DELETE /api/entries": entries.DELETE as Handler,
  "GET /api/entries/history": entriesHistory.GET as Handler,
  "GET /api/entries/years": entriesYears.GET as Handler,
  "GET /api/kpis": kpis.GET as Handler,
  "POST /api/kpis": kpis.POST as Handler,
  "PATCH /api/kpis": kpis.PATCH as Handler,
  "DELETE /api/kpis": kpis.DELETE as Handler,
  "GET /api/meta": meta.GET as Handler,
  "GET /api/users": users.GET as Handler,
  "POST /api/users": users.POST as Handler,
  "PATCH /api/users": users.PATCH as Handler,
  "DELETE /api/users": users.DELETE as Handler,
  "PATCH /api/users/account": usersAccount.PATCH as Handler,
};

/**
 * Fixed CSRF token + cookie value used by the regression suite so the
 * shared request guard (D8AD-CAN-004) passes for the authz replay
 * cases. Real deployments use a 256-bit random value per session; the
 * value here is arbitrary because the guard only compares header to
 * cookie for equality.
 */
export const TEST_CSRF_TOKEN = "test-csrf-token-0123456789abcdef";

export const CSRF_COOKIE_NAME =
  (typeof process !== "undefined" && process.env?.CSRF_COOKIE_NAME) ||
  "eastern_state_kpi_csrf";

/** Default headers that satisfy the request guard for a mutation. */
function csrfPassHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    origin: "http://localhost",
    "x-csrf-token": TEST_CSRF_TOKEN,
    cookie: `${CSRF_COOKIE_NAME}=${TEST_CSRF_TOKEN}`,
  };
}

/**
 * Call a protected API route handler by (method, path). The caller
 * installs the desired session cookie into the (per-test-file) jar
 * BEFORE calling this; the handler reads `cookies()` → jar. Body is
 * JSON-encoded for non-GET requests; the auth gate runs before body
 * parsing on every protected route, so an empty/invalid body still
 * exercises the gate (used for the revoked/forbidden replay cases).
 *
 * D8AD-CAN-004: non-GET requests also carry a valid Origin, the
 * matching X-CSRF-Token header, and the CSRF cookie so the shared
 * request guard passes and the authz behavior is exercised
 * unchanged. Pass `headers` to override (e.g. to forge a bad Origin
 * or omit the token for CSRF-failure tests).
 */
export async function dispatch(
  method: HttpMethod,
  path: string,
  body: unknown = {},
  headers: Record<string, string> = {},
): Promise<Response> {
  const handler = HANDLERS[`${method} ${path}`];
  if (!handler) {
    throw new Error(`No handler registered for ${method} ${path}`);
  }
  const base =
    method === "GET"
      ? { "content-type": "application/json" }
      : csrfPassHeaders();
  const req = new NextRequest(
    new Request(`http://localhost${path}`, {
      method,
      headers: { ...base, ...headers },
      body: method === "GET" ? undefined : JSON.stringify(body),
    }),
  );
  return handler(req);
}

/** Account factories (active, non-must_change unless requested). */
export function createAdmin(
  email = "admin-regression@example.com",
  password = "AdminReg!2026",
): User {
  return createUser({ email, name: "Admin Regression", password, role: "admin" });
}

export function createViewer(
  email = "viewer-regression@example.com",
  password = "ViewerReg!2026",
): User {
  return createUser({ email, name: "Viewer Regression", password, role: "viewer" });
}

/**
 * Shared-boundary response assertions. Every protected route uses
 * `authErrorResponse`, so the shapes are uniform across the whole API.
 */

/** 401 `{error:"Unauthorized"}`, no account details leaked. */
export async function assertUnauthorized(res: Response): Promise<void> {
  expect(res.status).toBe(401);
  const body = await res.json();
  expect(body.error).toBe("Unauthorized");
  // req 8 / req 9: no account detail leakage in an unauthorized body.
  const text = JSON.stringify(body);
  expect(text).not.toMatch(/@example\.com|easternstate|password|must_change|sessions_valid_after/i);
}

/** 403 `{error:"Forbidden"}`, no account details leaked. */
export async function assertForbidden(res: Response): Promise<void> {
  expect(res.status).toBe(403);
  const body = await res.json();
  expect(body.error).toBe("Forbidden");
}

/** 2xx (default 200) — the gate let an authenticated caller through. */
export async function assertOk(res: Response, status = 200): Promise<void> {
  expect(res.status).toBe(status);
}

/** Routes whose handlers do not accept a NextRequest argument. */
export function routeKey(r: ProtectedRoute): string {
  return `${r.method} ${r.path}`;
}