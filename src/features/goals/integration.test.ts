import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { StrategicAuditTable } from "@/components/StrategicAuditTable";
import { MONTH_NUMBERS } from "@/features/metrics";
import { upsertEntry } from "@/features/metrics/server";
import { createKPI } from "@/features/catalog/server";
import { ensureSeedAdmin } from "@/features/auth/server";
import { listStrategicAuditEvents } from "@/features/strategy/server";
import { getDb, resetDb } from "@/lib/db";
import { deleteGoal, listGoals, toggleGoal, updateGoal, upsertGoal } from ".";
import type {
  Direction,
  KpiGoalWithMeta,
  ReportingFrequency,
} from "@/lib/types";

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
    db.prepare(
      "INSERT INTO categories (slug, name, sort_order) VALUES (?, ?, ?)",
    ).run("test-category", "Test Category", 0);
    categoryId = Number(
      (db.prepare("SELECT id FROM categories LIMIT 1").get() as { id: number })
        .id,
    );
    db.prepare(
      `INSERT INTO kpis (category_id, slug, name, unit, unit_type, reporting_frequency, direction, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      categoryId,
      "kpi-a",
      "KPI A",
      "count",
      "count",
      "monthly",
      "higher",
      0,
    );
    db.prepare(
      `INSERT INTO kpis (category_id, slug, name, unit, unit_type, reporting_frequency, direction, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      categoryId,
      "kpi-b",
      "KPI B",
      "count",
      "count",
      "monthly",
      "higher",
      1,
    );
    kpiA = Number(
      (
        db.prepare("SELECT id FROM kpis WHERE slug = ?").get("kpi-a") as {
          id: number;
        }
      ).id,
    );
    kpiB = Number(
      (
        db.prepare("SELECT id FROM kpis WHERE slug = ?").get("kpi-b") as {
          id: number;
        }
      ).id,
    );
  });

  beforeEach(() => {
    const db = getDb();
    db.exec("DROP TRIGGER IF EXISTS reject_legacy_goal_audit;");
    db.exec("DELETE FROM entry_history;");
    db.exec("DELETE FROM strategic_audit_events;");
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

  function insertMonths(
    kpiId: number,
    year: number,
    months: number[],
    value: number,
  ) {
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
    goal: {
      baseline_year?: number;
      goal_type?: "pct" | "number";
      target_value?: number;
    } = {},
  ) {
    return upsertGoal({
      kpi_id: kpiId,
      target_year: targetYear,
      baseline_year: goal.baseline_year,
      goal_type: goal.goal_type ?? "pct",
      target_value: goal.target_value ?? 20,
      enabled: true,
      updated_by: 1,
    });
  }

  function findGoal(
    kpiId: number,
    opts: { year?: number; throughMonth?: number; asOfYear?: number } = {},
  ): KpiGoalWithMeta {
    const goal = listGoals({
      year: opts.year ?? 2025,
      throughMonth: opts.throughMonth,
      asOfYear: opts.asOfYear,
    }).find((g) => g.kpi_id === kpiId);
    expect(goal).toBeDefined();
    return goal!;
  }

  it("computes goals from a fixed prior-year baseline", () => {
    upsertEntry({
      kpi_id: kpiA,
      year: 2024,
      month: 1,
      value: 100,
      updated_by: 1,
    });
    upsertEntry({
      kpi_id: kpiA,
      year: 2025,
      month: 1,
      value: 90,
      updated_by: 1,
    });
    saveGoal(kpiA);

    const goal = findGoal(kpiA);
    expect(goal.full_year_value).toBe(90);
    expect(goal.full_year_target).toBe(120);
    expect(goal.full_year_progress_pct).toBe(75);
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

  it("keeps a multi-year target fixed to its explicit baseline", () => {
    const strategic = makeKpi("strategic-multi-year", "annual");
    insertAnnual(strategic.id, 2026, 20);
    saveGoal(strategic.id, 2029, {
      baseline_year: 2026,
      goal_type: "number",
      target_value: 3,
    });

    const goal = findGoal(strategic.id, {
      year: 2029,
      asOfYear: 2026,
    });
    expect(goal.baseline_year).toBe(2026);
    expect(goal.progress_year).toBe(2026);
    expect(goal.full_year_target).toBe(23);
    expect(goal.full_year_value).toBe(20);
    expect(goal.full_year_progress_pct).toBe(87);

    insertAnnual(strategic.id, 2027, 21);
    const later = findGoal(strategic.id, {
      year: 2029,
      asOfYear: 2027,
    });
    expect(later.baseline_year).toBe(2026);
    expect(later.full_year_target).toBe(23);
    expect(later.full_year_value).toBe(21);
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
    upsertEntry({
      kpi_id: kpiA,
      year: 2025,
      month: 1,
      value: 50,
      updated_by: 1,
    });
    saveGoal(kpiA);

    const noBaseline = findGoal(kpiA);
    expect(noBaseline.full_year_target).toBeNull();
    expect(noBaseline.full_year_progress_pct).toBeNull();
    expect(noBaseline.ytd_target).toBeNull();
    expect(noBaseline.ytd_progress_pct).toBeNull();
    expect(noBaseline.full_year_value).toBe(50);

    upsertEntry({
      kpi_id: kpiB,
      year: 2024,
      month: 1,
      value: 100,
      updated_by: 1,
    });
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

    expect([
      march.full_year_target,
      june.full_year_target,
      december.full_year_target,
    ]).toEqual([144, 144, 144]);
    expect([
      march.full_year_value,
      june.full_year_value,
      december.full_year_value,
    ]).toEqual([72, 72, 72]);
    expect([
      march.full_year_progress_pct,
      june.full_year_progress_pct,
      december.full_year_progress_pct,
    ]).toEqual([50, 50, 50]);
    expect([march.ytd_target, june.ytd_target, december.ytd_target]).toEqual([
      36, 72, 144,
    ]);
    expect([march.ytd_value, june.ytd_value, december.ytd_value]).toEqual([
      36, 72, 72,
    ]);
    expect([
      march.ytd_progress_pct,
      june.ytd_progress_pct,
      december.ytd_progress_pct,
    ]).toEqual([100, 100, 50]);
  });

  it("filters goals by target year without leaking other years", () => {
    for (let year = 2023; year <= 2025; year++) {
      upsertEntry({
        kpi_id: kpiA,
        year: year - 1,
        month: 1,
        value: 100,
        updated_by: 1,
      });
      upsertEntry({ kpi_id: kpiA, year, month: 1, value: 110, updated_by: 1 });
      saveGoal(kpiA, year);
    }

    expect(listGoals({ year: 2024 })).toMatchObject([
      { target_year: 2024, kpi_id: kpiA },
    ]);
    expect(listGoals({ year: 2025 })).toMatchObject([
      { target_year: 2025, kpi_id: kpiA },
    ]);
    expect(
      listGoals()
        .map((g) => g.target_year)
        .sort(),
    ).toEqual([2023, 2024, 2025]);

    saveGoal(kpiB, 2024);
    expect(listGoals({ year: 2025 }).map((g) => g.kpi_id)).toEqual([kpiA]);
    expect(
      listGoals({ year: 2024 })
        .map((g) => g.kpi_id)
        .sort(),
    ).toEqual([kpiA, kpiB].sort());
    expect(
      listGoals({ year: 2024, kpi_id: kpiB }).map((g) => g.kpi_id),
    ).toEqual([kpiB]);
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

    updateGoal({
      id: created.id,
      enabled: true,
      goal_type: "pct",
      target_value: 50,
    });
    expect(findGoal(kpiA).full_year_target).toBe(1800);
    expect(findGoal(kpiA).full_year_progress_pct).toBe(80);

    updateGoal({
      id: created.id,
      enabled: true,
      goal_type: "number",
      target_value: 300,
      notes: "updated",
    });
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
    expect(
      listGoals({ year: 2025 }).filter((g) => g.kpi_id === kpiA),
    ).toHaveLength(0);
  });

  it("records an immutable Legacy KPI Goal create snapshot with actor and historical labels", () => {
    const created = upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      baseline_year: 2024,
      goal_type: "pct",
      target_value: 20,
      enabled: true,
      notes: "Board baseline",
      updated_by: 1,
    });

    getDb().prepare("UPDATE kpis SET name = ? WHERE id = ?").run("Renamed KPI", kpiA);
    getDb()
      .prepare("UPDATE categories SET name = ? WHERE id = ?")
      .run("Renamed Priority", categoryId);

    const events = listStrategicAuditEvents({ entity_type: "kpi", entity_id: kpiA });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event_type: "create",
      entity_display_name: "KPI A — 2025 Legacy KPI Goal",
      parent_priority_name: "Test Category",
      parent_goal_name: null,
      previous_value: null,
      new_value: {
        id: created.id,
        kpi_id: kpiA,
        target_year: 2025,
        baseline_year: 2024,
        goal_type: "pct",
        target_value: 20,
        enabled: true,
        notes: "Board baseline",
        created_by: 1,
        updated_by: 1,
      },
      actor_id: 1,
      actor_email_snapshot: "kerry@easternstate.org",
      source_reference: "Legacy KPI goal administration",
    });

    const html = renderToStaticMarkup(StrategicAuditTable({ events }));
    expect(html).toContain("KPI A — 2025 Legacy KPI Goal");
    expect(html).toContain("Test Category");
    expect(html).toContain("kerry@easternstate.org");
    expect(html).not.toContain("Renamed KPI");
    expect(html).not.toContain("Renamed Priority");

    getDb().prepare("UPDATE kpis SET name = ? WHERE id = ?").run("KPI A", kpiA);
    getDb()
      .prepare("UPDATE categories SET name = ? WHERE id = ?")
      .run("Test Category", categoryId);
  });

  it("records actorless Legacy KPI Goal mutations as System events", () => {
    const created = upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      baseline_year: 2024,
      goal_type: "pct",
      target_value: 20,
      enabled: true,
    });

    const [event] = listStrategicAuditEvents({ entity_type: "kpi", entity_id: kpiA });
    expect(event).toMatchObject({
      event_type: "create",
      entity_display_name: "KPI A — 2025 Legacy KPI Goal",
      actor_id: null,
      actor_email_snapshot: null,
      new_value: { id: created.id, created_by: null, updated_by: null },
    });
    expect(renderToStaticMarkup(StrategicAuditTable({ events: [event] }))).toContain(
      "System",
    );
  });

  it("records before and after snapshots when an existing Legacy KPI Goal is upserted", () => {
    const existing = upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      baseline_year: 2023,
      goal_type: "pct",
      target_value: 10,
      enabled: false,
      notes: "Original",
    });

    upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      baseline_year: 2024,
      goal_type: "number",
      target_value: 30,
      enabled: true,
      notes: "Revised",
      updated_by: 1,
    });

    const [event] = listStrategicAuditEvents({ entity_type: "kpi", entity_id: kpiA });
    expect(event).toMatchObject({
      event_type: "update",
      previous_value: {
        id: existing.id,
        baseline_year: 2023,
        goal_type: "pct",
        target_value: 10,
        enabled: false,
        notes: "Original",
        updated_by: null,
      },
      new_value: {
        id: existing.id,
        baseline_year: 2024,
        goal_type: "number",
        target_value: 30,
        enabled: true,
        notes: "Revised",
        updated_by: 1,
      },
      actor_id: 1,
      actor_email_snapshot: "kerry@easternstate.org",
    });
  });

  it("does not add an update event for a semantic Legacy KPI Goal no-op", () => {
    const created = upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      baseline_year: 2024,
      goal_type: "pct",
      target_value: 20,
      enabled: true,
      notes: "Unchanged",
      updated_by: 1,
    });

    const returned = upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      baseline_year: 2024,
      goal_type: "pct",
      target_value: 20,
      enabled: true,
      notes: "Unchanged",
      updated_by: 1,
    });
    updateGoal({ id: created.id, enabled: true, updated_by: 1 });

    expect(returned).toEqual(created);
    expect(
      listStrategicAuditEvents({ entity_type: "kpi", entity_id: kpiA }).map(
        (event) => event.event_type,
      ),
    ).toEqual(["create"]);
  });

  it("records before and after snapshots for a direct Legacy KPI Goal update", () => {
    const existing = upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      baseline_year: 2024,
      goal_type: "pct",
      target_value: 20,
      enabled: true,
      notes: null,
    });

    updateGoal({
      id: existing.id,
      goal_type: "number",
      target_value: 55,
      notes: "Approved revision",
      updated_by: 1,
    });

    const [event] = listStrategicAuditEvents({ entity_type: "kpi", entity_id: kpiA });
    expect(event).toMatchObject({
      event_type: "update",
      entity_display_name: "KPI A — 2025 Legacy KPI Goal",
      parent_priority_name: "Test Category",
      previous_value: {
        id: existing.id,
        goal_type: "pct",
        target_value: 20,
        notes: null,
        updated_by: null,
      },
      new_value: {
        id: existing.id,
        goal_type: "number",
        target_value: 55,
        notes: "Approved revision",
        updated_by: 1,
      },
      actor_id: 1,
      actor_email_snapshot: "kerry@easternstate.org",
    });
  });

  it("records a Legacy KPI Goal toggle as an attributed update", () => {
    const existing = upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      baseline_year: 2024,
      goal_type: "pct",
      target_value: 20,
      enabled: true,
    });

    toggleGoal(existing.id, false, 1);

    const [event] = listStrategicAuditEvents({ entity_type: "kpi", entity_id: kpiA });
    expect(event).toMatchObject({
      event_type: "update",
      previous_value: { id: existing.id, enabled: true, updated_by: null },
      new_value: { id: existing.id, enabled: false, updated_by: 1 },
      actor_id: 1,
      actor_email_snapshot: "kerry@easternstate.org",
    });
  });

  it("records a Legacy KPI Goal tombstone before deletion", () => {
    const existing = upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      baseline_year: 2024,
      goal_type: "number",
      target_value: 25,
      enabled: false,
      notes: "Retired target",
    });

    deleteGoal(existing.id, 1);

    expect(listGoals({ year: 2025, kpi_id: kpiA })).toHaveLength(0);
    const [event] = listStrategicAuditEvents({ entity_type: "kpi", entity_id: kpiA });
    expect(event).toMatchObject({
      event_type: "delete",
      entity_display_name: "KPI A — 2025 Legacy KPI Goal",
      parent_priority_name: "Test Category",
      previous_value: {
        id: existing.id,
        kpi_id: kpiA,
        target_year: 2025,
        baseline_year: 2024,
        goal_type: "number",
        target_value: 25,
        enabled: false,
        notes: "Retired target",
      },
      new_value: null,
      actor_id: 1,
      actor_email_snapshot: "kerry@easternstate.org",
      source_reference: "Legacy KPI goal administration",
    });
  });

  it("rolls back a Legacy KPI Goal create when its audit insert fails", () => {
    getDb().exec(`
      CREATE TRIGGER reject_legacy_goal_audit
      BEFORE INSERT ON strategic_audit_events
      WHEN NEW.source_reference = 'Legacy KPI goal administration'
      BEGIN
        SELECT RAISE(ABORT, 'reject legacy goal audit');
      END;
    `);

    expect(() =>
      upsertGoal({
        kpi_id: kpiA,
        target_year: 2025,
        baseline_year: 2024,
        goal_type: "pct",
        target_value: 20,
        enabled: true,
        updated_by: 1,
      }),
    ).toThrow(/reject legacy goal audit/);

    expect(listGoals({ year: 2025, kpi_id: kpiA })).toHaveLength(0);
    expect(listStrategicAuditEvents({ entity_type: "kpi", entity_id: kpiA })).toEqual([]);
  });

  it("rolls back a Legacy KPI Goal update when its audit insert fails", () => {
    const existing = upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      baseline_year: 2024,
      goal_type: "pct",
      target_value: 20,
      enabled: true,
      notes: "Original",
    });
    getDb().exec("DELETE FROM strategic_audit_events;");
    getDb().exec(`
      CREATE TRIGGER reject_legacy_goal_audit
      BEFORE INSERT ON strategic_audit_events
      WHEN NEW.source_reference = 'Legacy KPI goal administration'
      BEGIN
        SELECT RAISE(ABORT, 'reject legacy goal audit');
      END;
    `);

    expect(() =>
      updateGoal({
        id: existing.id,
        target_value: 99,
        notes: "Should roll back",
        updated_by: 1,
      }),
    ).toThrow(/reject legacy goal audit/);

    expect(listGoals({ year: 2025, kpi_id: kpiA })).toMatchObject([
      { id: existing.id, target_value: 20, notes: "Original", updated_by: null },
    ]);
    expect(listStrategicAuditEvents({ entity_type: "kpi", entity_id: kpiA })).toEqual([]);
  });

  it("rolls back a Legacy KPI Goal delete when its tombstone insert fails", () => {
    const existing = upsertGoal({
      kpi_id: kpiA,
      target_year: 2025,
      baseline_year: 2024,
      goal_type: "pct",
      target_value: 20,
      enabled: true,
    });
    getDb().exec("DELETE FROM strategic_audit_events;");
    getDb().exec(`
      CREATE TRIGGER reject_legacy_goal_audit
      BEFORE INSERT ON strategic_audit_events
      WHEN NEW.source_reference = 'Legacy KPI goal administration'
      BEGIN
        SELECT RAISE(ABORT, 'reject legacy goal audit');
      END;
    `);

    expect(() => deleteGoal(existing.id, 1)).toThrow(/reject legacy goal audit/);

    expect(listGoals({ year: 2025, kpi_id: kpiA })).toMatchObject([
      { id: existing.id, target_value: 20 },
    ]);
    expect(listStrategicAuditEvents({ entity_type: "kpi", entity_id: kpiA })).toEqual([]);
  });
});
