import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listStrategicAuditEvents, listStrategicGoals } from "@/features/strategy/server";
import { getDb, resetDb } from "@/lib/db";
import {
  archiveKPI,
  createCategory,
  createKPI,
  isStrategicCategory,
  isStrategicKPI,
  listCategories,
  listKPIs,
  restoreCategory,
  restoreKPI,
  retireOrDeleteCategory,
  retireOrDeleteKPI,
} from "./server";

function seedStrategicCatalog() {
  const db = getDb();
  const actorId = Number(
    db
      .prepare(
        `INSERT INTO users (email, name, password_hash, role)
         VALUES ('catalog-admin@example.org', 'Catalog Admin', 'hash', 'admin')`,
      )
      .run().lastInsertRowid,
  );
  const category = createCategory({
    slug: "visitor-experience",
    name: "Visitor Experience",
    sort_order: 1,
  });
  const kpi = createKPI({
    category_id: category.id,
    slug: "visitor-upgrades",
    name: "Visitor upgrades",
    unit: "projects",
    reporting_frequency: "annual",
  });
  const goalId = Number(
    db
      .prepare(
        `INSERT INTO strategic_goals (
           priority_id, slug, name, plan_start_year, plan_end_year,
           configuration_status, created_by, updated_by
         ) VALUES (?, 'amenity-goal', 'Amenity goal', 2025, 2029,
                   'active', ?, ?)`,
      )
      .run(category.id, actorId, actorId).lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO goal_kpis (
       goal_id, kpi_id, effective_from_year, effective_to_year,
       created_by, updated_by
     ) VALUES (?, ?, 2025, 2029, ?, ?)`,
  ).run(goalId, kpi.id, actorId, actorId);
  db.prepare(
    `INSERT INTO kpi_measurement_configs (
       kpi_id, effective_from_year, effective_to_year, measurement_type,
       unit, reporting_frequency, aggregation_method, board_level_status,
       configuration_status, created_by, updated_by
     ) VALUES (?, 2025, 2029, 'count', 'projects', 'annual', 'none',
               'not_reported', 'active', ?, ?)`,
  ).run(kpi.id, actorId, actorId);
  return { actorId, category, kpi, goalId };
}

describe("schema-10 strategic catalog lifecycle", () => {
  let tmpDir: string;
  let originalDatabasePath: string | undefined;
  let databaseIndex = 0;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-catalog-lifecycle-"));
    originalDatabasePath = process.env.DATABASE_PATH;
  });

  beforeEach(() => {
    resetDb();
    process.env.DATABASE_PATH = path.join(
      tmpDir,
      `catalog-${databaseIndex++}.db`,
    );
  });

  afterAll(() => {
    resetDb();
    if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDatabasePath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("archives and restores configured KPIs and priorities with audit snapshots", () => {
    const { actorId, category, kpi, goalId } = seedStrategicCatalog();
    expect(isStrategicKPI(kpi.id)).toBe(true);
    expect(isStrategicCategory(category.id)).toBe(true);

    expect(retireOrDeleteKPI(kpi.id, actorId)).toBe("archived");
    expect(getDb().prepare("SELECT id FROM kpis WHERE id = ?").get(kpi.id)).toEqual({
      id: kpi.id,
    });
    expect(listKPIs()).toEqual([]);
    expect(
      listKPIs({ includeInactive: true, includeArchived: true })[0],
    ).toMatchObject({ id: kpi.id, archived_at: expect.any(String), is_active: 0 });
    expect(listStrategicGoals({ year: 2026 })[0]?.members).toEqual([]);
    expect(
      listStrategicGoals({ year: 2026, includeArchived: true })[0]?.members,
    ).toHaveLength(1);

    restoreKPI(kpi.id, actorId);
    expect(listKPIs()[0]).toMatchObject({
      id: kpi.id,
      archived_at: null,
      is_active: 1,
    });
    expect(listStrategicGoals({ year: 2026 })[0]?.members).toHaveLength(1);

    expect(retireOrDeleteCategory(category.id, actorId)).toBe("archived");
    expect(listCategories()).toEqual([]);
    expect(listKPIs()).toEqual([]);
    expect(listStrategicGoals({ year: 2026 })).toEqual([]);
    expect(
      listCategories({ includeArchived: true })[0],
    ).toMatchObject({ id: category.id, archived_at: expect.any(String) });

    restoreCategory(category.id, actorId);
    expect(listCategories()[0]).toMatchObject({
      id: category.id,
      archived_at: null,
    });
    expect(listKPIs()).toHaveLength(1);
    expect(listStrategicGoals({ year: 2026 })[0]?.id).toBe(goalId);

    const events = listStrategicAuditEvents({ limit: 20 });
    expect(
      events
        .filter((event) => event.entity_type === "kpi")
        .map((event) => event.event_type),
    ).toEqual(expect.arrayContaining(["archive", "restore"]));
    expect(
      events
        .filter((event) => event.entity_type === "strategic_priority")
        .map((event) => event.event_type),
    ).toEqual(expect.arrayContaining(["archive", "restore"]));
    for (const event of events.filter(
      (item) => item.entity_type === "kpi" || item.entity_type === "strategic_priority",
    )) {
      expect(event.entity_display_name).toEqual(expect.any(String));
      expect(event.parent_priority_name).toBe("Visitor Experience");
      expect(event.previous_value).not.toBeNull();
      expect(event.new_value).not.toBeNull();
      expect(event.actor_email_snapshot).toBe("catalog-admin@example.org");
    }
  });

  it("preserves hard deletion for unconfigured legacy catalog rows", () => {
    const category = createCategory({ slug: "legacy", name: "Legacy" });
    const kpi = createKPI({
      category_id: category.id,
      slug: "legacy-count",
      name: "Legacy count",
    });

    expect(isStrategicKPI(kpi.id)).toBe(false);
    expect(retireOrDeleteKPI(kpi.id)).toBe("deleted");
    expect(getDb().prepare("SELECT id FROM kpis WHERE id = ?").get(kpi.id)).toBeUndefined();
    expect(isStrategicCategory(category.id)).toBe(false);
    expect(retireOrDeleteCategory(category.id)).toBe("deleted");
    expect(
      getDb().prepare("SELECT id FROM categories WHERE id = ?").get(category.id),
    ).toBeUndefined();
    expect(listStrategicAuditEvents()).toEqual([]);
  });

  it("restores the KPI active flag captured before archival", () => {
    const { actorId, kpi } = seedStrategicCatalog();
    getDb().prepare("UPDATE kpis SET is_active = 0 WHERE id = ?").run(kpi.id);

    archiveKPI(kpi.id, actorId);
    restoreKPI(kpi.id, actorId);

    expect(
      listKPIs({ includeInactive: true, includeArchived: true })[0],
    ).toMatchObject({ id: kpi.id, archived_at: null, is_active: 0 });
    expect(listKPIs()).toEqual([]);
  });
});
