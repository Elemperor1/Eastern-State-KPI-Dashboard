/**
 * D8AD-CAN-004 hardening — positive and negative route tests for the
 * shared request guard on every state-changing mutation handler.
 *
 * For each in-scope handler:
 *   + positive: valid Origin + application/json + matching X-CSRF-Token
 *     → the guard passes and the handler reaches its data layer (2xx).
 *   − negative: cross-site Origin               → 403 Forbidden
 *   − negative: text/plain content-type         → 415 Unsupported Media Type
 *   − negative: missing X-CSRF-Token            → 403 Forbidden
 *   − negative: mismatched X-CSRF-Token          → 403 Forbidden
 *
 * Authorization is mocked to a fixed admin so the guard (which runs
 * AFTER authz) is the layer under test. The data layer is mocked so the
 * positive path returns the handler's success status without a DB.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// --- Mocks: authz passes; data layer is a no-op ---------------------

const ADMIN = {
  id: 1,
  email: "admin@easternstate.org",
  name: "Admin",
  role: "admin" as const,
  must_change_password: true,
};

vi.mock("@/features/auth/session", () => ({
  requireAdmin: vi.fn(async () => ADMIN),
  requireSession: vi.fn(async () => ADMIN),
  getCurrentUser: vi.fn(async () => ADMIN),
  getSession: vi.fn(async () => ({
    user: ADMIN,
    destroy: vi.fn(async () => {}),
    save: vi.fn(async () => {}),
  })),
  authErrorResponse: (err: { status?: number }) => {
    const status = err?.status === 403 ? 403 : 401;
    return new Response(JSON.stringify({ error: status === 403 ? "Forbidden" : "Unauthorized" }), {
      status,
      headers: { "content-type": "application/json" },
    });
  },
  AuthError: class AuthError extends Error {
    constructor(message: string, public status: number) {
      super(message);
      this.name = "AuthError";
    }
  },
}));

vi.mock("@/features/auth/server", () => ({
  verifyCredentials: vi.fn(async () => ({
    user: ADMIN,
    credentialVersion: 1,
    passwordHash: "$2a$10$test",
  })),
}));

vi.mock("@/features/users/server", () => ({
  createUser: vi.fn(() => ({ id: 2, email: "new@test", name: "New", role: "viewer" })),
  deleteUser: vi.fn(() => {}),
  listUsers: vi.fn(() => []),
  updateUserPassword: vi.fn(() => {}),
  updateUserPasswordIfCurrent: vi.fn(() => true),
  findUserById: vi.fn((id: number) => ({
    id,
    email: "target@test",
    name: "Target",
    role: "viewer",
    disabled: false,
  })),
  setUserDisabled: vi.fn(() => {}),
  updateUserRole: vi.fn(() => {}),
}));

vi.mock("@/features/catalog/server", () => ({
  CatalogEntityNotFoundError: class CatalogEntityNotFoundError extends Error {},
  DependentEntriesError: class DependentEntriesError extends Error {},
  listKPIs: vi.fn(() => []),
  getKPI: vi.fn(() => ({ id: 1 })),
  createStrategicMeasure: vi.fn(() => ({
    kpi: { id: 1 },
    membership: { id: 1 },
    configuration: { id: 1 },
  })),
  updateKPI: vi.fn(() => {}),
  archiveKPI: vi.fn(() => {}),
  restoreKPI: vi.fn(() => {}),
  retireOrDeleteKPI: vi.fn(() => "deleted"),
  listCategories: vi.fn(() => []),
  createCategory: vi.fn(() => ({ id: 1 })),
  updateCategory: vi.fn(() => {}),
  archiveCategory: vi.fn(() => {}),
  restoreCategory: vi.fn(() => {}),
  retireOrDeleteCategory: vi.fn(() => "deleted"),
}));

vi.mock("@/features/strategy/server", async () => {
  const actual = await vi.importActual<typeof import("@/features/strategy/server")>(
    "@/features/strategy/server",
  );
  return {
    ...actual,
    upsertStrategyObservation: vi.fn(() => ({ id: 1 })),
    deleteStrategyObservation: vi.fn(() => {}),
    upsertStrategyComponentEntry: vi.fn(() => ({ id: 1 })),
    upsertStrategyMultiComponentBatch: vi.fn(() => [{ id: 1 }]),
    deleteStrategyComponentEntry: vi.fn(() => {}),
    upsertStrategyDistribution: vi.fn(() => ({ id: 1, bands: [] })),
    deleteStrategyDistribution: vi.fn(() => {}),
    createStrategyDistributionBand: vi.fn(() => ({ id: 1 })),
    updateStrategyDistributionBand: vi.fn(() => ({ id: 1 })),
    reorderStrategyDistributionBands: vi.fn(() => []),
    archiveStrategyDistributionBand: vi.fn(() => ({ id: 1 })),
    restoreStrategyDistributionBand: vi.fn(() => ({ id: 1 })),
    listEffectiveDistributionBands: vi.fn(() => []),
    createMeasurementConfiguration: vi.fn(() => ({ id: 1 })),
    updateMeasurementConfiguration: vi.fn(() => ({ id: 1 })),
    archiveMeasurementConfig: vi.fn(() => {}),
    restoreMeasurementConfig: vi.fn(() => {}),
    getMeasurementConfigRecord: vi.fn(() => ({ id: 1 })),
    createStrategyComponent: vi.fn(() => ({ id: 1 })),
    updateStrategyComponent: vi.fn(() => ({ id: 1 })),
    reorderStrategyComponents: vi.fn(() => []),
    archiveComponent: vi.fn(() => {}),
    restoreComponent: vi.fn(() => {}),
    getComponentRecord: vi.fn(() => ({ id: 1 })),
    createStrategicTarget: vi.fn(() => ({ id: 1 })),
    updateStrategicTarget: vi.fn(() => ({ id: 1 })),
    archiveTarget: vi.fn(() => {}),
    restoreTarget: vi.fn(() => {}),
    getTargetRecord: vi.fn(() => ({ id: 1 })),
    updateStrategicGoalSettings: vi.fn(() => ({ id: 1 })),
    updateStrategicGoalMembership: vi.fn(() => ({ id: 1 })),
    archiveStrategicGoal: vi.fn(() => {}),
    restoreStrategicGoal: vi.fn(() => {}),
    getStrategicGoalRecord: vi.fn(() => ({ id: 1 })),
  };
});

// Handlers under test.
import * as users from "@/app/api/users/route";
import * as usersAccount from "@/app/api/users/account/route";
import * as changePassword from "@/app/api/auth/change-password/route";
import * as kpis from "@/app/api/kpis/route";
import * as categories from "@/app/api/categories/route";
import * as strategyObservations from "@/app/api/strategy/observations/route";
import * as strategyComponentEntries from "@/app/api/strategy/component-entries/route";
import * as strategyDistributions from "@/app/api/strategy/distributions/route";
import * as strategyDistributionBands from "@/app/api/strategy/distribution-bands/route";
import * as strategyConfigurations from "@/app/api/strategy/configurations/route";
import * as strategyComponents from "@/app/api/strategy/components/route";
import * as strategyTargets from "@/app/api/strategy/targets/route";
import * as strategyGoals from "@/app/api/strategy/goals/route";
import * as strategyMemberships from "@/app/api/strategy/memberships/route";

const CSRF_COOKIE = "eastern_state_kpi_csrf";
const TOKEN = "test-csrf-token-0123456789abcdef";

type Handler = (req: NextRequest) => Promise<Response>;

interface Case {
  name: string;
  method: "POST" | "PATCH" | "DELETE";
  path: string;
  handler: Handler;
  okStatus: number;
  body: Record<string, unknown>;
}

const CASES: Case[] = [
  { name: "POST /api/strategy/observations", method: "POST", path: "/api/strategy/observations", handler: strategyObservations.POST, okStatus: 201,
    body: { kpi_id: 1, reporting_year: 2026, value: 10 } },
  { name: "DELETE /api/strategy/observations", method: "DELETE", path: "/api/strategy/observations", handler: strategyObservations.DELETE, okStatus: 200,
    body: { id: 1 } },
  { name: "POST /api/strategy/component-entries", method: "POST", path: "/api/strategy/component-entries", handler: strategyComponentEntries.POST, okStatus: 201,
    body: { component_id: 1, reporting_year: 2026, value: 10 } },
  { name: "DELETE /api/strategy/component-entries", method: "DELETE", path: "/api/strategy/component-entries", handler: strategyComponentEntries.DELETE, okStatus: 200,
    body: { id: 1 } },
  { name: "POST /api/strategy/distributions", method: "POST", path: "/api/strategy/distributions", handler: strategyDistributions.POST, okStatus: 201,
    body: { kpi_id: 1, reporting_year: 2026, respondent_count: 1, bands: [{ slug: "known", label: "Known", count: 1, display_order: 0 }] } },
  { name: "DELETE /api/strategy/distributions", method: "DELETE", path: "/api/strategy/distributions", handler: strategyDistributions.DELETE, okStatus: 200,
    body: { id: 1 } },
  { name: "POST /api/strategy/distribution-bands", method: "POST", path: "/api/strategy/distribution-bands", handler: strategyDistributionBands.POST, okStatus: 201,
    body: { kpi_id: 1, slug: "known", label: "Known", effective_from_year: 2025, display_order: 0 } },
  { name: "PATCH /api/strategy/distribution-bands", method: "PATCH", path: "/api/strategy/distribution-bands", handler: strategyDistributionBands.PATCH, okStatus: 200,
    body: { action: "archive", id: 1 } },
  { name: "POST /api/strategy/configurations", method: "POST", path: "/api/strategy/configurations", handler: strategyConfigurations.POST, okStatus: 201,
    body: { kpi_id: 1, measurement_type: "count", unit: "items", numerator_label: null, denominator_label: null, fixed_denominator: null, baseline_value: null, reporting_frequency: "annual", aggregation_method: "none", board_level_status: "not_reported", calculation_precision: 1, allow_score_over_max: false, effective_start_year: 2025, effective_end_year: 2029, configuration_status: "active", unresolved_question: null, owner: null, due_date: null, resolution_notes: null, source_reference: null, last_reviewed_date: null } },
  { name: "PATCH /api/strategy/configurations", method: "PATCH", path: "/api/strategy/configurations", handler: strategyConfigurations.PATCH, okStatus: 200,
    body: { action: "archive", id: 1 } },
  { name: "POST /api/strategy/components", method: "POST", path: "/api/strategy/components", handler: strategyComponents.POST, okStatus: 201,
    body: { configuration_id: 1, slug: "visits", label: "Visits", measurement_type: "count", unit: "visits", display_order: 0, configuration_status: "draft" } },
  { name: "PATCH /api/strategy/components", method: "PATCH", path: "/api/strategy/components", handler: strategyComponents.PATCH, okStatus: 200,
    body: { action: "archive", id: 1 } },
  { name: "POST /api/strategy/targets", method: "POST", path: "/api/strategy/targets", handler: strategyTargets.POST, okStatus: 201,
    body: { kpi_id: 1, target_scope: "full_plan", target_year: 2029, target_value: 0 } },
  { name: "PATCH /api/strategy/targets", method: "PATCH", path: "/api/strategy/targets", handler: strategyTargets.PATCH, okStatus: 200,
    body: { action: "archive", id: 1 } },
  { name: "PATCH /api/strategy/goals", method: "PATCH", path: "/api/strategy/goals", handler: strategyGoals.PATCH, okStatus: 200,
    body: { action: "archive", id: 1 } },
  { name: "PATCH /api/strategy/memberships", method: "PATCH", path: "/api/strategy/memberships", handler: strategyMemberships.PATCH, okStatus: 200,
    body: { id: 1, role: "informational", weight: 1, display_order: 0 } },
  { name: "POST /api/users", method: "POST", path: "/api/users", handler: users.POST, okStatus: 201,
    body: { email: "new@x.test", name: "New", password: "password123", role: "viewer" } },
  { name: "PATCH /api/users", method: "PATCH", path: "/api/users", handler: users.PATCH, okStatus: 200,
    body: { id: 2, password: "password123" } },
  { name: "DELETE /api/users", method: "DELETE", path: "/api/users", handler: users.DELETE, okStatus: 200,
    body: { id: 2 } },
  { name: "PATCH /api/users/account", method: "PATCH", path: "/api/users/account", handler: usersAccount.PATCH, okStatus: 200,
    body: { id: 2, role: "viewer" } },
  { name: "POST /api/auth/change-password", method: "POST", path: "/api/auth/change-password", handler: changePassword.POST, okStatus: 200,
    body: { currentPassword: "tempPass123!", newPassword: "newPass456!" } },
  { name: "POST /api/kpis", method: "POST", path: "/api/kpis", handler: kpis.POST, okStatus: 201,
    body: { goal_id: 1, reporting_year: 2026, slug: "k", name: "K", unit: "items", measurement_type: "count", reporting_frequency: "annual", direction: "higher" } },
  { name: "PATCH /api/kpis", method: "PATCH", path: "/api/kpis", handler: kpis.PATCH, okStatus: 200,
    body: { id: 1, name: "K2" } },
  { name: "DELETE /api/kpis", method: "DELETE", path: "/api/kpis", handler: kpis.DELETE, okStatus: 200,
    body: { id: 1 } },
  { name: "POST /api/categories", method: "POST", path: "/api/categories", handler: categories.POST, okStatus: 201,
    body: { slug: "c", name: "C" } },
  { name: "PATCH /api/categories", method: "PATCH", path: "/api/categories", handler: categories.PATCH, okStatus: 200,
    body: { id: 1, name: "C2" } },
  { name: "DELETE /api/categories", method: "DELETE", path: "/api/categories", handler: categories.DELETE, okStatus: 200,
    body: { id: 1 } },
];

/** Build a NextRequest with configurable CSRF-relevant headers. */
function buildReq(
  c: Case,
  opts: {
    origin?: string | null; // null = omit header; default same-origin
    ct?: string; // content-type; default application/json
    token?: string | null; // X-CSRF-Token; null = omit
    cookie?: string | null; // CSRF cookie value; null = omit
  } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  headers["content-type"] = opts.ct ?? "application/json";
  if (opts.origin !== null) headers["origin"] = opts.origin ?? "http://localhost";
  if (opts.token !== null) headers["x-csrf-token"] = opts.token ?? TOKEN;
  if (opts.cookie !== null) {
    headers["cookie"] = `${CSRF_COOKIE}=${opts.cookie ?? TOKEN}`;
  }
  return new NextRequest(
    new Request(`http://localhost${c.path}`, {
      method: c.method,
      headers,
      body: JSON.stringify(c.body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // No APP_CANONICAL_ORIGIN → guard derives allowed origin from the
  // request's own URL (http://localhost), the zero-config secure default.
  delete process.env.APP_CANONICAL_ORIGIN;
});

describe("D8AD-CAN-004 shared request guard — per-handler", () => {
  for (const c of CASES) {
    describe(c.name, () => {
      it("positive: valid Origin + application/json + matching token → 2xx", async () => {
        const res = await c.handler(buildReq(c));
        expect(res.status).toBe(c.okStatus);
      });

      it("negative: cross-site Origin → 403 Forbidden", async () => {
        const res = await c.handler(buildReq(c, { origin: "http://evil.attacker.com" }));
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: "Forbidden" });
      });

      it("negative: same-site sibling Origin → 403 Forbidden", async () => {
        // Sibling subdomain: same site, different origin → rejected.
        const res = await c.handler(buildReq(c, { origin: "http://evil.localhost" }));
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: "Forbidden" });
      });

      it("negative: text/plain content-type → 415 Unsupported Media Type", async () => {
        const res = await c.handler(buildReq(c, { ct: "text/plain" }));
        expect(res.status).toBe(415);
        expect(await res.json()).toEqual({ error: "Unsupported Media Type" });
      });

      it("negative: application/x-www-form-urlencoded → 415", async () => {
        const res = await c.handler(buildReq(c, { ct: "application/x-www-form-urlencoded" }));
        expect(res.status).toBe(415);
      });

      it("negative: multipart/form-data → 415", async () => {
        const res = await c.handler(buildReq(c, { ct: "multipart/form-data" }));
        expect(res.status).toBe(415);
      });

      it("negative: missing X-CSRF-Token → 403 Forbidden", async () => {
        const res = await c.handler(buildReq(c, { token: null }));
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: "Forbidden" });
      });

      it("negative: missing CSRF cookie → 403 Forbidden", async () => {
        const res = await c.handler(buildReq(c, { cookie: null }));
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: "Forbidden" });
      });

      it("negative: mismatched X-CSRF-Token → 403 Forbidden", async () => {
        const res = await c.handler(buildReq(c, { token: "wrong-token-value" }));
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: "Forbidden" });
      });

      it("negative: missing Origin AND missing Referer → 403 Forbidden", async () => {
        const res = await c.handler(buildReq(c, { origin: null }));
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: "Forbidden" });
      });

      it("negative: opaque Origin (null) → 403 Forbidden", async () => {
        const res = await c.handler(buildReq(c, { origin: "null" }));
        expect(res.status).toBe(403);
      });

      it("Referer fallback: missing Origin but same-origin Referer → 2xx", async () => {
        const req = buildReq(c, { origin: null });
        req.headers.set("referer", "http://localhost/admin");
        const res = await c.handler(req);
        expect(res.status).toBe(c.okStatus);
      });

      it("Referer fallback: missing Origin but cross-site Referer → 403", async () => {
        const req = buildReq(c, { origin: null });
        req.headers.set("referer", "http://evil.attacker.com/admin");
        const res = await c.handler(req);
        expect(res.status).toBe(403);
      });
    });
  }
});

describe("D8AD-CAN-004 shared request guard — guard unit functions", () => {
  it("uses the incoming Host when Next's internal URL has a different authority", async () => {
    const req = new NextRequest("http://localhost:3000/api/users", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3290",
        origin: "http://127.0.0.1:3290",
      },
    });
    const { checkOriginOrReferer } = await import("@/lib/request-guard");
    expect(checkOriginOrReferer(req)).toBeNull();
  });

  it("canonicalOrigins honors APP_CANONICAL_ORIGIN (comma list)", async () => {
    process.env.APP_CANONICAL_ORIGIN = "https://app.example.com, https://app2.example.com";
    const req = new NextRequest("http://other.test/api/users", {
      method: "POST",
      headers: { origin: "https://app2.example.com" },
    });
    // Re-import the guard fresh so it reads the env. The guard reads
    // process.env at call time, so no re-import is strictly needed.
    const { checkOriginOrReferer } = await import("@/lib/request-guard");
    expect(checkOriginOrReferer(req)).toBeNull();
    const bad = new NextRequest("http://other.test/api/users", {
      method: "POST",
      headers: { origin: "https://evil.example.com" },
    });
    expect(checkOriginOrReferer(bad)).toBe("origin-mismatch");
    delete process.env.APP_CANONICAL_ORIGIN;
  });

  it("checkJsonContentType rejects parameters-bearing types only by media type", async () => {
    const { checkJsonContentType } = await import("@/lib/request-guard");
    const mk = (ct: string) =>
      new NextRequest("http://localhost/api/users", {
        method: "POST",
        headers: { "content-type": ct },
      });
    expect(checkJsonContentType(mk("application/json"))).toBe(true);
    expect(checkJsonContentType(mk("application/json; charset=utf-8"))).toBe(true);
    expect(checkJsonContentType(mk("text/plain"))).toBe(false);
    expect(checkJsonContentType(mk("application/x-www-form-urlencoded"))).toBe(false);
    expect(checkJsonContentType(mk("multipart/form-data"))).toBe(false);
    expect(checkJsonContentType(mk(""))).toBe(false);
  });

  it("checkCsrfToken reports the specific failure reason", async () => {
    const { checkCsrfToken } = await import("@/lib/request-guard");
    const mk = (token?: string, cookie?: string) => {
      const h: Record<string, string> = {};
      if (token !== undefined) h["x-csrf-token"] = token;
      if (cookie !== undefined) h["cookie"] = `${CSRF_COOKIE}=${cookie}`;
      return new NextRequest("http://localhost/api/users", { method: "POST", headers: h });
    };
    expect(checkCsrfToken(mk(TOKEN, TOKEN))).toBeNull();
    expect(checkCsrfToken(mk(TOKEN, undefined))).toBe("csrf-cookie-missing");
    expect(checkCsrfToken(mk(undefined, TOKEN))).toBe("csrf-token-missing");
    expect(checkCsrfToken(mk("wrong", TOKEN))).toBe("csrf-token-mismatch");
  });

  it("issueCsrfToken produces distinct 256-bit tokens", async () => {
    const { issueCsrfToken } = await import("@/lib/request-guard");
    const a = issueCsrfToken();
    const b = issueCsrfToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it("ensureCsrfCookie sets a cookie when absent and reuses when present", async () => {
    const { ensureCsrfCookie } = await import("@/lib/request-guard");
    const reqAbsent = new NextRequest("http://localhost/api/auth/me", { method: "GET" });
    const res1 = NextResponse.json({});
    const r1 = ensureCsrfCookie(reqAbsent, res1);
    expect(r1.set).toBe(true);
    expect(r1.token.length).toBeGreaterThanOrEqual(32);
    const reqPresent = new NextRequest("http://localhost/api/auth/me", {
      method: "GET",
      headers: { cookie: `${CSRF_COOKIE}=${r1.token}` },
    });
    const res2 = NextResponse.json({});
    const r2 = ensureCsrfCookie(reqPresent, res2);
    expect(r2.set).toBe(false);
    expect(r2.token).toBe(r1.token);
  });
});
