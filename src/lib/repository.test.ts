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
  deleteGoal,
  deleteKPI,
  listGoals,
  toggleGoal,
  updateGoal,
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
    expect(goal!.full_year_value).toBe(90);
    expect(goal!.full_year_target).toBe(120);
    expect(goal!.full_year_progress_pct).toBe(75);
    // Backward-compat aliases
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
    expect(goal!.full_year_value).toBe(1100);
    expect(goal!.full_year_target).toBe(1100);
    expect(goal!.full_year_progress_pct).toBe(100);
    // Annual KPI: YTD == full-year
    expect(goal!.ytd_value).toBe(1100);
    expect(goal!.ytd_target).toBe(1100);
    expect(goal!.ytd_progress_pct).toBe(100);
  });

  it("separates YTD pacing from full-year completion for monthly KPIs", () => {
    // Baseline: 2024 full year = 120 (10/month × 12)
    for (let m = 1; m <= 12; m++) {
      upsertEntry({ kpi_id: kpiA, year: 2024, month: m, value: 10, updated_by: 1 });
    }
    // Target year: 2025 — only Jan–Mar entered, 15/month = 45 YTD
    for (let m = 1; m <= 3; m++) {
      upsertEntry({ kpi_id: kpiA, year: 2025, month: m, value: 15, updated_by: 1 });
    }
    upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      goal_type: "pct",
      target_value: 20, // target = 120 * 1.2 = 144
      enabled: true,
      updated_by: 1,
    });

    // throughMonth = 3 (March)
    const goal = listGoals({ enabledOnly: true, year: 2025, throughMonth: 3 }).find(
      (g) => g.kpi_id === kpiA,
    );
    expect(goal).toBeDefined();
    // YTD: actual = 45, prorated target = 144 * 3/12 = 36, pace = 45/36 = 125%
    expect(goal!.ytd_value).toBe(45);
    expect(goal!.ytd_target).toBe(36);
    expect(goal!.ytd_progress_pct).toBe(100); // capped at 100
    // Full year: actual = 45 (only 3 months), target = 144, completion = 31%
    expect(goal!.full_year_value).toBe(45);
    expect(goal!.full_year_target).toBe(144);
    expect(goal!.full_year_progress_pct).toBe(31);
  });

  it("returns null values when no prior-year baseline exists", () => {
    upsertEntry({ kpi_id: kpiA, year: 2025, month: 1, value: 50, updated_by: 1 });
    upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      goal_type: "pct",
      target_value: 10,
      enabled: true,
      updated_by: 1,
    });

    const goal = listGoals({ enabledOnly: true, year: 2025 }).find((g) => g.kpi_id === kpiA);
    expect(goal).toBeDefined();
    // No 2024 data → baseline is null → target is null → progress is null
    expect(goal!.full_year_target).toBeNull();
    expect(goal!.full_year_progress_pct).toBeNull();
    expect(goal!.ytd_target).toBeNull();
    expect(goal!.ytd_progress_pct).toBeNull();
    // But actual values are still computed
    expect(goal!.full_year_value).toBe(50);
  });

  it("returns null actual values when no entries exist for the target year", () => {
    // Baseline exists but no target-year data
    upsertEntry({ kpi_id: kpiA, year: 2024, month: 1, value: 100, updated_by: 1 });
    upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      goal_type: "pct",
      target_value: 20,
      enabled: true,
      updated_by: 1,
    });

    const goal = listGoals({ enabledOnly: true, year: 2025, throughMonth: 6 }).find(
      (g) => g.kpi_id === kpiA,
    );
    expect(goal).toBeDefined();
    expect(goal!.full_year_target).toBe(120);
    expect(goal!.full_year_value).toBeNull();
    expect(goal!.full_year_progress_pct).toBeNull();
    expect(goal!.ytd_value).toBeNull();
    expect(goal!.ytd_progress_pct).toBeNull();
  });

  it("inverts progress for lower-is-better KPIs", () => {
    // Create a "lower" direction KPI
    const lowerKpi = createKPI({
      category_id: categoryId,
      slug: "lower-is-better",
      name: "Lower Is Better",
      unit: "count",
      unit_type: "count",
      reporting_frequency: "monthly",
      direction: "lower",
    });
    // Baseline: 2024 = 100/month → 1200 total
    for (let m = 1; m <= 12; m++) {
      upsertEntry({ kpi_id: lowerKpi.id, year: 2024, month: m, value: 100, updated_by: 1 });
    }
    // Goal: reduce by 20% → target = 1200 * 0.8 = 960
    upsertGoal({
      kpi_id: lowerKpi.id,
      target_year: 2025,
      goal_type: "pct",
      target_value: -20,
      enabled: true,
      updated_by: 1,
    });
    // 2025 actual = 80/month → 960 total (exactly at target)
    for (let m = 1; m <= 12; m++) {
      upsertEntry({ kpi_id: lowerKpi.id, year: 2025, month: m, value: 80, updated_by: 1 });
    }

    const goal = listGoals({ enabledOnly: true, year: 2025 }).find(
      (g) => g.kpi_id === lowerKpi.id,
    );
    expect(goal).toBeDefined();
    expect(goal!.full_year_target).toBe(960);
    expect(goal!.full_year_value).toBe(960);
    // progress = (baseline - actual) / (baseline - target) = (1200-960)/(1200-960) = 100%
    expect(goal!.full_year_progress_pct).toBe(100);
  });

  it("inverts progress for lower-is-better KPIs — partial progress", () => {
    const lowerKpi = createKPI({
      category_id: categoryId,
      slug: "lower-partial",
      name: "Lower Partial",
      unit: "count",
      unit_type: "count",
      reporting_frequency: "monthly",
      direction: "lower",
    });
    // Baseline: 2024 = 100/month → 1200 total
    for (let m = 1; m <= 12; m++) {
      upsertEntry({ kpi_id: lowerKpi.id, year: 2024, month: m, value: 100, updated_by: 1 });
    }
    // Goal: reduce by 20% → target = 1200 * 0.8 = 960
    upsertGoal({
      kpi_id: lowerKpi.id,
      target_year: 2025,
      goal_type: "pct",
      target_value: -20,
      enabled: true,
      updated_by: 1,
    });
    // 2025 actual = 90/month → 1080 total (halfway from 1200 to 960)
    for (let m = 1; m <= 12; m++) {
      upsertEntry({ kpi_id: lowerKpi.id, year: 2025, month: m, value: 90, updated_by: 1 });
    }

    const goal = listGoals({ enabledOnly: true, year: 2025 }).find(
      (g) => g.kpi_id === lowerKpi.id,
    );
    expect(goal).toBeDefined();
    expect(goal!.full_year_target).toBe(960);
    expect(goal!.full_year_value).toBe(1080);
    // progress = (1200 - 1080) / (1200 - 960) = 120/240 = 50%
    expect(goal!.full_year_progress_pct).toBe(50);
  });

  it("YTD lower-is-better progress uses prorated baseline, not full-year baseline", () => {
    // This is the critical regression test: without prorating the baseline
    // for YTD pacing, the "lower" formula mixed annual-scale baseline with
    // YTD-scale actual/target, producing wildly wrong percentages.
    const lowerKpi = createKPI({
      category_id: categoryId,
      slug: "lower-ytd-prorate",
      name: "Lower YTD Prorate",
      unit: "count",
      unit_type: "count",
      reporting_frequency: "monthly",
      direction: "lower",
    });
    // Baseline: 2024 = 100/month → 1200 total
    for (let m = 1; m <= 12; m++) {
      upsertEntry({ kpi_id: lowerKpi.id, year: 2024, month: m, value: 100, updated_by: 1 });
    }
    // Goal: reduce by 20% → full-year target = 1200 * 0.8 = 960
    upsertGoal({
      kpi_id: lowerKpi.id,
      target_year: 2025,
      goal_type: "pct",
      target_value: -20,
      enabled: true,
      updated_by: 1,
    });
    // 2025: only Jan–Mar entered, 90/month → 270 YTD
    for (let m = 1; m <= 3; m++) {
      upsertEntry({ kpi_id: lowerKpi.id, year: 2025, month: m, value: 90, updated_by: 1 });
    }

    const goal = listGoals({ enabledOnly: true, year: 2025, throughMonth: 3 }).find(
      (g) => g.kpi_id === lowerKpi.id,
    );
    expect(goal).toBeDefined();
    // YTD target = 960 * 3/12 = 240
    expect(goal!.ytd_target).toBe(240);
    // YTD actual = 270
    expect(goal!.ytd_value).toBe(270);
    // YTD baseline (prorated) = 1200 * 3/12 = 300
    // progress = (300 - 270) / (300 - 240) = 30/60 = 50%
    expect(goal!.ytd_progress_pct).toBe(50);
  });

  it("lower-is-better with positive target_value falls back to simple ratio", () => {
    // A semantically odd goal: "increase a lower-is-better metric by 20%"
    // The target will be ABOVE the baseline, so the (baseline - target)
    // range would be negative. The code should fall back to a simple ratio.
    const lowerKpi = createKPI({
      category_id: categoryId,
      slug: "lower-positive-goal",
      name: "Lower Positive Goal",
      unit: "count",
      unit_type: "count",
      reporting_frequency: "monthly",
      direction: "lower",
    });
    for (let m = 1; m <= 12; m++) {
      upsertEntry({ kpi_id: lowerKpi.id, year: 2024, month: m, value: 100, updated_by: 1 });
    }
    upsertGoal({
      kpi_id: lowerKpi.id,
      target_year: 2025,
      goal_type: "pct",
      target_value: 20, // positive → target = 1200 * 1.2 = 1440 (ABOVE baseline)
      enabled: true,
      updated_by: 1,
    });
    for (let m = 1; m <= 12; m++) {
      upsertEntry({ kpi_id: lowerKpi.id, year: 2025, month: m, value: 120, updated_by: 1 });
    }

    const goal = listGoals({ enabledOnly: true, year: 2025 }).find(
      (g) => g.kpi_id === lowerKpi.id,
    );
    expect(goal).toBeDefined();
    expect(goal!.full_year_target).toBe(1440);
    expect(goal!.full_year_value).toBe(1440);
    // Fallback: simple ratio = 1440/1440 = 100%
    expect(goal!.full_year_progress_pct).toBe(100);
  });

  it("treats flexible reporting frequency as annual for goal computation", () => {
    const flexibleKpi = createKPI({
      category_id: categoryId,
      slug: "flexible-goal",
      name: "Flexible Goal",
      unit: "count",
      unit_type: "count",
      reporting_frequency: "flexible",
      direction: "higher",
    });
    // Flexible KPIs store a single value at month 0, like annual KPIs
    upsertEntry({ kpi_id: flexibleKpi.id, year: 2024, month: 0, value: 500, updated_by: 1 });
    upsertEntry({ kpi_id: flexibleKpi.id, year: 2025, month: 0, value: 600, updated_by: 1 });
    upsertGoal({
      kpi_id: flexibleKpi.id,
      target_year: 2025,
      goal_type: "pct",
      target_value: 20, // target = 500 * 1.2 = 600
      enabled: true,
      updated_by: 1,
    });

    const goal = listGoals({ enabledOnly: true, year: 2025 }).find(
      (g) => g.kpi_id === flexibleKpi.id,
    );
    expect(goal).toBeDefined();
    // Flexible → treated as annual: month-0 value used, YTD == full-year
    expect(goal!.full_year_value).toBe(600);
    expect(goal!.full_year_target).toBe(600);
    expect(goal!.full_year_progress_pct).toBe(100);
    expect(goal!.ytd_value).toBe(600);
    expect(goal!.ytd_target).toBe(600);
    expect(goal!.ytd_progress_pct).toBe(100);
  });

  it("goal target does not change when throughMonth changes", () => {
    // The target is derived from the prior-year baseline, which is fixed.
    // Changing the through-month must only affect the YTD proration, not
    // the full-year target or the full-year progress.
    for (let m = 1; m <= 12; m++) {
      upsertEntry({ kpi_id: kpiA, year: 2024, month: m, value: 10, updated_by: 1 });
    }
    for (let m = 1; m <= 6; m++) {
      upsertEntry({ kpi_id: kpiA, year: 2025, month: m, value: 12, updated_by: 1 });
    }
    upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      goal_type: "pct",
      target_value: 20, // target = 120 * 1.2 = 144
      enabled: true,
      updated_by: 1,
    });

    const goalMar = listGoals({ enabledOnly: true, year: 2025, throughMonth: 3 }).find(
      (g) => g.kpi_id === kpiA,
    );
    const goalJun = listGoals({ enabledOnly: true, year: 2025, throughMonth: 6 }).find(
      (g) => g.kpi_id === kpiA,
    );
    const goalDec = listGoals({ enabledOnly: true, year: 2025, throughMonth: 12 }).find(
      (g) => g.kpi_id === kpiA,
    );

    expect(goalMar).toBeDefined();
    expect(goalJun).toBeDefined();
    expect(goalDec).toBeDefined();

    // Full-year target is invariant
    expect(goalMar!.full_year_target).toBe(144);
    expect(goalJun!.full_year_target).toBe(144);
    expect(goalDec!.full_year_target).toBe(144);

    // Full-year value is invariant (sum of all entered months)
    expect(goalMar!.full_year_value).toBe(72);
    expect(goalJun!.full_year_value).toBe(72);
    expect(goalDec!.full_year_value).toBe(72);

    // Full-year progress is invariant
    expect(goalMar!.full_year_progress_pct).toBe(50); // 72/144 = 50%
    expect(goalJun!.full_year_progress_pct).toBe(50);
    expect(goalDec!.full_year_progress_pct).toBe(50);

    // YTD target changes with throughMonth (prorated)
    expect(goalMar!.ytd_target).toBe(36);  // 144 * 3/12
    expect(goalJun!.ytd_target).toBe(72);  // 144 * 6/12
    expect(goalDec!.ytd_target).toBe(144); // 144 * 12/12

    // YTD value changes (more months included)
    expect(goalMar!.ytd_value).toBe(36);  // 12 * 3
    expect(goalJun!.ytd_value).toBe(72);  // 12 * 6
    expect(goalDec!.ytd_value).toBe(72);  // only 6 months entered

    // YTD progress: all 100% (on pace: 12/month vs 12/month target pace)
    expect(goalMar!.ytd_progress_pct).toBe(100); // 36/36
    expect(goalJun!.ytd_progress_pct).toBe(100); // 72/72
    // Dec: 72 actual vs 144 target = 50% (same as full-year)
    expect(goalDec!.ytd_progress_pct).toBe(50);
  });

  it("listGoals with year filter returns only goals for that year", () => {
    // Create goals for multiple years on the same KPI
    for (let y = 2023; y <= 2025; y++) {
      upsertEntry({ kpi_id: kpiA, year: y - 1, month: 1, value: 100, updated_by: 1 });
      upsertEntry({ kpi_id: kpiA, year: y, month: 1, value: 110, updated_by: 1 });
      upsertGoal({
        kpi_id: kpiA,
        target_year: y,
        goal_type: "pct",
        target_value: 20,
        enabled: true,
        updated_by: 1,
      });
    }

    // Filter by 2024
    const goals2024 = listGoals({ year: 2024 });
    expect(goals2024.length).toBe(1);
    expect(goals2024[0].target_year).toBe(2024);
    expect(goals2024[0].kpi_id).toBe(kpiA);

    // Filter by 2025
    const goals2025 = listGoals({ year: 2025 });
    expect(goals2025.length).toBe(1);
    expect(goals2025[0].target_year).toBe(2025);

    // No year filter → all years
    const allGoals = listGoals();
    expect(allGoals.length).toBe(3);
    expect(allGoals.map((g) => g.target_year).sort()).toEqual([2023, 2024, 2025]);
  });

  it("listGoals with year + throughMonth filter computes YTD for the correct year", () => {
    // 2024 baseline: 10/month × 12 = 120
    for (let m = 1; m <= 12; m++) {
      upsertEntry({ kpi_id: kpiA, year: 2024, month: m, value: 10, updated_by: 1 });
    }
    // 2025 target year: 15/month for Jan–Mar only = 45 YTD
    for (let m = 1; m <= 3; m++) {
      upsertEntry({ kpi_id: kpiA, year: 2025, month: m, value: 15, updated_by: 1 });
    }
    upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      goal_type: "pct",
      target_value: 20, // target = 120 * 1.2 = 144
      enabled: true,
      updated_by: 1,
    });

    // Load with year=2025 and throughMonth=3
    const goals = listGoals({ year: 2025, throughMonth: 3 });
    expect(goals.length).toBe(1);
    const goal = goals[0];
    expect(goal.target_year).toBe(2025);
    expect(goal.ytd_value).toBe(45);
    expect(goal.ytd_target).toBe(36); // 144 * 3/12
    expect(goal.full_year_value).toBe(45);
    expect(goal.full_year_target).toBe(144);
  });

  it("listGoals with year filter does not leak goals from other years", () => {
    // Create a goal for 2025 on kpiA and a goal for 2024 on kpiB
    upsertEntry({ kpi_id: kpiA, year: 2024, month: 1, value: 100, updated_by: 1 });
    upsertEntry({ kpi_id: kpiA, year: 2025, month: 1, value: 110, updated_by: 1 });
    upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      goal_type: "pct",
      target_value: 20,
      enabled: true,
      updated_by: 1,
    });

    upsertEntry({ kpi_id: kpiB, year: 2023, month: 1, value: 50, updated_by: 1 });
    upsertEntry({ kpi_id: kpiB, year: 2024, month: 1, value: 55, updated_by: 1 });
    upsertGoal({
      kpi_id: kpiB,
      target_year: 2024,
      goal_type: "pct",
      target_value: 10,
      enabled: true,
      updated_by: 1,
    });

    // year=2025 must NOT include the kpiB 2024 goal
    const goals2025 = listGoals({ year: 2025 });
    expect(goals2025.length).toBe(1);
    expect(goals2025[0].kpi_id).toBe(kpiA);
    expect(goals2025[0].target_year).toBe(2025);

    // year=2024 must NOT include the kpiA 2025 goal
    const goals2024 = listGoals({ year: 2024 });
    expect(goals2024.length).toBe(1);
    expect(goals2024[0].kpi_id).toBe(kpiB);
    expect(goals2024[0].target_year).toBe(2024);
  });

  it("annual KPI goal with no target-year data shows null progress but valid target", () => {
    // Baseline exists (2024), but no 2025 data entered yet
    const annual = createKPI({
      category_id: categoryId,
      slug: "annual-no-data",
      name: "Annual No Data",
      unit: "count",
      unit_type: "count",
      reporting_frequency: "annual",
      direction: "higher",
    });
    upsertEntry({ kpi_id: annual.id, year: 2024, month: 0, value: 1000, updated_by: 1 });
    upsertGoal({
      kpi_id: annual.id,
      target_year: 2025,
      goal_type: "pct",
      target_value: 20, // target = 1000 * 1.2 = 1200
      enabled: true,
      updated_by: 1,
    });

    const goal = listGoals({ year: 2025 }).find((g) => g.kpi_id === annual.id);
    expect(goal).toBeDefined();
    // Target is computed from baseline
    expect(goal!.full_year_target).toBe(1200);
    // No target-year data → value and progress are null
    expect(goal!.full_year_value).toBeNull();
    expect(goal!.full_year_progress_pct).toBeNull();
    expect(goal!.ytd_value).toBeNull();
    expect(goal!.ytd_progress_pct).toBeNull();
  });

  it("annual KPI goal with no baseline shows null target", () => {
    const annual = createKPI({
      category_id: categoryId,
      slug: "annual-no-baseline",
      name: "Annual No Baseline",
      unit: "count",
      unit_type: "count",
      reporting_frequency: "annual",
      direction: "higher",
    });
    // Only target-year data, no prior year
    upsertEntry({ kpi_id: annual.id, year: 2025, month: 0, value: 500, updated_by: 1 });
    upsertGoal({
      kpi_id: annual.id,
      target_year: 2025,
      goal_type: "pct",
      target_value: 20,
      enabled: true,
      updated_by: 1,
    });

    const goal = listGoals({ year: 2025 }).find((g) => g.kpi_id === annual.id);
    expect(goal).toBeDefined();
    expect(goal!.full_year_target).toBeNull();
    expect(goal!.full_year_progress_pct).toBeNull();
    // Value is still computed
    expect(goal!.full_year_value).toBe(500);
  });

  it("annual KPI goal with lower direction computes inverted progress from month=0", () => {
    const annual = createKPI({
      category_id: categoryId,
      slug: "annual-lower",
      name: "Annual Lower",
      unit: "count",
      unit_type: "count",
      reporting_frequency: "annual",
      direction: "lower",
    });
    upsertEntry({ kpi_id: annual.id, year: 2024, month: 0, value: 1000, updated_by: 1 });
    upsertEntry({ kpi_id: annual.id, year: 2025, month: 0, value: 850, updated_by: 1 });
    upsertGoal({
      kpi_id: annual.id,
      target_year: 2025,
      goal_type: "pct",
      target_value: -20, // target = 1000 * 0.8 = 800
      enabled: true,
      updated_by: 1,
    });

    const goal = listGoals({ year: 2025 }).find((g) => g.kpi_id === annual.id);
    expect(goal).toBeDefined();
    expect(goal!.full_year_target).toBe(800);
    expect(goal!.full_year_value).toBe(850);
    // progress = (1000 - 850) / (1000 - 800) = 150/200 = 75%
    expect(goal!.full_year_progress_pct).toBe(75);
    // Annual: YTD == full-year
    expect(goal!.ytd_progress_pct).toBe(75);
  });

  it("annual KPI goal value 0 is distinguished from no data", () => {
    const annual = createKPI({
      category_id: categoryId,
      slug: "annual-zero",
      name: "Annual Zero",
      unit: "count",
      unit_type: "count",
      reporting_frequency: "annual",
      direction: "higher",
    });
    // Baseline = 100, target year = 0 (explicitly entered)
    upsertEntry({ kpi_id: annual.id, year: 2024, month: 0, value: 100, updated_by: 1 });
    upsertEntry({ kpi_id: annual.id, year: 2025, month: 0, value: 0, updated_by: 1 });
    upsertGoal({
      kpi_id: annual.id,
      target_year: 2025,
      goal_type: "pct",
      target_value: 50, // target = 100 * 1.5 = 150
      enabled: true,
      updated_by: 1,
    });

    const goal = listGoals({ year: 2025 }).find((g) => g.kpi_id === annual.id);
    expect(goal).toBeDefined();
    // Value is 0 (entered), not null (no data)
    expect(goal!.full_year_value).toBe(0);
    expect(goal!.full_year_progress_pct).toBe(0); // 0/150 = 0%
  });

  it("annual KPI goal with throughMonth still uses month=0 value", () => {
    // throughMonth should not affect annual KPIs — they always use month=0
    const annual = createKPI({
      category_id: categoryId,
      slug: "annual-throughmonth",
      name: "Annual ThroughMonth",
      unit: "count",
      unit_type: "count",
      reporting_frequency: "annual",
      direction: "higher",
    });
    upsertEntry({ kpi_id: annual.id, year: 2024, month: 0, value: 100, updated_by: 1 });
    upsertEntry({ kpi_id: annual.id, year: 2025, month: 0, value: 120, updated_by: 1 });
    upsertGoal({
      kpi_id: annual.id,
      target_year: 2025,
      goal_type: "pct",
      target_value: 50, // target = 100 * 1.5 = 150
      enabled: true,
      updated_by: 1,
    });

    // throughMonth=3 should not change anything for annual KPIs
    const goal = listGoals({ year: 2025, throughMonth: 3 }).find((g) => g.kpi_id === annual.id);
    expect(goal).toBeDefined();
    expect(goal!.ytd_value).toBe(120); // same as full_year
    expect(goal!.ytd_target).toBe(150); // same as full_year (no proration)
    expect(goal!.ytd_progress_pct).toBe(80); // 120/150
    expect(goal!.full_year_progress_pct).toBe(80);
  });

  it("updateGoal changes the target and progress recalculates immediately", () => {
    // Baseline: 2024 = 100 → full year 1200
    for (let m = 1; m <= 12; m++) {
      upsertEntry({ kpi_id: kpiA, year: 2024, month: m, value: 100, updated_by: 1 });
    }
    // Target year: 2025 = 120/month × 12 = 1440
    for (let m = 1; m <= 12; m++) {
      upsertEntry({ kpi_id: kpiA, year: 2025, month: m, value: 120, updated_by: 1 });
    }
    // Create goal: +20% → target = 1200 * 1.2 = 1440, progress = 1440/1440 = 100%
    const created = upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      goal_type: "pct",
      target_value: 20,
      enabled: true,
      updated_by: 1,
    });
    const before = listGoals({ year: 2025 }).find((g) => g.kpi_id === kpiA);
    expect(before!.full_year_target).toBe(1440);
    expect(before!.full_year_progress_pct).toBe(100);

    // Update goal: +50% → target = 1200 * 1.5 = 1800, progress = 1440/1800 = 80%
    updateGoal({ id: created.id, enabled: true, goal_type: "pct", target_value: 50 });
    const after = listGoals({ year: 2025 }).find((g) => g.kpi_id === kpiA);
    expect(after!.target_value).toBe(50);
    expect(after!.full_year_target).toBe(1800);
    expect(after!.full_year_progress_pct).toBe(80);
  });

  it("updateGoal changes goal_type from pct to number", () => {
    for (let m = 1; m <= 12; m++) {
      upsertEntry({ kpi_id: kpiA, year: 2024, month: m, value: 100, updated_by: 1 });
    }
    for (let m = 1; m <= 12; m++) {
      upsertEntry({ kpi_id: kpiA, year: 2025, month: m, value: 110, updated_by: 1 });
    }
    // pct +20% → target = 1200 * 1.2 = 1440
    const created = upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      goal_type: "pct",
      target_value: 20,
      enabled: true,
      updated_by: 1,
    });
    // Switch to number +300 → target = 1200 + 300 = 1500
    updateGoal({ id: created.id, enabled: true, goal_type: "number", target_value: 300 });
    const after = listGoals({ year: 2025 }).find((g) => g.kpi_id === kpiA);
    expect(after!.goal_type).toBe("number");
    expect(after!.target_value).toBe(300);
    expect(after!.full_year_target).toBe(1500);
    // progress = 1320/1500 = 88%
    expect(after!.full_year_progress_pct).toBe(88);
  });

  it("updateGoal updates notes", () => {
    const created = upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      goal_type: "pct",
      target_value: 10,
      enabled: true,
      notes: "original note",
      updated_by: 1,
    });
    updateGoal({ id: created.id, enabled: true, notes: "updated note" });
    const after = listGoals({ year: 2025 }).find((g) => g.kpi_id === kpiA);
    expect(after!.notes).toBe("updated note");
    // target_value unchanged
    expect(after!.target_value).toBe(10);
  });

  it("updateGoal throws when the id does not exist", () => {
    expect(() => updateGoal({ id: 99999, enabled: true })).toThrow(/no row/);
  });

  it("toggleGoal toggles enabled without changing the target", () => {
    const created = upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      goal_type: "pct",
      target_value: 20,
      enabled: true,
      updated_by: 1,
    });
    toggleGoal(created.id, false);
    const disabled = listGoals({ year: 2025 }).find((g) => g.kpi_id === kpiA);
    expect(disabled!.enabled).toBe(false);
    expect(disabled!.target_value).toBe(20);

    toggleGoal(created.id, true);
    const enabled = listGoals({ year: 2025 }).find((g) => g.kpi_id === kpiA);
    expect(enabled!.enabled).toBe(true);
  });

  it("deleteGoal removes the goal", () => {
    const created = upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      goal_type: "pct",
      target_value: 20,
      enabled: true,
      updated_by: 1,
    });
    expect(listGoals({ year: 2025 }).length).toBe(1);
    deleteGoal(created.id);
    expect(listGoals({ year: 2025 }).length).toBe(0);
  });

  it("upsertGoal (POST) on existing goal updates it like updateGoal", () => {
    // First create
    upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      goal_type: "pct",
      target_value: 20,
      enabled: true,
      updated_by: 1,
    });
    // Upsert again with different target
    upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      goal_type: "number",
      target_value: 500,
      enabled: true,
      updated_by: 1,
    });
    const goals = listGoals({ year: 2025 }).filter((g) => g.kpi_id === kpiA);
    expect(goals.length).toBe(1); // not duplicated
    expect(goals[0].goal_type).toBe("number");
    expect(goals[0].target_value).toBe(500);
  });
});
