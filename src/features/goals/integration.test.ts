import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MONTH_NUMBERS } from "@/features/metrics";
import { upsertEntry } from "@/features/metrics/server";
import { createKPI } from "@/features/catalog/server";
import { ensureSeedAdmin } from "@/features/auth/server";
import { getDb, resetDb } from "@/lib/db";
import {
  deleteGoal,
  listGoals,
  toggleGoal,
  updateGoal,
  upsertGoal,
} from ".";
import type { Direction, KpiGoalWithMeta, ReportingFrequency } from "@/lib/types";

describe("goals database integration", () => {
  let tmpDir: string;
  let dbPath: string;
  let originalDbPath: string | undefined;
  let categoryId: number;
  let kpiA: number;
  let kpiB: number;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-goals-test-"));
    dbPath = path.join(tmpDir, "test.db");
    originalDbPath = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = dbPath;
    resetDb();
    ensureSeedAdmin();
    const db = getDb();
    db.prepare("INSERT INTO categories (slug, name, sort_order) VALUES (?, ?, ?)").run(
      "test-category",
      "Test Category",
      0,
    );
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

  function makeKpi(
    slug: string,
    reportingFrequency: ReportingFrequency = "monthly",
    direction: Direction = "higher",
  ) {
    return createKPI({
      category_id: categoryId,
      slug,
      name: slug.replaceAll("-", " "),
      unit: "count",
      unit_type: "count",
      reporting_frequency: reportingFrequency,
      direction,
    });
  }

  function insertMonths(kpiId: number, year: number, months: number[], value: number) {
    for (const month of months) {
      upsertEntry({ kpi_id: kpiId, year, month, value, updated_by: 1 });
    }
  }

  function insertAnnual(kpiId: number, year: number, value: number) {
    upsertEntry({ kpi_id: kpiId, year, month: 0, value, updated_by: 1 });
  }

  function saveGoal(
    kpiId: number,
    targetYear = 2025,
    goal: { goal_type?: "pct" | "number"; target_value?: number } = {},
  ) {
    return upsertGoal({
      kpi_id: kpiId,
      target_year: targetYear,
      goal_type: goal.goal_type ?? "pct",
      target_value: goal.target_value ?? 20,
      enabled: true,
      updated_by: 1,
    });
  }

  function findGoal(kpiId: number, opts: { year?: number; throughMonth?: number } = {}): KpiGoalWithMeta {
    const goal = listGoals({ year: opts.year ?? 2025, throughMonth: opts.throughMonth }).find(
      (g) => g.kpi_id === kpiId,
    );
    expect(goal).toBeDefined();
    return goal!;
  }

  it("computes goals from a fixed prior-year baseline and preserves legacy aliases", () => {
    upsertEntry({ kpi_id: kpiA, year: 2024, month: 1, value: 100, updated_by: 1 });
    upsertEntry({ kpi_id: kpiA, year: 2025, month: 1, value: 90, updated_by: 1 });
    saveGoal(kpiA);

    const goal = findGoal(kpiA);
    expect(goal.full_year_value).toBe(90);
    expect(goal.full_year_target).toBe(120);
    expect(goal.full_year_progress_pct).toBe(75);
    expect(goal.current_value).toBe(90);
    expect(goal.goal_target).toBe(120);
    expect(goal.progress_pct).toBe(75);
  });

  it("uses month 0 for annual and flexible KPIs", () => {
    const annual = makeKpi("annual-goal-progress", "annual");
    const flexible = makeKpi("flexible-goal-progress", "flexible");
    insertAnnual(annual.id, 2024, 1000);
    insertAnnual(annual.id, 2025, 1100);
    insertAnnual(flexible.id, 2024, 500);
    insertAnnual(flexible.id, 2025, 600);
    saveGoal(annual.id, 2025, { goal_type: "number", target_value: 100 });
    saveGoal(flexible.id);

    const annualGoal = findGoal(annual.id, { throughMonth: 3 });
    expect(annualGoal.full_year_value).toBe(1100);
    expect(annualGoal.full_year_target).toBe(1100);
    expect(annualGoal.full_year_progress_pct).toBe(100);
    expect(annualGoal.ytd_value).toBe(1100);
    expect(annualGoal.ytd_target).toBe(1100);
    expect(annualGoal.ytd_progress_pct).toBe(100);

    const flexibleGoal = findGoal(flexible.id);
    expect(flexibleGoal.full_year_value).toBe(600);
    expect(flexibleGoal.full_year_target).toBe(600);
    expect(flexibleGoal.ytd_value).toBe(600);
  });

  it("separates monthly YTD pacing from full-year completion", () => {
    insertMonths(kpiA, 2024, [...MONTH_NUMBERS], 10);
    insertMonths(kpiA, 2025, [1, 2, 3], 15);
    saveGoal(kpiA);

    const goal = findGoal(kpiA, { throughMonth: 3 });
    expect(goal.ytd_value).toBe(45);
    expect(goal.ytd_target).toBe(36);
    expect(goal.ytd_progress_pct).toBe(100);
    expect(goal.full_year_value).toBe(45);
    expect(goal.full_year_target).toBe(144);
    expect(goal.full_year_progress_pct).toBe(31);
  });

  it("returns null targets when no baseline exists and null actuals when target-year data is missing", () => {
    upsertEntry({ kpi_id: kpiA, year: 2025, month: 1, value: 50, updated_by: 1 });
    saveGoal(kpiA);

    const noBaseline = findGoal(kpiA);
    expect(noBaseline.full_year_target).toBeNull();
    expect(noBaseline.full_year_progress_pct).toBeNull();
    expect(noBaseline.ytd_target).toBeNull();
    expect(noBaseline.ytd_progress_pct).toBeNull();
    expect(noBaseline.full_year_value).toBe(50);

    upsertEntry({ kpi_id: kpiB, year: 2024, month: 1, value: 100, updated_by: 1 });
    saveGoal(kpiB);
    const noTargetData = findGoal(kpiB, { throughMonth: 6 });
    expect(noTargetData.full_year_target).toBe(120);
    expect(noTargetData.full_year_value).toBeNull();
    expect(noTargetData.full_year_progress_pct).toBeNull();
    expect(noTargetData.ytd_value).toBeNull();
    expect(noTargetData.ytd_progress_pct).toBeNull();
  });

  it("inverts lower-is-better full-year progress and prorates lower-is-better YTD baselines", () => {
    const lower = makeKpi("lower-is-better", "monthly", "lower");
    insertMonths(lower.id, 2024, [...MONTH_NUMBERS], 100);
    saveGoal(lower.id, 2025, { target_value: -20 });
    insertMonths(lower.id, 2025, [1, 2, 3], 90);

    const goal = findGoal(lower.id, { throughMonth: 3 });
    expect(goal.full_year_target).toBe(960);
    expect(goal.full_year_value).toBe(270);
    expect(goal.full_year_progress_pct).toBe(100);
    expect(goal.ytd_target).toBe(240);
    expect(goal.ytd_value).toBe(270);
    expect(goal.ytd_progress_pct).toBe(50);
  });

  it("computes partial full-year progress for lower-is-better KPIs", () => {
    const lower = makeKpi("lower-partial-progress", "monthly", "lower");
    insertMonths(lower.id, 2024, [...MONTH_NUMBERS], 100);
    insertMonths(lower.id, 2025, [...MONTH_NUMBERS], 90);
    saveGoal(lower.id, 2025, { target_value: -20 });

    const goal = findGoal(lower.id);
    expect(goal.full_year_target).toBe(960);
    expect(goal.full_year_value).toBe(1080);
    expect(goal.full_year_progress_pct).toBe(50);
  });

  it("falls back to simple progress for positive lower-is-better targets", () => {
    const lower = makeKpi("lower-positive-goal", "monthly", "lower");
    insertMonths(lower.id, 2024, [...MONTH_NUMBERS], 100);
    insertMonths(lower.id, 2025, [...MONTH_NUMBERS], 120);
    saveGoal(lower.id, 2025, { target_value: 20 });

    const goal = findGoal(lower.id);
    expect(goal.full_year_target).toBe(1440);
    expect(goal.full_year_value).toBe(1440);
    expect(goal.full_year_progress_pct).toBe(100);
  });

  it("keeps full-year target and progress invariant when throughMonth changes", () => {
    insertMonths(kpiA, 2024, [...MONTH_NUMBERS], 10);
    insertMonths(kpiA, 2025, [1, 2, 3, 4, 5, 6], 12);
    saveGoal(kpiA);

    const march = findGoal(kpiA, { throughMonth: 3 });
    const june = findGoal(kpiA, { throughMonth: 6 });
    const december = findGoal(kpiA, { throughMonth: 12 });

    expect([march.full_year_target, june.full_year_target, december.full_year_target]).toEqual([
      144,
      144,
      144,
    ]);
    expect([march.full_year_value, june.full_year_value, december.full_year_value]).toEqual([
      72,
      72,
      72,
    ]);
    expect([march.full_year_progress_pct, june.full_year_progress_pct, december.full_year_progress_pct]).toEqual([
      50,
      50,
      50,
    ]);
    expect([march.ytd_target, june.ytd_target, december.ytd_target]).toEqual([36, 72, 144]);
    expect([march.ytd_value, june.ytd_value, december.ytd_value]).toEqual([36, 72, 72]);
    expect([march.ytd_progress_pct, june.ytd_progress_pct, december.ytd_progress_pct]).toEqual([
      100,
      100,
      50,
    ]);
  });

  it("filters goals by target year without leaking other years", () => {
    for (let year = 2023; year <= 2025; year++) {
      upsertEntry({ kpi_id: kpiA, year: year - 1, month: 1, value: 100, updated_by: 1 });
      upsertEntry({ kpi_id: kpiA, year, month: 1, value: 110, updated_by: 1 });
      saveGoal(kpiA, year);
    }

    expect(listGoals({ year: 2024 })).toMatchObject([{ target_year: 2024, kpi_id: kpiA }]);
    expect(listGoals({ year: 2025 })).toMatchObject([{ target_year: 2025, kpi_id: kpiA }]);
    expect(listGoals().map((g) => g.target_year).sort()).toEqual([2023, 2024, 2025]);

    saveGoal(kpiB, 2024);
    expect(listGoals({ year: 2025 }).map((g) => g.kpi_id)).toEqual([kpiA]);
    expect(listGoals({ year: 2024 }).map((g) => g.kpi_id).sort()).toEqual([kpiA, kpiB].sort());
  });

  it("distinguishes annual zero values from missing annual data", () => {
    const noData = makeKpi("annual-no-data", "annual");
    insertAnnual(noData.id, 2024, 1000);
    saveGoal(noData.id);
    const missing = findGoal(noData.id);
    expect(missing.full_year_target).toBe(1200);
    expect(missing.full_year_value).toBeNull();
    expect(missing.full_year_progress_pct).toBeNull();

    const zero = makeKpi("annual-zero", "annual");
    insertAnnual(zero.id, 2024, 100);
    insertAnnual(zero.id, 2025, 0);
    saveGoal(zero.id, 2025, { target_value: 50 });
    const zeroGoal = findGoal(zero.id);
    expect(zeroGoal.full_year_value).toBe(0);
    expect(zeroGoal.full_year_progress_pct).toBe(0);
  });

  it("updates, toggles, deletes, and upserts goals through feature mutations", () => {
    insertMonths(kpiA, 2024, [...MONTH_NUMBERS], 100);
    insertMonths(kpiA, 2025, [...MONTH_NUMBERS], 120);

    const created = saveGoal(kpiA);
    expect(findGoal(kpiA).full_year_progress_pct).toBe(100);

    updateGoal({ id: created.id, enabled: true, goal_type: "pct", target_value: 50 });
    expect(findGoal(kpiA).full_year_target).toBe(1800);
    expect(findGoal(kpiA).full_year_progress_pct).toBe(80);

    updateGoal({ id: created.id, enabled: true, goal_type: "number", target_value: 300, notes: "updated" });
    const updated = findGoal(kpiA);
    expect(updated.goal_type).toBe("number");
    expect(updated.target_value).toBe(300);
    expect(updated.notes).toBe("updated");
    expect(updated.full_year_target).toBe(1500);

    toggleGoal(created.id, false);
    expect(findGoal(kpiA).enabled).toBe(false);
    toggleGoal(created.id, true);
    expect(findGoal(kpiA).enabled).toBe(true);

    upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      goal_type: "number",
      target_value: 500,
      enabled: true,
      updated_by: 1,
    });
    const goals = listGoals({ year: 2025 }).filter((g) => g.kpi_id === kpiA);
    expect(goals).toHaveLength(1);
    expect(goals[0].target_value).toBe(500);

    expect(() => updateGoal({ id: 99999, enabled: true })).toThrow(/no row/);
    deleteGoal(created.id);
    expect(listGoals({ year: 2025 }).filter((g) => g.kpi_id === kpiA)).toHaveLength(0);
  });
});
