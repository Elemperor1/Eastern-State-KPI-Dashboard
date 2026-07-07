import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensureSeedAdmin } from "./auth";
import { getDb, resetDb } from "./db";
import {
  createCategory,
  createKPI,
  deleteBreakdown,
  deleteCategory,
  deleteEntry,
  deleteKPI,
  DependentEntriesError,
  listDeletedHistoryCategories,
  listDeletedHistoryKpis,
  listEntryHistory,
  upsertBreakdown,
  upsertEntry,
  updateCategory,
  updateKPI,
} from "./repository";

/**
 * D8AD-CAN-005 regression suite.
 *
 * The audit trail (`entry_history`) must survive deletion or renaming of
 * the KPI and category metadata it references, and the historical label
 * shown must be the immutable snapshot taken at change time — never the
 * current (possibly renamed) label, and never silently dropped when the
 * metadata has been deleted.
 *
 * Each test uses a fresh temp SQLite file with a hand-built minimal
 * category + KPI fixture so the FK constraints are satisfied without the
 * full seed.
 */
describe("D8AD-CAN-005 audit-history integrity", () => {
  let tmpDir: string;
  let dbPath: string;
  let originalDbPath: string | undefined;
  let categoryId: number;
  let otherCategoryId: number;
  let kpiA: number;
  let kpiB: number;
  let adminId: number;

  function rebuildFixture() {
    const db = getDb();
    db.exec("DELETE FROM entry_history;");
    db.exec("DELETE FROM breakdown_entries;");
    db.exec("DELETE FROM monthly_entries;");
    db.exec("DELETE FROM kpis;");
    db.exec("DELETE FROM categories;");
    db.prepare(
      "INSERT INTO categories (slug, name, sort_order) VALUES (?, ?, ?)",
    ).run("cat-a", "Category A", 0);
    db.prepare(
      "INSERT INTO categories (slug, name, sort_order) VALUES (?, ?, ?)",
    ).run("cat-b", "Category B", 1);
    categoryId = Number(
      (db.prepare("SELECT id FROM categories WHERE slug = 'cat-a'").get() as { id: number }).id,
    );
    otherCategoryId = Number(
      (db.prepare("SELECT id FROM categories WHERE slug = 'cat-b'").get() as { id: number }).id,
    );
    const mk = (slug: string, name: string, catId: number, order: number) => {
      db.prepare(
        `INSERT INTO kpis (category_id, slug, name, unit, unit_type, reporting_frequency, direction, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(catId, slug, name, "count", "count", "monthly", "higher", order);
      return Number(
        (db.prepare("SELECT id FROM kpis WHERE slug = ?").get(slug) as { id: number }).id,
      );
    };
    kpiA = mk("kpi-a", "KPI A", categoryId, 0);
    kpiB = mk("kpi-b", "KPI B", otherCategoryId, 1);
    adminId = Number(
      (db.prepare("SELECT id FROM users LIMIT 1").get() as { id: number }).id,
    );
  }

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-audit-test-"));
    dbPath = path.join(tmpDir, "test.db");
    originalDbPath = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = dbPath;
    resetDb();
    ensureSeedAdmin();
    rebuildFixture();
  });

  beforeEach(() => {
    // Each test starts from a clean fixture so destructive tests (which
    // delete KPIs/categories) cannot break later ones via shared state.
    rebuildFixture();
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

  function historyForKpi(kpiId: number) {
    return listEntryHistory({ kpi_id: kpiId });
  }

  it("records the KPI/category snapshot at change time", () => {
    upsertEntry({ kpi_id: kpiA, year: 2025, month: 3, value: 10, updated_by: adminId });
    const rows = historyForKpi(kpiA);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.kpi_name).toBe("KPI A");
    expect(r.kpi_slug).toBe("kpi-a");
    expect(r.kpi_unit).toBe("count");
    expect(r.category_name).toBe("Category A");
    expect(r.category_slug).toBe("cat-a");
    expect(r.category_id).toBe(categoryId);
    expect(r.changed_by_email).toBe(String(r.changed_by_email)); // admin email captured
    expect(r.metadata_deleted).toBe(false);
    expect(r.metadata_renamed).toBe(false);
    expect(r.kpi_current_name).toBe("KPI A");
  });

  it("KPI rename does not retroactively rewrite the historical label", () => {
    upsertEntry({ kpi_id: kpiA, year: 2025, month: 3, value: 10, updated_by: adminId });
    // Rename the KPI after the change was recorded.
    updateKPI(kpiA, { name: "KPI A — Renamed" });
    const rows = historyForKpi(kpiA);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    // Snapshot label is the historical one.
    expect(r.kpi_name).toBe("KPI A");
    expect(r.kpi_slug).toBe("kpi-a");
    // Current label reflects the rename.
    expect(r.kpi_current_name).toBe("KPI A — Renamed");
    expect(r.metadata_renamed).toBe(true);
    expect(r.metadata_deleted).toBe(false);
  });

  it("category rename does not retroactively rewrite the historical label", () => {
    upsertEntry({ kpi_id: kpiA, year: 2025, month: 3, value: 10, updated_by: adminId });
    updateCategory(categoryId, { name: "Category A — Renamed" });
    const r = historyForKpi(kpiA)[0];
    expect(r.category_name).toBe("Category A");
    expect(r.category_slug).toBe("cat-a");
    expect(r.category_current_name).toBe("Category A — Renamed");
    expect(r.metadata_renamed).toBe(true);
    expect(r.metadata_deleted).toBe(false);
  });

  it("blocks KPI deletion while live entries exist", () => {
    upsertEntry({ kpi_id: kpiA, year: 2025, month: 3, value: 10, updated_by: adminId });
    expect(() => deleteKPI(kpiA)).toThrow(DependentEntriesError);
    expect(() => deleteKPI(kpiA)).toThrow(/Cannot delete KPI/);
    // KPI still exists; the entry is still there.
    const db = getDb();
    expect(
      (db.prepare("SELECT COUNT(*) AS n FROM kpis WHERE id = ?").get(kpiA) as { n: number }).n,
    ).toBe(1);
    expect(
      (db.prepare("SELECT COUNT(*) AS n FROM monthly_entries WHERE kpi_id = ?").get(kpiA) as { n: number }).n,
    ).toBe(1);
  });

  it("blocks category deletion while any KPI in it has live entries", () => {
    upsertEntry({ kpi_id: kpiA, year: 2025, month: 3, value: 10, updated_by: adminId });
    expect(() => deleteCategory(categoryId)).toThrow(DependentEntriesError);
    expect(() => deleteCategory(categoryId)).toThrow(/Cannot delete category/);
  });

  it("KPI deletion after entry deletion preserves every history row with a tombstone", () => {
    const e = upsertEntry({ kpi_id: kpiA, year: 2025, month: 3, value: 50, updated_by: adminId });
    deleteEntry(e.id, adminId);
    // No live entries remain → KPI deletion is allowed.
    deleteKPI(kpiA);

    const rows = listEntryHistory({ kpi_id: kpiA });
    // Two rows: the original upsert + the entry-delete tombstone. Both
    // survive the KPI deletion and are still returned (LEFT JOIN, not
    // inner JOIN).
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.metadata_deleted).toBe(true);
      expect(r.kpi_current_name).toBeNull();
      expect(r.kpi_current_slug).toBeNull();
      // Snapshot label is preserved even though the live KPI is gone.
      expect(r.kpi_name).toBe("KPI A");
      expect(r.kpi_slug).toBe("kpi-a");
      expect(r.category_name).toBe("Category A");
    }
    // The delete tombstone is the most recent row (id DESC).
    expect(rows[0].new_value).toBeNull();
    expect(rows[0].prev_value).toBe(50);
  });

  it("chained deletions (entry → KPI → category) leave the full audit trail intact", () => {
    const e = upsertEntry({ kpi_id: kpiB, year: 2024, month: 1, value: 7, updated_by: adminId });
    deleteEntry(e.id, adminId);
    deleteKPI(kpiB);
    // Category B has no KPIs with entries now → deletable.
    deleteCategory(otherCategoryId);

    // All history rows for kpiB survive even though the KPI AND its
    // category are gone.
    const rows = listEntryHistory({ kpi_id: kpiB });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const r of rows) {
      expect(r.metadata_deleted).toBe(true);
      expect(r.kpi_name).toBe("KPI B");
      expect(r.category_name).toBe("Category B");
      expect(r.category_slug).toBe("cat-b");
      expect(r.kpi_current_name).toBeNull();
      expect(r.category_current_name).toBeNull();
    }
  });

  it("history is append-only: existing rows' snapshots never change across later mutations", () => {
    upsertEntry({ kpi_id: kpiA, year: 2025, month: 1, value: 1, updated_by: adminId });
    const before = historyForKpi(kpiA)[0];

    // A subsequent update, a rename, and a delete of the entry must not
    // mutate the snapshot of the first history row.
    upsertEntry({ kpi_id: kpiA, year: 2025, month: 1, value: 2, updated_by: adminId });
    updateKPI(kpiA, { name: "Totally Different Name" });
    deleteEntry(
      Number(
        (getDb().prepare("SELECT id FROM monthly_entries WHERE kpi_id = ? AND year = ? AND month = ?").get(kpiA, 2025, 1) as { id: number }).id,
      ),
      adminId,
    );

    const all = historyForKpi(kpiA);
    // The first row is untouched.
    const sameFirst = all.find((r) => r.id === before.id)!;
    expect(sameFirst.kpi_name).toBe(before.kpi_name);
    expect(sameFirst.kpi_slug).toBe(before.kpi_slug);
    expect(sameFirst.category_name).toBe(before.category_name);
    expect(sameFirst.new_value).toBe(before.new_value);
    expect(sameFirst.changed_by_email).toBe(before.changed_by_email);
    // The row count only grew.
    expect(all.length).toBeGreaterThan(1);
  });

  it("pagination and ordering remain stable (changed_at DESC, id DESC)", () => {
    // Insert 12 distinct monthly rows for kpiA. They share the same
    // datetime('now') second, so ordering falls back to id DESC.
    for (let m = 1; m <= 12; m++) {
      upsertEntry({ kpi_id: kpiA, year: 2025, month: m, value: m, updated_by: adminId });
    }
    const all = historyForKpi(kpiA);
    expect(all).toHaveLength(12);
    // Verify id DESC ordering.
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1].id).toBeGreaterThan(all[i].id);
    }
    // limit returns the highest-id slice.
    const page = listEntryHistory({ kpi_id: kpiA, limit: 5 });
    expect(page).toHaveLength(5);
    expect(page[0].id).toBe(all[0].id);
    expect(page[4].id).toBe(all[4].id);
    // Filter by year still composes with the snapshot-based kpi_id filter.
    const yearFiltered = listEntryHistory({ kpi_id: kpiA, year: 2025 });
    expect(yearFiltered).toHaveLength(12);
  });

  it("breakdown history survives KPI deletion with snapshot intact", () => {
    const b = upsertBreakdown({ kpi_id: kpiA, year: 2025, label: "Group A", value: 10, updated_by: adminId });
    deleteBreakdown(b.id, adminId);
    deleteKPI(kpiA);
    const rows = listEntryHistory({ kpi_id: kpiA });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0].entry_type).toBe("breakdown");
    expect(rows[0].new_value).toBeNull();
    expect(rows[0].prev_value).toBe(10);
    expect(rows[0].month_or_label).toBe("0|Group A");
    expect(rows[0].metadata_deleted).toBe(true);
  });

  it("category_id filter uses the snapshot category, not the live join", () => {
    upsertEntry({ kpi_id: kpiA, year: 2025, month: 3, value: 10, updated_by: adminId });
    // Filter by the snapshot category id — must return the row even
    // though this test never deleted the category. The point is the
    // filter path no longer inner-joins kpis/categories.
    const rows = listEntryHistory({ category_id: categoryId });
    expect(rows).toHaveLength(1);
    expect(rows[0].category_id).toBe(categoryId);
  });

  it("deleted history metadata stays discoverable even after more than 1000 newer audit rows", () => {
    const e = upsertEntry({ kpi_id: kpiA, year: 2025, month: 3, value: 10, updated_by: adminId });
    deleteEntry(e.id, adminId);
    deleteKPI(kpiA);
    deleteCategory(categoryId);

    for (let i = 0; i < 1001; i++) {
      upsertEntry({
        kpi_id: kpiB,
        year: 2025,
        month: 1,
        value: i + 1,
        updated_by: adminId,
      });
    }

    const sampledHistory = listEntryHistory({ limit: 1000 });
    expect(sampledHistory.some((row) => row.kpi_id === kpiA)).toBe(false);

    expect(listDeletedHistoryCategories()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: categoryId, name: "Category A", slug: "cat-a" }),
      ]),
    );
    expect(listDeletedHistoryKpis()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: kpiA, name: "KPI A", slug: "kpi-a" }),
      ]),
    );
  });
});

/**
 * Legacy migration: simulate a v4 database (entry_history WITHOUT the
 * snapshot columns) and verify the v4→v5 in-place migration backfills
 * the snapshot from current metadata, and leaves a tombstone NULL for
 * rows whose KPI was already deleted before the migration.
 */
describe("D8AD-CAN-005 v4→v5 legacy migration", () => {
  let tmpDir: string;
  let dbPath: string;
  let originalDbPath: string | undefined;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-migrate-test-"));
    dbPath = path.join(tmpDir, "test.db");
    originalDbPath = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = dbPath;
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

  function buildLegacyV4Db() {
    // Fresh file: getDb() will create the v5 schema. We then manually
    // tear entry_history back to the v4 shape and stamp schema_version=4
    // so the next getDb() re-runs the v4→v5 migration.
    resetDb();
    const db = getDb();
    db.exec("DROP TABLE IF EXISTS entry_history;");
    // Recreate the OLD v4 entry_history shape (no snapshot columns).
    db.exec(`
      CREATE TABLE entry_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_type TEXT NOT NULL CHECK (entry_type IN ('monthly','breakdown')),
        entry_id INTEGER,
        kpi_id INTEGER NOT NULL,
        year INTEGER NOT NULL,
        month_or_label TEXT NOT NULL,
        prev_value REAL,
        new_value REAL,
        prev_notes TEXT,
        new_notes TEXT,
        changed_by INTEGER,
        changed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    // Stamp v4 so the next getDb() runs the v4→v5 in-place migration.
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '4');").run();
    return db;
  }

  it("backfills snapshot columns for rows whose KPI still exists at migration time", () => {
    const db = buildLegacyV4Db();
    // Fixture: a live KPI whose metadata should be backfilled.
    db.prepare(
      "INSERT INTO categories (slug, name, sort_order) VALUES ('legacy-cat', 'Legacy Category', 0)",
    ).run();
    const catId = Number(
      (db.prepare("SELECT id FROM categories WHERE slug = 'legacy-cat'").get() as { id: number }).id,
    );
    db.prepare(
      `INSERT INTO kpis (category_id, slug, name, unit, unit_type, reporting_frequency, direction, sort_order)
       VALUES (?, 'legacy-kpi', 'Legacy KPI', 'count', 'count', 'monthly', 'higher', 0)`,
    ).run(catId);
    const kpiId = Number(
      (db.prepare("SELECT id FROM kpis WHERE slug = 'legacy-kpi'").get() as { id: number }).id,
    );
    // Seed admin so we have a user whose email can be backfilled.
    ensureSeedAdmin();
    const adminId = Number(
      (db.prepare("SELECT id FROM users LIMIT 1").get() as { id: number }).id,
    );
    // A legacy v4 history row with NO snapshot columns populated.
    db.prepare(
      `INSERT INTO entry_history (entry_type, entry_id, kpi_id, year, month_or_label, prev_value, new_value, prev_notes, new_notes, changed_by)
       VALUES ('monthly', 999, ?, 2024, '3', NULL, 42, NULL, NULL, ?)`,
    ).run(kpiId, adminId);

    // Force a re-migration by resetting the connection. getDb() sees
    // schema_version=4 ≠ SCHEMA_VERSION=6 and runs the in-place path.
    resetDb();
    const after = getDb();
    const row = after
      .prepare("SELECT * FROM entry_history WHERE kpi_id = ?")
      .get(kpiId) as Record<string, unknown>;
    expect(row.kpi_name).toBe("Legacy KPI");
    expect(row.kpi_slug).toBe("legacy-kpi");
    expect(row.kpi_unit).toBe("count");
    expect(Number(row.category_id)).toBe(catId);
    expect(row.category_name).toBe("Legacy Category");
    expect(row.category_slug).toBe("legacy-cat");
    expect(String(row.changed_by_email)).toMatch(/@/);

    // listEntryHistory renders it with the snapshot, not deleted, not renamed.
    const list = listEntryHistory({ kpi_id: kpiId });
    expect(list).toHaveLength(1);
    expect(list[0].kpi_name).toBe("Legacy KPI");
    expect(list[0].metadata_deleted).toBe(false);
  });

  it("leaves a NULL tombstone for rows whose KPI was already deleted before migration", () => {
    const db = buildLegacyV4Db();
    ensureSeedAdmin();
    // Insert a history row pointing at a KPI id that does NOT exist.
    db.prepare(
      `INSERT INTO entry_history (entry_type, entry_id, kpi_id, year, month_or_label, prev_value, new_value, prev_notes, new_notes, changed_by)
       VALUES ('monthly', 123, 999999, 2023, '5', NULL, 7, NULL, NULL, NULL)`,
    ).run();
    resetDb();
    getDb();
    const list = listEntryHistory({ kpi_id: 999999 });
    expect(list).toHaveLength(1);
    const r = list[0];
    expect(r.kpi_name).toBeNull();
    expect(r.kpi_slug).toBeNull();
    expect(r.category_name).toBeNull();
    expect(r.metadata_deleted).toBe(true);
    expect(r.kpi_current_name).toBeNull();
  });

  it("is idempotent: re-running the migration does not change backfilled rows", () => {
    const db = buildLegacyV4Db();
    db.prepare(
      "INSERT INTO categories (slug, name, sort_order) VALUES ('idem-cat', 'Idem Category', 0)",
    ).run();
    const catId = Number(
      (db.prepare("SELECT id FROM categories WHERE slug = 'idem-cat'").get() as { id: number }).id,
    );
    db.prepare(
      `INSERT INTO kpis (category_id, slug, name, unit, unit_type, reporting_frequency, direction, sort_order)
       VALUES (?, 'idem-kpi', 'Idem KPI', 'count', 'count', 'monthly', 'higher', 0)`,
    ).run(catId);
    const kpiId = Number(
      (db.prepare("SELECT id FROM kpis WHERE slug = 'idem-kpi'").get() as { id: number }).id,
    );
    db.prepare(
      `INSERT INTO entry_history (entry_type, entry_id, kpi_id, year, month_or_label, prev_value, new_value, prev_notes, new_notes, changed_by)
       VALUES ('monthly', 1, ?, 2024, '1', NULL, 1, NULL, NULL, NULL)`,
    ).run(kpiId);
    resetDb();
    getDb();
    const after1 = listEntryHistory({ kpi_id: kpiId })[0];
    // Re-run the migration path by stamping v4 again and reconnecting.
    const db2 = getDb();
    db2.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '4');").run();
    resetDb();
    getDb();
    const after2 = listEntryHistory({ kpi_id: kpiId })[0];
    expect(after2).toEqual(after1);
  });
});
