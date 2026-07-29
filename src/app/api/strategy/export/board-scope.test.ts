/**
 * Board-scope ABSENCE contract for the export boundary (S103-C1).
 *
 * The threat-model invariant "strategic reads honor the persisted
 * Board scope on every surface and export" was previously asserted
 * only by PRESENCE checks (the in-scope content is there) and by
 * query-layer unit tests with a mocked reporting server. This suite
 * runs the REAL stack — disposable temp SQLite database seeded with
 * the canonical 5-priority / 22-goal / 59-KPI configuration, the real
 * session boundary, the real `GET /api/strategy/export` handler, and
 * the real `loadBoardReportPageData` scoping path — and asserts the
 * negative: with a persisted Board scope narrowed to a single
 * priority and a single linked measure, the Board export contains
 * NONE of the out-of-scope priorities or KPI names, in both the JSON
 * and CSV shapes, while the staff export of the same database still
 * contains them (the control that makes the absence meaningful).
 *
 * Only the cookie transport is faked (in-memory jar via
 * `vi.mock("next/headers", ...)`), matching src/lib/auth-regression.test.ts.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/* ------------------------------------------------------------------ *
 * In-memory cookie jar (fakes only the transport; iron-session, the
 * session boundary, the export handler, and the scoping queries are
 * all real).
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
import { STRATEGIC_PLAN_CATEGORIES } from "@/features/catalog/strategic-plan";
import { getDb, resetDb } from "@/lib/db";
import { bootstrapTestInstallation } from "@/features/installation/test-fixture";
import { initializeStrategicPlanConfiguration } from "@/features/strategy/mutations";
import { EASTERN_STATE_STRATEGIC_CONFIGURATION_FIXTURE } from "../../../../../scripts/bootstrap/strategic-configuration-fixture";
import {
  getBoardReportingScope,
  updateBoardReportingScope,
} from "@/features/board-reporting/server";
import { createUser } from "@/features/users/server";
import { _resetForTests as resetThrottle } from "@/lib/login-throttle";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { GET as exportGet } from "./route";

const COOKIE_NAME = "eastern_state_kpi_session";

/** Names that MUST survive Board scoping (the single linked measure). */
const IN_SCOPE_KPI_NAME = "Modernized Exhibits — Attendance increase vs baseline";
/** Names that MUST NOT appear in a Board-scoped export. */
const OUT_OF_SCOPE_SAME_PRIORITY_KPI = "Interpretive Site Plan — Plan adoption by Board";
const OUT_OF_SCOPE_OTHER_PRIORITY_KPI =
  "Schools & Educators — Total participants in justice education";
const OUT_OF_SCOPE_PRIORITY_NAME = "Advance Historic Preservation";
const OUT_OF_SCOPE_BOARD_TITLE = "Priority 2: Advancing Historic Preservation";

interface Account {
  id: number;
  email: string;
  password: string;
}

let tmpDir: string;
let dbPath: string;
let databaseIndex = 0;
let originalDbPath: string | undefined;
const originalEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-board-export-"));
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

/** Seed the canonical 5-priority, 59-KPI catalog into the active DB. */
function seedCanonicalCatalog(): void {
  const db = getDb();
  const insertCategory = db.prepare(
    `INSERT INTO categories (plan_id, slug, name, description, sort_order)
     VALUES ((SELECT id FROM strategic_plans WHERE status = 'active'), ?, ?, ?, ?)`,
  );
  const insertKpi = db.prepare(
    `INSERT INTO kpis (
       category_id, slug, name, unit, unit_type, reporting_frequency,
       direction, description, sort_order
     ) VALUES (?, ?, ?, ?, ?, 'annual', ?, ?, ?)`,
  );
  for (const category of STRATEGIC_PLAN_CATEGORIES) {
    const categoryId = Number(
      insertCategory.run(
        category.slug,
        category.name,
        category.description,
        category.sort_order,
      ).lastInsertRowid,
    );
    for (const kpi of category.annual) {
      insertKpi.run(
        categoryId,
        kpi.slug,
        kpi.name,
        kpi.unit,
        kpi.unit_type,
        kpi.direction,
        kpi.description,
        kpi.sort_order,
      );
    }
    for (const kpi of category.breakdown ?? []) {
      insertKpi.run(
        categoryId,
        kpi.slug,
        kpi.name,
        kpi.unit,
        "breakdown",
        kpi.direction,
        kpi.description,
        kpi.sort_order,
      );
    }
  }
}

/** Look up a seeded catalog row id by its slug. */
function idBySlug(table: "categories" | "kpis", slug: string): number {
  const row = getDb()
    .prepare(`SELECT id FROM ${table} WHERE slug = ?`)
    .get(slug) as { id: number } | undefined;
  if (!row) throw new Error(`Seed missing ${table} row for slug ${slug}`);
  return Number(row.id);
}

/**
 * Fresh DB seeded with the full strategic configuration and a Board
 * visibility scope narrowed to ONE priority (visitor-experience) with
 * ONE linked measure (program-attendance-vs-baseline). Returns the
 * admin/staff/board accounts to log in with.
 */
function freshScopedDb(): { admin: Account; viewer: Account; board: Account } {
  dbPath = path.join(tmpDir, `board-export-${databaseIndex++}.db`);
  (process.env as Record<string, string | undefined>).DATABASE_PATH = dbPath;
  resetDb();
  resetThrottle();
  resetSession();
  bootstrapTestInstallation();
  seedCanonicalCatalog();
  initializeStrategicPlanConfiguration(EASTERN_STATE_STRATEGIC_CONFIGURATION_FIXTURE);

  const admin = createUser({
    email: "scope-admin@example.org",
    name: "Scope Admin",
    password: "ScopeAdmin!2026",
    role: "admin",
  });
  const viewer = createUser({
    email: "scope-viewer@example.org",
    name: "Scope Viewer",
    password: "ScopeViewer!2026",
    role: "viewer",
  });
  const board = createUser({
    email: "scope-board@example.org",
    name: "Scope Board",
    password: "ScopeBoard!2026",
    role: "board",
  });

  const scope = getBoardReportingScope();
  updateBoardReportingScope(
    {
      expectedRevision: scope.revision,
      priorities: [
        {
          priorityId: idBySlug("categories", "visitor-experience"),
          displayTitle: "Priority 1: Reimagining the Visitor Experience",
          statements: [
            {
              text: "Increase attendance by 15% to match 2024 attendance.",
              kpiIds: [idBySlug("kpis", "program-attendance-vs-baseline")],
            },
          ],
        },
      ],
    },
    admin.id,
  );

  return {
    admin: { id: admin.id, email: admin.email, password: "ScopeAdmin!2026" },
    viewer: { id: viewer.id, email: viewer.email, password: "ScopeViewer!2026" },
    board: { id: board.id, email: board.email, password: "ScopeBoard!2026" },
  };
}

/** Log in as `acct` through the real login route and capture the cookie. */
async function captureLogin(acct: Account, ip: string): Promise<string> {
  resetSession();
  const res = await loginPost(
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
  expect(res.status).toBe(200);
  const cookie = jar[COOKIE_NAME];
  expect(cookie).toBeDefined();
  resetSession();
  return cookie;
}

/** Call the real export handler with `cookie` installed in the jar. */
async function exportWithCookie(cookie: string, query: string): Promise<Response> {
  resetSession();
  jar[COOKIE_NAME] = cookie;
  const res = await exportGet(
    new NextRequest(`http://localhost/api/strategy/export?${query}`),
  );
  resetSession();
  return res;
}

describe("GET /api/strategy/export Board-scope absence (S103-C1)", () => {
  let accounts: { admin: Account; viewer: Account; board: Account };
  let boardCookie = "";
  let viewerCookie = "";

  beforeEach(async () => {
    accounts = freshScopedDb();
    boardCookie = await captureLogin(accounts.board, "10.4.0.1");
    viewerCookie = await captureLogin(accounts.viewer, "10.4.0.2");
  });

  it("excludes every out-of-scope priority and KPI from the Board JSON export", async () => {
    const res = await exportWithCookie(boardCookie, "year=2029&format=json");
    expect(res.status).toBe(200);
    const text = JSON.stringify(await res.json());

    // Presence: the single scoped measure IS exported.
    expect(text).toContain(IN_SCOPE_KPI_NAME);

    // Absence: an unlinked measure of the SAME priority, a measure of
    // an unscoped priority, and the unscoped priority's names (both the
    // staff catalog name and any Board display title) must not leak.
    expect(text).not.toContain(OUT_OF_SCOPE_SAME_PRIORITY_KPI);
    expect(text).not.toContain(OUT_OF_SCOPE_OTHER_PRIORITY_KPI);
    expect(text).not.toContain(OUT_OF_SCOPE_PRIORITY_NAME);
    expect(text).not.toContain(OUT_OF_SCOPE_BOARD_TITLE);
  });

  it("excludes out-of-scope content from the Board CSV export as well", async () => {
    const res = await exportWithCookie(boardCookie, "year=2029&format=csv");
    expect(res.status).toBe(200);
    const text = await res.text();

    expect(text).toContain(IN_SCOPE_KPI_NAME);
    expect(text).not.toContain(OUT_OF_SCOPE_SAME_PRIORITY_KPI);
    expect(text).not.toContain(OUT_OF_SCOPE_OTHER_PRIORITY_KPI);
    expect(text).not.toContain(OUT_OF_SCOPE_PRIORITY_NAME);
    expect(text).not.toContain(OUT_OF_SCOPE_BOARD_TITLE);
  });

  it("keeps the full plan visible in the staff export of the same database (control)", async () => {
    const res = await exportWithCookie(viewerCookie, "year=2029&format=json");
    expect(res.status).toBe(200);
    const text = JSON.stringify(await res.json());

    // The same out-of-scope names MUST appear for staff — otherwise the
    // absence assertions above prove nothing (the content could simply
    // be missing from the report model altogether).
    expect(text).toContain(IN_SCOPE_KPI_NAME);
    expect(text).toContain(OUT_OF_SCOPE_SAME_PRIORITY_KPI);
    expect(text).toContain(OUT_OF_SCOPE_OTHER_PRIORITY_KPI);
    expect(text).toContain(OUT_OF_SCOPE_PRIORITY_NAME);
  });
});
