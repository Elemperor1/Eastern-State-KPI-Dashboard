/**
 * Reusable helpers for the D8AD-CAN-003 regression suite
 * (`src/lib/auth-regression.test.ts` and other authz tests).
 *
 * These helpers are pure with respect to the cookie transport: the
 * caller owns the in-memory cookie jar (set up per test file via
 * `vi.mock("next/headers", ...)`), installs a captured cookie before
 * calling `dispatch`, and inspects the returned Response. The helpers
 * only know how to (a) call any protected API route handler by
 * (method, path), and (b) assert the shared
 * authorization-boundary response shapes.
 *
 * ## Protected API routes covered by the suite
 *
 * Every route below is gated by the SHARED authorization boundary in
 * `src/features/auth/session.ts` — `requireSession` (any authenticated,
 * non-must_change user) and `requireAdmin` (additionally role ===
 * "admin"). A revoked session (deleted / disabled / watermark-bumped)
 * yields 401 `{error:"Unauthorized"}` on ALL of them, because
 * `requireAdmin` calls `requireSession` first and `getCurrentUser`
 * returns null for a revoked cookie. A valid viewer session yields
 * 403 `{error:"Forbidden"}` on the admin-gated routes.
 *
 *   POST   /api/categories        requireAdmin     (categories write)
 *   PATCH  /api/categories        requireAdmin     (categories write)
 *   DELETE /api/categories        requireAdmin     (categories write)
 *   POST   /api/kpis              requireAdmin     (KPI definitions write)
 *   PATCH  /api/kpis              requireAdmin     (KPI definitions write)
 *   DELETE /api/kpis              requireAdmin     (KPI definitions write)
 *   POST   /api/users             requireAdmin     (user management write)
 *   PATCH  /api/users             requireAdmin     (user management write — password reset)
 *   DELETE /api/users             requireAdmin     (user management write — deletion)
 *   PATCH  /api/users/account     requireAdmin     (user management write — role/disable)
 *   GET    /api/strategy/export   requireSession   (board report export)
 *   POST   /api/strategy/observations        requireAdmin (strategic KPI value write)
 *   DELETE /api/strategy/observations        requireAdmin (strategic KPI value delete)
 *   POST   /api/strategy/component-entries   requireAdmin (component value write)
 *   DELETE /api/strategy/component-entries   requireAdmin (component value delete)
 *   POST   /api/strategy/distributions       requireAdmin (distribution value write)
 *   DELETE /api/strategy/distributions       requireAdmin (distribution value delete)
 *   GET    /api/strategy/distribution-bands  requireSession (effective band definitions)
 *   POST   /api/strategy/distribution-bands  requireAdmin (band definition create)
 *   PATCH  /api/strategy/distribution-bands  requireAdmin (band lifecycle mutation)
 *   POST   /api/strategy/configurations      requireAdmin (measurement configuration create)
 *   PATCH  /api/strategy/configurations      requireAdmin (measurement configuration lifecycle)
 *   POST   /api/strategy/components          requireAdmin (component definition create)
 *   PATCH  /api/strategy/components          requireAdmin (component definition lifecycle)
 *   POST   /api/strategy/targets             requireAdmin (target create)
 *   PATCH  /api/strategy/targets             requireAdmin (target lifecycle)
 *   PATCH  /api/strategy/goals               requireAdmin (strategic goal settings/lifecycle)
 *   PATCH  /api/strategy/memberships         requireAdmin (goal membership settings)
 *   PATCH  /api/strategy/board-reporting     requireAdmin (Board visibility replacement)
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
 *   GET    /api/health/ready        PUBLIC operational exception. Uses an
 *                                  independent read-only SQLite probe and
 *                                  returns only a constant-shape readiness
 *                                  status; it imports no session boundary.
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

import * as categories from "@/app/api/categories/route";
import * as kpis from "@/app/api/kpis/route";
import * as users from "@/app/api/users/route";
import * as usersAccount from "@/app/api/users/account/route";
import * as strategyExport from "@/app/api/strategy/export/route";
import * as strategyObservations from "@/app/api/strategy/observations/route";
import * as strategyComponentEntries from "@/app/api/strategy/component-entries/route";
import * as strategyDistributions from "@/app/api/strategy/distributions/route";
import * as strategyDistributionBands from "@/app/api/strategy/distribution-bands/route";
import * as strategyConfigurations from "@/app/api/strategy/configurations/route";
import * as strategyComponents from "@/app/api/strategy/components/route";
import * as strategyTargets from "@/app/api/strategy/targets/route";
import * as strategyGoals from "@/app/api/strategy/goals/route";
import * as strategyMemberships from "@/app/api/strategy/memberships/route";
import * as strategyBoardReporting from "@/app/api/strategy/board-reporting/route";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
type Gate = "requireSession" | "requireStaffSession" | "requireAdmin";

export interface ProtectedRoute {
  method: HttpMethod;
  path: string;
  gate: Gate;
  /** Functional group, for the requirement-6 coverage matrix. */
  group:
    | "writes"
    | "kpis"
    | "categories"
    | "users"
    | "exports"
    | "strategy_values"
    | "strategy_configuration";
  /** Whether the handler signature accepts a NextRequest argument. */
  takesReq: boolean;
}

/**
 * The exhaustive table of protected API routes covered by the
 * regression suite. Adding a new protected route? Add it here and the
 * whole replay/forbidden/ok matrix extends automatically.
 */
export const PROTECTED_API_ROUTES: ProtectedRoute[] = [
  { method: "GET", path: "/api/strategy/export", gate: "requireSession", group: "exports", takesReq: true },
  { method: "POST", path: "/api/strategy/observations", gate: "requireAdmin", group: "strategy_values", takesReq: true },
  { method: "DELETE", path: "/api/strategy/observations", gate: "requireAdmin", group: "strategy_values", takesReq: true },
  { method: "POST", path: "/api/strategy/component-entries", gate: "requireAdmin", group: "strategy_values", takesReq: true },
  { method: "DELETE", path: "/api/strategy/component-entries", gate: "requireAdmin", group: "strategy_values", takesReq: true },
  { method: "POST", path: "/api/strategy/distributions", gate: "requireAdmin", group: "strategy_values", takesReq: true },
  { method: "DELETE", path: "/api/strategy/distributions", gate: "requireAdmin", group: "strategy_values", takesReq: true },
  { method: "GET", path: "/api/strategy/distribution-bands", gate: "requireStaffSession", group: "strategy_values", takesReq: true },
  { method: "POST", path: "/api/strategy/distribution-bands", gate: "requireAdmin", group: "strategy_values", takesReq: true },
  { method: "PATCH", path: "/api/strategy/distribution-bands", gate: "requireAdmin", group: "strategy_values", takesReq: true },
  { method: "POST", path: "/api/strategy/configurations", gate: "requireAdmin", group: "strategy_configuration", takesReq: true },
  { method: "PATCH", path: "/api/strategy/configurations", gate: "requireAdmin", group: "strategy_configuration", takesReq: true },
  { method: "POST", path: "/api/strategy/components", gate: "requireAdmin", group: "strategy_configuration", takesReq: true },
  { method: "PATCH", path: "/api/strategy/components", gate: "requireAdmin", group: "strategy_configuration", takesReq: true },
  { method: "POST", path: "/api/strategy/targets", gate: "requireAdmin", group: "strategy_configuration", takesReq: true },
  { method: "PATCH", path: "/api/strategy/targets", gate: "requireAdmin", group: "strategy_configuration", takesReq: true },
  { method: "PATCH", path: "/api/strategy/goals", gate: "requireAdmin", group: "strategy_configuration", takesReq: true },
  { method: "PATCH", path: "/api/strategy/memberships", gate: "requireAdmin", group: "strategy_configuration", takesReq: true },
  { method: "PATCH", path: "/api/strategy/board-reporting", gate: "requireAdmin", group: "strategy_configuration", takesReq: true },
  { method: "POST", path: "/api/categories", gate: "requireAdmin", group: "categories", takesReq: true },
  { method: "PATCH", path: "/api/categories", gate: "requireAdmin", group: "categories", takesReq: true },
  { method: "DELETE", path: "/api/categories", gate: "requireAdmin", group: "categories", takesReq: true },
  { method: "POST", path: "/api/kpis", gate: "requireAdmin", group: "kpis", takesReq: true },
  { method: "PATCH", path: "/api/kpis", gate: "requireAdmin", group: "kpis", takesReq: true },
  { method: "DELETE", path: "/api/kpis", gate: "requireAdmin", group: "kpis", takesReq: true },
  { method: "POST", path: "/api/users", gate: "requireAdmin", group: "users", takesReq: true },
  { method: "PATCH", path: "/api/users", gate: "requireAdmin", group: "users", takesReq: true },
  { method: "DELETE", path: "/api/users", gate: "requireAdmin", group: "users", takesReq: true },
  { method: "PATCH", path: "/api/users/account", gate: "requireAdmin", group: "users", takesReq: true },
];

type Handler = (req?: NextRequest) => Promise<Response>;

const HANDLERS: Record<string, Handler> = {
  "GET /api/strategy/export": strategyExport.GET as Handler,
  "POST /api/strategy/observations": strategyObservations.POST as Handler,
  "DELETE /api/strategy/observations": strategyObservations.DELETE as Handler,
  "POST /api/strategy/component-entries": strategyComponentEntries.POST as Handler,
  "DELETE /api/strategy/component-entries": strategyComponentEntries.DELETE as Handler,
  "POST /api/strategy/distributions": strategyDistributions.POST as Handler,
  "DELETE /api/strategy/distributions": strategyDistributions.DELETE as Handler,
  "GET /api/strategy/distribution-bands": strategyDistributionBands.GET as Handler,
  "POST /api/strategy/distribution-bands": strategyDistributionBands.POST as Handler,
  "PATCH /api/strategy/distribution-bands": strategyDistributionBands.PATCH as Handler,
  "POST /api/strategy/configurations": strategyConfigurations.POST as Handler,
  "PATCH /api/strategy/configurations": strategyConfigurations.PATCH as Handler,
  "POST /api/strategy/components": strategyComponents.POST as Handler,
  "PATCH /api/strategy/components": strategyComponents.PATCH as Handler,
  "POST /api/strategy/targets": strategyTargets.POST as Handler,
  "PATCH /api/strategy/targets": strategyTargets.PATCH as Handler,
  "PATCH /api/strategy/goals": strategyGoals.PATCH as Handler,
  "PATCH /api/strategy/memberships": strategyMemberships.PATCH as Handler,
  "PATCH /api/strategy/board-reporting": strategyBoardReporting.PATCH as Handler,
  "POST /api/categories": categories.POST as Handler,
  "PATCH /api/categories": categories.PATCH as Handler,
  "DELETE /api/categories": categories.DELETE as Handler,
  "POST /api/kpis": kpis.POST as Handler,
  "PATCH /api/kpis": kpis.PATCH as Handler,
  "DELETE /api/kpis": kpis.DELETE as Handler,
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
const TEST_CSRF_TOKEN = "test-csrf-token-0123456789abcdef";

const CSRF_COOKIE_NAME = "eastern_state_kpi_csrf";

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
