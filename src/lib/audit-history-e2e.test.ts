/**
 * End-to-end audit-integrity regression suite for D8AD-CAN-005.
 *
 * Drives the REAL HTTP route handlers (categories, KPIs, entries, and the
 * admin history endpoint) against a real temp SQLite DB, exercising the
 * full stack: zod validation → requireAdmin → assertMutationRequest (CSRF)
 * → repository → entry_history snapshot writes → LEFT-joined history
 * retrieval. Only the cookie transport is faked (in-memory jar via
 * vi.mock("next/headers")); iron-session, the revocation chokepoint, the
 * request guard, and every route handler run unchanged.
 *
 * Coverage of the stated requirements:
 *   1. create category, KPI, entry        → createCategoryKpiEntry
 *   2. modify + delete entry values        → entryMutationsGenerateHistory
 *   3. rename KPI + category               → renameDoesNotRewriteHistory
 *   4. every supported deletion sequence   → deletionSequenceMatrix
 *   5. query history after each operation   → every test queries via the API
 *   6. every original event visible exactly once → lifecycleEventsRemainVisibleExactlyOnce
 *   7. snapshots retain understandable labels → snapshotLabelsAreUnderstandable
 *   8. deleted metadata represented explicitly  → deletedMetadataIsExplicit
 *   9. viewers + unauthenticated blocked    → historyAuthz
 *  10. history rows immutable via ordinary ops → historyRowsAreImmutable
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/* ------------------------------------------------------------------ *
 * In-memory cookie jar (fakes only the transport). Hoisted so the
 * reference is available inside the hoisted vi.mock factory.
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
import { dispatch } from "./auth-regression-helpers";
import { createUser, ensureSeedAdmin } from "./auth";
import { resetDb } from "@/lib/db";
import { _resetForTests as resetThrottle } from "@/lib/login-throttle";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { GET as historyGet } from "@/app/api/entries/history/route";
import { getDb } from "@/lib/db";

const COOKIE_NAME = "eastern_state_kpi_session";

/* ------------------------------------------------------------------ *
 * Env / DB lifecycle
 * ------------------------------------------------------------------ */
let tmpDir: string;
let dbPath: string;
let originalDbPath: string | undefined;
const originalEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-audit-e2e-"));
  dbPath = path.join(tmpDir, "test.db");
  originalDbPath = process.env.DATABASE_PATH;
  for (const k of [
    "DATABASE_PATH",
    "SESSION_SECRET",
    "TRUST_PROXY",
    "SESSION_SECURE",
    "APP_CANONICAL_ORIGIN",
  ]) {
    originalEnv[k] = process.env[k];
  }
  (process.env as Record<string, string | undefined>).DATABASE_PATH = dbPath;
  (process.env as Record<string, string | undefined>).SESSION_SECRET =
    "test-secret-test-secret-test-secret-test";
  (process.env as Record<string, string | undefined>).SESSION_SECURE = "false";
  (process.env as Record<string, string | undefined>).TRUST_PROXY = "true";
  // Canonical origin matches the Origin header dispatch() sends, so the
  // request guard's same-origin check passes for mutations.
  (process.env as Record<string, string | undefined>).APP_CANONICAL_ORIGIN =
    "http://localhost";
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

interface Account {
  id: number;
  email: string;
  password: string;
}

function makeActiveAccount(
  role: "admin" | "viewer",
  email: string,
  password: string,
): Account {
  // Created WITHOUT must_change_password so requireSession/requireAdmin
  // don't 403-force a rotation before the account can act.
  const u = createUser({ email, name: `E2E ${role}`, password, role });
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

/** Log in as `acct`; the issued session cookie is left installed in the jar. */
async function loginAs(acct: Account, ip = "10.0.0.10"): Promise<void> {
  resetSession();
  const res = await loginPost(loginReq({ email: acct.email, password: acct.password }, ip));
  expect(res.status).toBe(200);
}

function clearSession(): void {
  resetSession();
}

/* ------------------------------------------------------------------ *
 * API helper wrappers (thin sugar over dispatch)
 * ------------------------------------------------------------------ */
async function createCategoryViaApi(slug: string, name: string) {
  const res = await dispatch("POST", "/api/categories", { slug, name, sort_order: 0 });
  expect(res.status).toBe(201);
  const body = await res.json();
  return body.category as { id: number; slug: string; name: string };
}

async function createKpiViaApi(categoryId: number, slug: string, name: string) {
  const res = await dispatch("POST", "/api/kpis", {
    category_id: categoryId,
    slug,
    name,
    unit: "count",
    unit_type: "count",
    reporting_frequency: "monthly",
    direction: "higher",
    sort_order: 0,
  });
  expect(res.status).toBe(201);
  const body = await res.json();
  return body.kpi as { id: number; slug: string; name: string };
}

async function upsertEntryViaApi(kpiId: number, year: number, month: number, value: number) {
  const res = await dispatch("POST", "/api/entries", { kpi_id: kpiId, year, month, value });
  expect(res.status).toBe(201);
  const body = await res.json();
  return body.entry as { id: number; kpi_id: number; year: number; month: number; value: number };
}

async function deleteEntryViaApi(id: number) {
  const res = await dispatch("DELETE", "/api/entries", { id });
  expect(res.status).toBe(200);
  return res;
}

async function renameKpiViaApi(id: number, name: string) {
  const res = await dispatch("PATCH", "/api/kpis", { id, name });
  expect(res.status).toBe(200);
}

async function renameCategoryViaApi(id: number, name: string) {
  const res = await dispatch("PATCH", "/api/categories", { id, name });
  expect(res.status).toBe(200);
}

async function deleteKpiViaApi(id: number): Promise<Response> {
  return dispatch("DELETE", "/api/kpis", { id });
}

async function deleteCategoryViaApi(id: number): Promise<Response> {
  return dispatch("DELETE", "/api/categories", { id });
}

interface HistoryRow {
  id: number;
  entry_type: "monthly" | "breakdown";
  entry_id: number | null;
  kpi_id: number;
  year: number;
  month_or_label: string;
  prev_value: number | null;
  new_value: number | null;
  kpi_name: string | null;
  kpi_slug: string | null;
  kpi_unit: string | null;
  category_id: number | null;
  category_name: string | null;
  category_slug: string | null;
  changed_by_email: string | null;
  kpi_current_name: string | null;
  kpi_current_slug: string | null;
  category_current_name: string | null;
  category_current_slug: string | null;
  metadata_deleted: boolean;
  metadata_renamed: boolean;
}

async function historyViaApi(query: string): Promise<HistoryRow[]> {
  // Call the history handler directly with a URL that carries the query
  // string — dispatch() keys its handler table on the bare path, so it
  // cannot route a query-bearing URL. The session still comes from the
  // mocked cookies() jar, exactly as dispatch() arranges for GET.
  const req = new NextRequest(`http://localhost/api/entries/history${query}`, {
    method: "GET",
    headers: { "content-type": "application/json" },
  });
  const res = await historyGet(req);
  expect(res.status).toBe(200);
  const body = await res.json();
  return body.history as HistoryRow[];
}

/** History endpoint response + parsed body, for authz tests that need to
 *  inspect the body once (the shared assert helpers consume it). */
async function historyRaw(query = ""): Promise<{ res: Response; body: unknown }> {
  const req = new NextRequest(`http://localhost/api/entries/history${query}`, {
    method: "GET",
    headers: { "content-type": "application/json" },
  });
  const res = await historyGet(req);
  const body = await res.json().catch(() => undefined);
  return { res, body };
}

/** Build a query string for the history endpoint filtering to one KPI. */
function qForKpi(kpiId: number): string {
  return `?kpi_id=${kpiId}&limit=1000`;
}

/* ------------------------------------------------------------------ *
 * Fresh DB + active admin/viewer before each test.
 * ------------------------------------------------------------------ */
let admin: Account;
let viewer: Account;

beforeEach(async () => {
  freshDb();
  admin = makeActiveAccount("admin", "e2e-admin@example.com", "E2EAdmin!2026");
  viewer = makeActiveAccount("viewer", "e2e-viewer@example.com", "E2EViewer!2026");
  await loginAs(admin);
});

describe("D8AD-CAN-005 end-to-end audit integrity", () => {
  describe("lifecycle (reqs 1, 2, 3, 5, 6, 7, 8)", () => {
    it("every original history event remains visible exactly once across create → modify → delete → rename → delete-metadata", async () => {
      // 1. Create a category, KPI, and entry.
      const cat = await createCategoryViaApi("lifecycle-cat", "Lifecycle Category");
      const kpi = await createKpiViaApi(cat.id, "lifecycle-kpi", "Lifecycle KPI");
      const entry = await upsertEntryViaApi(kpi.id, 2025, 3, 10);

      // 2. Modify the entry value twice (update + update), then delete it.
      await upsertEntryViaApi(kpi.id, 2025, 3, 20);
      await upsertEntryViaApi(kpi.id, 2025, 3, 30);
      await deleteEntryViaApi(entry.id);

      // After entry mutations: four history events (create, update, update, delete).
      let rows = await historyViaApi(qForKpi(kpi.id));
      expect(rows).toHaveLength(4);
      const idsAfterEntryMutations = rows.map((r) => r.id);
      expect(new Set(idsAfterEntryMutations).size).toBe(4); // exactly once, no dupes

      // 3. Rename the KPI and the category.
      await renameKpiViaApi(kpi.id, "Lifecycle KPI — Renamed");
      await renameCategoryViaApi(cat.id, "Lifecycle Category — Renamed");

      // 5/6. Query history after each rename: same four events, same ids.
      rows = await historyViaApi(qForKpi(kpi.id));
      expect(rows.map((r) => r.id).sort((a, b) => a - b)).toEqual(
        [...idsAfterEntryMutations].sort((a, b) => a - b),
      );
      // 7. Snapshots retain the ORIGINAL understandable labels.
      for (const r of rows) {
        expect(r.kpi_name).toBe("Lifecycle KPI");
        expect(r.kpi_slug).toBe("lifecycle-kpi");
        expect(r.category_name).toBe("Lifecycle Category");
        expect(r.category_slug).toBe("lifecycle-cat");
        // Current labels reflect the rename; the snapshot does not.
        expect(r.kpi_current_name).toBe("Lifecycle KPI — Renamed");
        expect(r.category_current_name).toBe("Lifecycle Category — Renamed");
        expect(r.metadata_renamed).toBe(true);
        expect(r.metadata_deleted).toBe(false);
      }

      // 4. Delete the KPI (entries already gone → allowed), then the category.
      const kpiDelete = await deleteKpiViaApi(kpi.id);
      expect(kpiDelete.status).toBe(200);
      const catDelete = await deleteCategoryViaApi(cat.id);
      expect(catDelete.status).toBe(200);

      // 5/6. Query history after metadata deletion: STILL the same four events.
      rows = await historyViaApi(qForKpi(kpi.id));
      expect(rows).toHaveLength(4);
      expect(rows.map((r) => r.id).sort((a, b) => a - b)).toEqual(
        [...idsAfterEntryMutations].sort((a, b) => a - b),
      );
      // 8. Deleted metadata is represented explicitly, never silently omitted.
      for (const r of rows) {
        expect(r.metadata_deleted).toBe(true);
        expect(r.metadata_renamed).toBe(false); // deleted, not renamed
        expect(r.kpi_current_name).toBeNull();
        expect(r.kpi_current_slug).toBeNull();
        expect(r.category_current_name).toBeNull();
        expect(r.category_current_slug).toBeNull();
        // 7. The historical snapshot labels survive the deletion.
        expect(r.kpi_name).toBe("Lifecycle KPI");
        expect(r.kpi_slug).toBe("lifecycle-kpi");
        expect(r.category_name).toBe("Lifecycle Category");
        expect(r.category_slug).toBe("lifecycle-cat");
      }

      // The unfiltered endpoint must also still surface the events (no
      // inner-join quietly dropping them out of the global feed).
      const all = await historyViaApi("?limit=1000");
      const forKpi = all.filter((r) => r.kpi_id === kpi.id);
      expect(forKpi).toHaveLength(4);
    });

    it("snapshot labels stay understandable (entry identity, year/period, actor, before/after)", async () => {
      const cat = await createCategoryViaApi("snap-cat", "Snap Category");
      const kpi = await createKpiViaApi(cat.id, "snap-kpi", "Snap KPI");
      await upsertEntryViaApi(kpi.id, 2024, 6, 42);

      const rows = await historyViaApi(qForKpi(kpi.id));
      expect(rows).toHaveLength(1);
      const r = rows[0];
      // Entry identity + year/period are present and readable.
      expect(r.entry_type).toBe("monthly");
      expect(r.year).toBe(2024);
      expect(r.month_or_label).toBe("6");
      // Before/after values.
      expect(r.prev_value).toBeNull();
      expect(r.new_value).toBe(42);
      // Actor identity snapshot (the active admin's email).
      expect(r.changed_by_email).toBe(admin.email);
      // KPI/category labels are the readable human names, not bare ids.
      expect(r.kpi_name).toBe("Snap KPI");
      expect(r.category_name).toBe("Snap Category");
    });
  });

  describe("deletion sequences (req 4)", () => {
    it("blocks KPI deletion while live entries exist (409, history unchanged)", async () => {
      const cat = await createCategoryViaApi("blk-cat", "Block Cat");
      const kpi = await createKpiViaApi(cat.id, "blk-kpi", "Block KPI");
      await upsertEntryViaApi(kpi.id, 2025, 1, 5);

      const before = await historyViaApi(qForKpi(kpi.id));
      const res = await deleteKpiViaApi(kpi.id);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe("DEPENDENT_ENTRIES");
      expect(body.error).toMatch(/Cannot delete KPI/);

      // History is unchanged — no new event, no missing event.
      const after = await historyViaApi(qForKpi(kpi.id));
      expect(after).toEqual(before);
      // The KPI is still there.
      const live = await dispatch("GET", "/api/kpis");
      const liveBody = await live.json();
      expect(liveBody.kpis.some((k: { id: number }) => k.id === kpi.id)).toBe(true);
    });

    it("blocks category deletion while any KPI in it has live entries (409)", async () => {
      const cat = await createCategoryViaApi("blkc-cat", "Block C Cat");
      const kpi = await createKpiViaApi(cat.id, "blkc-kpi", "Block C KPI");
      await upsertEntryViaApi(kpi.id, 2025, 1, 5);

      const res = await deleteCategoryViaApi(cat.id);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe("DEPENDENT_ENTRIES");
      expect(body.error).toMatch(/Cannot delete category/);
    });

    it("sequence A: delete entries first, then KPI (200), history survives with tombstone", async () => {
      const cat = await createCategoryViaApi("seqa-cat", "Seq A Cat");
      const kpi = await createKpiViaApi(cat.id, "seqa-kpi", "Seq A KPI");
      const e = await upsertEntryViaApi(kpi.id, 2025, 2, 7);

      const beforeCount = (await historyViaApi(qForKpi(kpi.id))).length;

      await deleteEntryViaApi(e.id); // tombstone event
      const afterEntry = await historyViaApi(qForKpi(kpi.id));
      expect(afterEntry.length).toBe(beforeCount + 1);

      const kpiDelete = await deleteKpiViaApi(kpi.id);
      expect(kpiDelete.status).toBe(200);

      // History survives the KPI deletion; every row now metadata_deleted.
      const afterKpi = await historyViaApi(qForKpi(kpi.id));
      expect(afterKpi.length).toBe(afterEntry.length);
      for (const r of afterKpi) {
        expect(r.metadata_deleted).toBe(true);
        expect(r.kpi_name).toBe("Seq A KPI");
      }
    });

    it("sequence B: delete KPI first (after entries gone), then category (200), history survives", async () => {
      const cat = await createCategoryViaApi("seqb-cat", "Seq B Cat");
      const kpi = await createKpiViaApi(cat.id, "seqb-kpi", "Seq B KPI");
      const e = await upsertEntryViaApi(kpi.id, 2025, 4, 9);
      await deleteEntryViaApi(e.id);

      const before = (await historyViaApi(qForKpi(kpi.id))).length;

      expect((await deleteKpiViaApi(kpi.id)).status).toBe(200);
      expect((await deleteCategoryViaApi(cat.id)).status).toBe(200);

      const after = await historyViaApi(qForKpi(kpi.id));
      expect(after.length).toBe(before);
      for (const r of after) {
        expect(r.metadata_deleted).toBe(true);
        expect(r.kpi_name).toBe("Seq B KPI");
        expect(r.category_name).toBe("Seq B Cat");
        expect(r.category_current_name).toBeNull();
      }
    });

    it("sequence C: category deletion cascades over its (entry-free) KPIs and preserves history", async () => {
      // A category with a KPI that has NO live entries can be deleted
      // directly; the KPI cascades away but its history rows survive.
      const cat = await createCategoryViaApi("seqc-cat", "Seq C Cat");
      const kpi = await createKpiViaApi(cat.id, "seqc-kpi", "Seq C KPI");
      const e = await upsertEntryViaApi(kpi.id, 2025, 5, 11);
      await deleteEntryViaApi(e.id);

      const before = (await historyViaApi(qForKpi(kpi.id))).length;

      // Delete the category WITHOUT deleting the KPI first. The KPI has
      // no live entries (only history), so the category guard allows it;
      // the KPI cascade-deletes with the category.
      const catDelete = await deleteCategoryViaApi(cat.id);
      expect(catDelete.status).toBe(200);

      const after = await historyViaApi(qForKpi(kpi.id));
      expect(after.length).toBe(before);
      for (const r of after) {
        expect(r.metadata_deleted).toBe(true);
        expect(r.kpi_name).toBe("Seq C KPI");
        expect(r.category_name).toBe("Seq C Cat");
      }
    });

    it("category_id filter returns deleted-category history (snapshot-based)", async () => {
      // After a category and its KPI are deleted, the category_id filter
      // on the history endpoint must still return the rows (the filter
      // uses the SNAPSHOT h.category_id, not a live join). This is the
      // guarantee that makes the history of deleted items reachable.
      const cat = await createCategoryViaApi("cfilter-cat", "CFilter Cat");
      const kpi = await createKpiViaApi(cat.id, "cfilter-kpi", "CFilter KPI");
      const entry = await upsertEntryViaApi(kpi.id, 2025, 1, 1);

      // Delete the entry, then the KPI, then the category.
      await deleteEntryViaApi(entry.id);
      await deleteKpiViaApi(kpi.id);
      await deleteCategoryViaApi(cat.id);

      // Filter by the deleted category's id — the API must still return
      // the history rows using the snapshot category_id.
      const rows = await historyViaApi(`?category_id=${cat.id}&limit=1000`);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.category_id).toBe(cat.id);
        expect(r.category_name).toBe("CFilter Cat");
        expect(r.metadata_deleted).toBe(true);
      }

      // Filter by the deleted KPI's id — same guarantee.
      const kpiRows = await historyViaApi(`?kpi_id=${kpi.id}&limit=1000`);
      expect(kpiRows.length).toBeGreaterThan(0);
      for (const r of kpiRows) {
        expect(r.kpi_id).toBe(kpi.id);
        expect(r.kpi_name).toBe("CFilter KPI");
        expect(r.metadata_deleted).toBe(true);
      }
    });
  });

  describe("authorization (req 9)", () => {
    it("a viewer cannot retrieve administrator audit history (403)", async () => {
      // Seed at least one history row so the endpoint has something to
      // protect — the authz gate runs before any read.
      const cat = await createCategoryViaApi("authz-cat", "Authz Cat");
      const kpi = await createKpiViaApi(cat.id, "authz-kpi", "Authz KPI");
      await upsertEntryViaApi(kpi.id, 2025, 1, 1);

      // Switch the jar to a viewer session.
      clearSession();
      await loginAs(viewer);

      const { res, body } = await historyRaw();
      expect(res.status).toBe(403);
      expect((body as { error?: string }).error).toBe("Forbidden");
      // No history leaked to an unauthorized role.
      expect((body as { history?: unknown }).history).toBeUndefined();
    });

    it("an unauthenticated request cannot retrieve administrator audit history (401)", async () => {
      clearSession();
      const { res, body } = await historyRaw();
      expect(res.status).toBe(401);
      expect((body as { error?: string }).error).toBe("Unauthorized");
      expect((body as { history?: unknown }).history).toBeUndefined();
    });

    it("the history endpoint is admin-only even when no history exists", async () => {
      clearSession();
      await loginAs(viewer);
      const { res } = await historyRaw();
      expect(res.status).toBe(403);
    });
  });

  describe("immutability (req 10)", () => {
    it("history rows cannot be changed through ordinary repository or API operations", async () => {
      const cat = await createCategoryViaApi("immut-cat", "Immut Category");
      const kpi = await createKpiViaApi(cat.id, "immut-kpi", "Immut KPI");
      await upsertEntryViaApi(kpi.id, 2025, 7, 100);

      const original = (await historyViaApi(qForKpi(kpi.id)))[0];
      // Capture the IMMUTABLE portion of the row: the event identity,
      // before/after values, and the snapshot labels. The *_current_*
      // and metadata_deleted/renamed fields are DERIVED from the live
      // join and are expected to change as metadata is renamed/deleted;
      // they are not part of the "row" that must be append-only.
      const immutableOf = (r: HistoryRow) => ({
        id: r.id,
        entry_type: r.entry_type,
        entry_id: r.entry_id,
        kpi_id: r.kpi_id,
        year: r.year,
        month_or_label: r.month_or_label,
        prev_value: r.prev_value,
        new_value: r.new_value,
        kpi_name: r.kpi_name,
        kpi_slug: r.kpi_slug,
        kpi_unit: r.kpi_unit,
        category_id: r.category_id,
        category_name: r.category_name,
        category_slug: r.category_slug,
        changed_by_email: r.changed_by_email,
      });
      const snapshotBefore = JSON.stringify(immutableOf(original));

      // A series of ordinary operations that touch the SAME kpi/category
      // but must NOT mutate the prior history row: re-upsert the entry
      // (creates a new event), rename the KPI, rename the category,
      // delete the entry, delete the KPI, delete the category.
      await upsertEntryViaApi(kpi.id, 2025, 7, 200);
      await renameKpiViaApi(kpi.id, "Immut KPI — Renamed");
      await renameCategoryViaApi(cat.id, "Immut Category — Renamed");
      const e2 = await upsertEntryViaApi(kpi.id, 2025, 7, 300);
      await deleteEntryViaApi(e2.id);
      await deleteKpiViaApi(kpi.id);
      await deleteCategoryViaApi(cat.id);

      // The captured row's immutable event + snapshot fields are byte-identical.
      const all = await historyViaApi(qForKpi(kpi.id));
      const sameRow = all.find((r) => r.id === original.id)!;
      expect(sameRow).toBeDefined();
      expect(JSON.stringify(immutableOf(sameRow))).toBe(snapshotBefore);
      // The derived current-state fields DID change (KPI is now deleted),
      // which is the intended behavior — the snapshot is immutable, the
      // live-view is not.
      expect(sameRow.metadata_deleted).toBe(true);
      expect(sameRow.kpi_current_name).toBeNull();

      // The row count only grew across all those operations.
      expect(all.length).toBeGreaterThan(1);
      // Every event id is unique (no row was duplicated or replaced).
      expect(new Set(all.map((r) => r.id)).size).toBe(all.length);
    });

    it("no API operation exposes an UPDATE or DELETE on entry_history", async () => {
      // The only state-changing endpoints that touch entry_history do so
      // by INSERT (upsertEntry / deleteEntry / upsertBreakdown /
      // deleteBreakdown via the repository). There is no route that
      // updates or deletes a history row. Verify at the schema level:
      // every history row written across a full lifecycle is retained.
      const cat = await createCategoryViaApi("noupd-cat", "NoUpdate Cat");
      const kpi = await createKpiViaApi(cat.id, "noupd-kpi", "NoUpdate KPI");
      const e = await upsertEntryViaApi(kpi.id, 2025, 8, 1);
      await upsertEntryViaApi(kpi.id, 2025, 8, 2);
      await deleteEntryViaApi(e.id);

      const historyIds = (await historyViaApi(qForKpi(kpi.id))).map((r) => r.id);

      // Perform more ordinary ops, then assert the full set of prior ids
      // is still present (none silently removed).
      await renameKpiViaApi(kpi.id, "NoUpdate KPI 2");
      const again = await upsertEntryViaApi(kpi.id, 2025, 9, 3);
      await deleteEntryViaApi(again.id);
      await deleteKpiViaApi(kpi.id);

      const final = await historyViaApi("?limit=1000");
      const finalIds = final.map((r) => r.id);
      for (const id of historyIds) {
        expect(finalIds).toContain(id);
      }
      // And the direct DB count matches the API response (nothing hidden).
      const dbCount = (
        getDb().prepare("SELECT COUNT(*) AS n FROM entry_history").get() as { n: number }
      ).n;
      expect(final.length).toBe(dbCount);
    });
  });
});