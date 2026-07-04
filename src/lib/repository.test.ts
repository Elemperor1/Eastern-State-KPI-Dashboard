import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensureSeedAdmin } from "./auth";
import { getDb, resetDb, transaction } from "./db";
import {
  countKPIDependents,
  createKPI,
  deleteBreakdown,
  deleteEntry,
  deleteKPI,
  listGoals,
  upsertBreakdown,
  upsertEntry,
  upsertGoal,
} from "./repository";

/**
 * Regression tests for the upsert+audit-history atomicity / lastInsertRowid
 * bug. The previous implementation captured the post-write row by
 * `result.lastInsertRowid`, which is connection-level and on
 * `ON CONFLICT DO UPDATE` can point at a different row that the connection
 * inserted earlier — silently returning wrong data and writing a corrupt
 * audit row.
 *
 * The fix wraps the upsert+readback+history in a transaction and reads back
 * by the natural unique key. These tests reproduce the original failure
 * mode (an unrelated insert on the same connection before a conflict
 * update) and assert the read-back and history describe the upsert target.
 *
 * Each test uses a fresh temp SQLite file with a hand-built minimal
 * category + KPI fixture so the FK constraints on monthly_entries and
 * breakdown_entries are satisfied without pulling in the full seed.
 */
describe("upsertEntry / upsertBreakdown audit integrity", () => {
  let tmpDir: string;
  let dbPath: string;
  let originalDbPath: string | undefined;
  let categoryId: number;
  let kpiA: number;
  let kpiB: number;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-repo-test-"));
    dbPath = path.join(tmpDir, "test.db");
    originalDbPath = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = dbPath;
    resetDb();
    ensureSeedAdmin();
    const db = getDb();
    db.prepare(
      "INSERT INTO categories (slug, name, sort_order) VALUES (?, ?, ?)",
    ).run("test-category", "Test Category", 0);
    categoryId = Number(
      (db.prepare("SELECT id FROM categories LIMIT 1").get() as { id: number }).id,
    );
    db.prepare(
      `INSERT INTO kpis (category_id, slug, name, unit, unit_type, reporting_frequency, direction, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(categoryId, "kpi-a", "KPI A", "count", "count", "monthly", "higher", 0);
    db.prepare(
      `INSERT INTO kpis (category_id, slug, name, unit, unit_type, reporting_frequency, direction, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(categoryId, "kpi-b", "KPI B", "count", "count", "monthly", "higher", 1);
    kpiA = Number((db.prepare("SELECT id FROM kpis WHERE slug = ?").get("kpi-a") as { id: number }).id);
    kpiB = Number((db.prepare("SELECT id FROM kpis WHERE slug = ?").get("kpi-b") as { id: number }).id);
  });

  beforeEach(() => {
    // Wipe just the entry tables between tests so each one starts clean
    // (the FK on updated_by means we have to delete monthly_entries first).
    const db = getDb();
    db.exec("DELETE FROM entry_history;");
    db.exec("DELETE FROM monthly_entries;");
    db.exec("DELETE FROM breakdown_entries;");
    db.exec("DELETE FROM kpi_goals;");
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

  function lastHistory(entryType: "monthly" | "breakdown") {
    return getDb()
      .prepare(
        "SELECT * FROM entry_history WHERE entry_type = ? ORDER BY id DESC LIMIT 1",
      )
      .get(entryType) as
      | {
          entry_id: number;
          kpi_id: number;
          year: number;
          month_or_label: string;
          prev_value: number | null;
          new_value: number | null;
          prev_notes: string | null;
          new_notes: string | null;
          changed_by: number | null;
        }
      | undefined;
  }

  it("returns the upsert target row, not an unrelated prior insert", () => {
    // The original bug: a prior insert on the same connection leaves
    // `lastInsertRowid` set to its row id. A subsequent conflict update on a
    // different key must NOT return the prior row.
    const first = upsertEntry({ kpi_id: kpiA, year: 2025, month: 3, value: 10 });
    const second = upsertEntry({ kpi_id: kpiA, year: 2025, month: 4, value: 20 });
    expect(second.kpi_id).toBe(kpiA);
    expect(second.year).toBe(2025);
    expect(second.month).toBe(4);
    expect(second.value).toBe(20);
    expect(second.id).not.toBe(first.id);
  });

  it("writes a correct audit row when an unrelated insert precedes a conflict update", () => {
    // First insert for KPI A month=3.
    upsertEntry({ kpi_id: kpiA, year: 2025, month: 3, value: 10, updated_by: 1 });
    // Unrelated insert on the same connection that bumps lastInsertRowid
    // to point at KPI B's row.
    upsertEntry({ kpi_id: kpiB, year: 2025, month: 3, value: 99, updated_by: 1 });
    // Conflict update on KPI A month=3 (re-uses the first row's id).
    const updated = upsertEntry({
      kpi_id: kpiA,
      year: 2025,
      month: 3,
      value: 42,
      updated_by: 1,
    });
    // The returned row must describe the upsert target, not the unrelated insert.
    expect(updated.kpi_id).toBe(kpiA);
    expect(updated.value).toBe(42);
    // The latest audit row must also describe the upsert target.
    const h = lastHistory("monthly");
    expect(h).toBeDefined();
    expect(h!.kpi_id).toBe(kpiA);
    expect(h!.new_value).toBe(42);
    expect(h!.prev_value).toBe(10);
    expect(h!.month_or_label).toBe("3");
  });

  it("records a null prev_value on first insert, not a stale value", () => {
    // Two distinct inserts with no conflict — the second is a new key, so
    // its history row must have prev_value=null, not a value from a
    // different entry.
    upsertEntry({ kpi_id: kpiA, year: 2025, month: 1, value: 5, updated_by: 1 });
    const created = upsertEntry({
      kpi_id: kpiA,
      year: 2025,
      month: 2,
      value: 7,
      updated_by: 1,
    });
    expect(created.value).toBe(7);
    const h = lastHistory("monthly");
    expect(h).toBeDefined();
    expect(h!.kpi_id).toBe(kpiA);
    expect(h!.new_value).toBe(7);
    expect(h!.prev_value).toBeNull();
  });

  it("upsertBreakdown writes a correct audit row on conflict update", () => {
    upsertBreakdown({
      kpi_id: kpiA,
      year: 2025,
      label: "Group A",
      value: 10,
      updated_by: 1,
    });
    // Unrelated insert that bumps lastInsertRowid.
    upsertBreakdown({
      kpi_id: kpiB,
      year: 2025,
      label: "Group B",
      value: 99,
      updated_by: 1,
    });
    // Conflict update on the first label.
    const updated = upsertBreakdown({
      kpi_id: kpiA,
      year: 2025,
      label: "Group A",
      value: 42,
      updated_by: 1,
    });
    expect(updated.kpi_id).toBe(kpiA);
    expect(updated.label).toBe("Group A");
    expect(updated.value).toBe(42);
    const h = lastHistory("breakdown");
    expect(h).toBeDefined();
    expect(h!.kpi_id).toBe(kpiA);
    expect(h!.month_or_label).toBe("0|Group A");
    expect(h!.new_value).toBe(42);
    expect(h!.prev_value).toBe(10);
  });

  it("returns a stable row id for the same (kpi, year, month) across repeated upserts", () => {
    // Drive many upserts in a row, including re-upserts of the same key.
    // The new code path must keep the same row id for the same key across
    // both inserts and conflict updates — i.e. the post-write read must
    // not be confused by an unrelated `lastInsertRowid` left over from a
    // prior connection-level insert.
    const idByKey = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      const month = (i % 12) + 1;
      const r = upsertEntry({
        kpi_id: i % 2 === 0 ? kpiA : kpiB,
        year: 2025,
        month,
        value: i,
        updated_by: 1,
      });
      const key = `${r.kpi_id}:${r.year}:${r.month}`;
      const prev = idByKey.get(key);
      if (prev !== undefined && prev !== r.id) {
        throw new Error(
          `id changed for ${key}: was ${prev}, now ${r.id} — the read-back is unstable`,
        );
      }
      idByKey.set(key, r.id);
    }
  });

  it("transaction() rolls back the whole stack on throw", () => {
    // Sanity check for the transaction helper. The outer transaction
    // wraps an inner transaction (a savepoint). Throwing inside the inner
    // must roll back the savepoint AND the outer transaction must observe
    // no committed writes.
    const db = getDb();
    db.exec("DELETE FROM monthly_entries;");
    db.exec("DELETE FROM entry_history;");
    expect(() =>
      transaction(() => {
        upsertEntry({ kpi_id: kpiA, year: 2025, month: 1, value: 1, updated_by: 1 });
        // Nested transaction — exercises the savepoint path.
        transaction(() => {
          upsertEntry({ kpi_id: kpiA, year: 2025, month: 2, value: 2, updated_by: 1 });
        });
        throw new Error("simulated");
      }),
    ).toThrow("simulated");
    const rows = db.prepare("SELECT * FROM monthly_entries").all();
    expect(rows).toEqual([]);
    const hist = db.prepare("SELECT * FROM entry_history").all();
    expect(hist).toEqual([]);
  });

  it("transaction() commits nested calls when nothing throws", () => {
    // A nested transaction that returns normally must release its
    // savepoint and the outer transaction must commit both writes.
    const db = getDb();
    db.exec("DELETE FROM monthly_entries;");
    db.exec("DELETE FROM entry_history;");
    transaction(() => {
      upsertEntry({ kpi_id: kpiA, year: 2025, month: 1, value: 1, updated_by: 1 });
      transaction(() => {
        upsertEntry({ kpi_id: kpiA, year: 2025, month: 2, value: 2, updated_by: 1 });
      });
    });
    const rows = db
      .prepare("SELECT month, value FROM monthly_entries ORDER BY month ASC")
      .all() as { month: number; value: number }[];
    expect(rows).toEqual([
      { month: 1, value: 1 },
      { month: 2, value: 2 },
    ]);
  });

  it("transaction() clears nested stack state before the next top-level rollback", () => {
    const db = getDb();
    db.exec("DELETE FROM monthly_entries;");
    db.exec("DELETE FROM entry_history;");

    transaction(() => {
      transaction(() => {
        upsertEntry({ kpi_id: kpiA, year: 2025, month: 1, value: 1, updated_by: 1 });
      });
    });

    expect(() =>
      transaction(() => {
        upsertEntry({ kpi_id: kpiA, year: 2025, month: 2, value: 2, updated_by: 1 });
        throw new Error("top-level failure after nested success");
      }),
    ).toThrow("top-level failure after nested success");

    const rows = db
      .prepare("SELECT month, value FROM monthly_entries ORDER BY month ASC")
      .all() as { month: number; value: number }[];
    expect(rows).toEqual([{ month: 1, value: 1 }]);

    expect(() => {
      db.exec("BEGIN");
      db.exec("ROLLBACK");
    }).not.toThrow();
  });

  it("deleteEntry still records a correct history row", () => {
    // The delete path is not the focus of the fix, but a regression
    // guard: the delete history is keyed by id, so it should be stable.
    const e = upsertEntry({
      kpi_id: kpiA,
      year: 2025,
      month: 5,
      value: 50,
      updated_by: 1,
    });
    deleteEntry(e.id, 1);
    const h = lastHistory("monthly");
    expect(h).toBeDefined();
    expect(h!.entry_id).toBe(e.id);
    expect(h!.kpi_id).toBe(kpiA);
    expect(h!.new_value).toBeNull();
    expect(h!.prev_value).toBe(50);
  });

  it("deleteBreakdown still records a correct history row", () => {
    const e = upsertBreakdown({
      kpi_id: kpiA,
      year: 2025,
      label: "Group D",
      value: 25,
      updated_by: 1,
    });
    deleteBreakdown(e.id, 1);
    const h = lastHistory("breakdown");
    expect(h).toBeDefined();
    expect(h!.entry_id).toBe(e.id);
    expect(h!.kpi_id).toBe(kpiA);
    expect(h!.new_value).toBeNull();
    expect(h!.prev_value).toBe(25);
  });

  it("counts entries on recursive KPI descendants before parent deletion", () => {
    const parent = createKPI({
      category_id: categoryId,
      slug: "parent-recursive-delete",
      name: "Parent Recursive Delete",
      unit: "count",
      unit_type: "count",
      reporting_frequency: "monthly",
      direction: "higher",
    });
    const child = createKPI({
      category_id: categoryId,
      parent_id: parent.id,
      slug: "child-recursive-delete",
      name: "Child Recursive Delete",
      unit: "count",
      unit_type: "count",
      reporting_frequency: "monthly",
      direction: "higher",
    });
    const grandchild = createKPI({
      category_id: categoryId,
      parent_id: child.id,
      slug: "grandchild-recursive-delete",
      name: "Grandchild Recursive Delete",
      unit: "count",
      unit_type: "count",
      reporting_frequency: "monthly",
      direction: "higher",
    });

    upsertEntry({
      kpi_id: grandchild.id,
      year: 2025,
      month: 1,
      value: 42,
      updated_by: 1,
    });

    expect(countKPIDependents(parent.id)).toBe(1);
    expect(() => deleteKPI(parent.id)).toThrow(/Cannot delete KPI/);
  });

  it("computes goals from a fixed prior-year baseline, not the target-year actual", () => {
    upsertEntry({ kpi_id: kpiA, year: 2024, month: 1, value: 100, updated_by: 1 });
    upsertEntry({ kpi_id: kpiA, year: 2025, month: 1, value: 90, updated_by: 1 });
    upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      goal_type: "pct",
      target_value: 20,
      enabled: true,
      updated_by: 1,
    });

    const goal = listGoals({ enabledOnly: true, year: 2025 }).find((g) => g.kpi_id === kpiA);
    expect(goal).toBeDefined();
    expect(goal!.current_value).toBe(90);
    expect(goal!.goal_target).toBe(120);
    expect(goal!.progress_pct).toBe(75);
  });

  it("includes month-0 annual entries when computing goal progress", () => {
    const annual = createKPI({
      category_id: categoryId,
      slug: "annual-goal-progress",
      name: "Annual Goal Progress",
      unit: "count",
      unit_type: "count",
      reporting_frequency: "annual",
      direction: "higher",
    });
    upsertEntry({ kpi_id: annual.id, year: 2024, month: 0, value: 1000, updated_by: 1 });
    upsertEntry({ kpi_id: annual.id, year: 2025, month: 0, value: 1100, updated_by: 1 });
    upsertGoal({
      kpi_id: annual.id,
      target_year: 2025,
      goal_type: "number",
      target_value: 100,
      enabled: true,
      updated_by: 1,
    });

    const goal = listGoals({ enabledOnly: true, year: 2025 }).find((g) => g.kpi_id === annual.id);
    expect(goal).toBeDefined();
    expect(goal!.current_value).toBe(1100);
    expect(goal!.goal_target).toBe(1100);
    expect(goal!.progress_pct).toBe(100);
  });
});
