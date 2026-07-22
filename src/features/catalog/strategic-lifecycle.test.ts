import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { StrategicAuditTable } from "@/components/StrategicAuditTable";
import {
  getMeasurementConfigRecord,
  listStrategicAuditEvents,
  listStrategicGoals,
} from "@/features/strategy/server";
import { getDb, resetDb } from "@/lib/db";
import { bootstrapTestInstallation } from "@/features/installation/test-fixture";
import {
  archiveKPI,
  countCategoryDependents,
  createCategory,
  createKPI,
  createStrategicMeasure,
  DependentEntriesError,
  getCategory,
  getCategoryBySlug,
  getKPI,
  isStrategicCategory,
  isStrategicKPI,
  listCategories,
  listKPIs,
  restoreCategory,
  restoreKPI,
  retireOrDeleteCategory,
  retireOrDeleteKPI,
  updateCategory,
  updateKPI,
} from "./server";

/** Supports the create catalog actor test scenario. */
function createCatalogActor(): number {
  return Number(
    getDb()
      .prepare(
        `INSERT INTO users (email, name, password_hash, role)
         VALUES ('catalog-admin@example.org', 'Catalog Admin', 'hash', 'admin')`,
      )
      .run().lastInsertRowid,
  );
}

/** Supports the seed strategic catalog test scenario. */
function seedStrategicCatalog() {
  const db = getDb();
  const actorId = createCatalogActor();
  const category = createCategory(
    {
      slug: "visitor-experience",
      name: "Visitor Experience",
      sort_order: 1,
    },
    actorId,
  );
  const kpi = createKPI(
    {
      category_id: category.id,
      slug: "visitor-upgrades",
      name: "Visitor upgrades",
      unit: "projects",
      reporting_frequency: "annual",
    },
    actorId,
  );
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
    bootstrapTestInstallation();
  });

  afterAll(() => {
    resetDb();
    if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDatabasePath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("keeps archived-plan priorities, measures, and goals out of active-plan reads", () => {
    const db = getDb();
    const activePlan = db
      .prepare(
        "SELECT organization_id FROM strategic_plans WHERE status = 'active'",
      )
      .get() as { organization_id: number };
    const archivedPlanId = Number(
      db
        .prepare(
          `INSERT INTO strategic_plans (
             organization_id, slug, name, start_year, end_year, status, archived_at
           ) VALUES (?, 'archived-plan', 'Archived plan', 2020, 2024,
                     'archived', datetime('now'))`,
        )
        .run(activePlan.organization_id).lastInsertRowid,
    );
    const categoryId = Number(
      db
        .prepare(
          `INSERT INTO categories (plan_id, slug, name)
           VALUES (?, 'archived-plan-priority', 'Archived plan priority')`,
        )
        .run(archivedPlanId).lastInsertRowid,
    );
    const kpiId = Number(
      db
        .prepare(
          `INSERT INTO kpis (
             category_id, slug, name, unit_type, reporting_frequency, direction
           ) VALUES (?, 'archived-plan-kpi', 'Archived plan KPI', 'count',
                     'annual', 'higher')`,
        )
        .run(categoryId).lastInsertRowid,
    );
    db.prepare(
      `INSERT INTO strategic_goals (
         priority_id, slug, name, plan_start_year, plan_end_year,
         configuration_status
       ) VALUES (?, 'archived-plan-goal', 'Archived plan goal', 2020, 2029,
                 'active')`,
    ).run(categoryId);

    expect(listCategories({ includeArchived: true })).toEqual([]);
    expect(getCategory(categoryId, { includeArchived: true })).toBeNull();
    expect(
      getCategoryBySlug("archived-plan-priority", { includeArchived: true }),
    ).toBeNull();
    expect(listKPIs({ includeInactive: true, includeArchived: true })).toEqual([]);
    expect(getKPI(kpiId, { includeArchived: true })).toBeNull();
    expect(
      listStrategicGoals({ year: 2025, includeArchived: true }),
    ).toEqual([]);
  });

  it("creates a runtime measure with its goal membership and configuration atomically", () => {
    const db = getDb();
    const actorId = createCatalogActor();
    const category = createCategory(
      { slug: "learning", name: "Learning", sort_order: 1 },
      actorId,
    );
    const goalId = Number(
      db.prepare(
        `INSERT INTO strategic_goals (
           priority_id, slug, name, plan_start_year, plan_end_year,
           configuration_status, created_by, updated_by
         ) VALUES (?, 'learning-goal', 'Learning goal', 2025, 2029,
                   'active', ?, ?)`,
      ).run(category.id, actorId, actorId).lastInsertRowid,
    );

    const created = createStrategicMeasure(
      {
        goal_id: goalId,
        reporting_year: 2026,
        slug: "new-learning-measure",
        name: "New learning measure",
        unit: "people",
        measurement_type: "count",
        reporting_frequency: "annual",
        direction: "higher",
        description: null,
      },
      actorId,
    );

    expect(created.kpi.category_id).toBe(category.id);
    expect(created.membership).toMatchObject({
      goal_id: goalId,
      kpi_id: created.kpi.id,
      effective_from_year: 2026,
      effective_to_year: 2029,
    });
    expect(getMeasurementConfigRecord(created.configuration.id)).toMatchObject({
      kpi_id: created.kpi.id,
      measurement_type: "count",
      reporting_frequency: "annual",
      configuration_status: "draft",
    });
    expect(listStrategicGoals({ year: 2026 })[0]?.members[0]).toMatchObject({
      kpi_id: created.kpi.id,
      configuration: { id: created.configuration.id },
    });
    expect(
      listStrategicAuditEvents().filter(
        (event) => event.entity_display_name.includes("New learning measure"),
      ).map((event) => event.entity_type),
    ).toEqual(expect.arrayContaining(["kpi", "goal_membership", "measurement_config"]));
  });

  it("rolls back the catalog row when strategic setup validation fails", () => {
    const db = getDb();
    const actorId = createCatalogActor();
    const category = createCategory(
      { slug: "rollback", name: "Rollback", sort_order: 1 },
      actorId,
    );
    const goalId = Number(
      db.prepare(
        `INSERT INTO strategic_goals (
           priority_id, slug, name, plan_start_year, plan_end_year,
           configuration_status, created_by, updated_by
         ) VALUES (?, 'rollback-goal', 'Rollback goal', 2025, 2029,
                   'active', ?, ?)`,
      ).run(category.id, actorId, actorId).lastInsertRowid,
    );

    expect(() =>
      createStrategicMeasure(
        {
          goal_id: goalId,
          reporting_year: 2026,
          slug: "invalid-strategic-measure",
          name: "Invalid strategic measure",
          unit: "",
          measurement_type: "count",
          reporting_frequency: "annual",
          direction: "higher",
          description: null,
        },
        actorId,
      ),
    ).toThrowError(/invalid measurement configuration/i);
    expect(
      db.prepare("SELECT id FROM kpis WHERE slug = 'invalid-strategic-measure'").get(),
    ).toBeUndefined();
    expect(
      db.prepare("SELECT id FROM goal_kpis WHERE goal_id = ?").get(goalId),
    ).toBeUndefined();
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
      (item) =>
        (item.entity_type === "kpi" ||
          item.entity_type === "strategic_priority") &&
        (item.event_type === "archive" || item.event_type === "restore"),
    )) {
      expect(event.entity_display_name).toEqual(expect.any(String));
      expect(event.parent_priority_name).toBe("Visitor Experience");
      expect(event.previous_value).not.toBeNull();
      expect(event.new_value).not.toBeNull();
      expect(event.actor_email_snapshot).toBe("catalog-admin@example.org");
    }
  });

  it("records and renders immutable category and KPI create/update snapshots", () => {
    const actorId = createCatalogActor();
    const category = createCategory(
      {
        slug: "catalog-audit-priority",
        name: "Original catalog priority",
        description: "Original priority description",
        sort_order: 4,
      },
      actorId,
    );
    const kpi = createKPI(
      {
        category_id: category.id,
        slug: "catalog-audit-kpi",
        name: "Original catalog KPI",
        unit: "visitors",
        unit_type: "attendance",
        reporting_frequency: "annual",
        direction: "higher",
      },
      actorId,
    );

    updateCategory(
      category.id,
      {
        name: "Renamed catalog priority",
        description: "Updated priority description",
      },
      actorId,
    );
    updateKPI(
      kpi.id,
      {
        name: "Renamed catalog KPI",
        direction: "neutral",
      },
      actorId,
    );

    const categoryEvents = listStrategicAuditEvents({
      entity_type: "strategic_priority",
      entity_id: category.id,
    });
    expect(categoryEvents.map((event) => event.event_type)).toEqual([
      "update",
      "create",
    ]);
    expect(categoryEvents[0]).toMatchObject({
      entity_display_name: "Renamed catalog priority",
      parent_priority_name: "Renamed catalog priority",
      previous_value: {
        id: category.id,
        slug: "catalog-audit-priority",
        name: "Original catalog priority",
        description: "Original priority description",
      },
      new_value: {
        id: category.id,
        slug: "catalog-audit-priority",
        name: "Renamed catalog priority",
        description: "Updated priority description",
      },
      actor_email_snapshot: "catalog-admin@example.org",
    });
    expect(categoryEvents[1]).toMatchObject({
      entity_display_name: "Original catalog priority",
      previous_value: null,
      new_value: {
        id: category.id,
        name: "Original catalog priority",
      },
      actor_email_snapshot: "catalog-admin@example.org",
    });

    const kpiEvents = listStrategicAuditEvents({
      entity_type: "kpi",
      entity_id: kpi.id,
    });
    expect(kpiEvents.map((event) => event.event_type)).toEqual([
      "update",
      "create",
    ]);
    expect(kpiEvents[0]).toMatchObject({
      entity_display_name: "Renamed catalog KPI",
      parent_priority_name: "Renamed catalog priority",
      previous_value: {
        id: kpi.id,
        slug: "catalog-audit-kpi",
        name: "Original catalog KPI",
        direction: "higher",
      },
      new_value: {
        id: kpi.id,
        slug: "catalog-audit-kpi",
        name: "Renamed catalog KPI",
        direction: "neutral",
      },
      actor_email_snapshot: "catalog-admin@example.org",
    });
    expect(kpiEvents[1]).toMatchObject({
      entity_display_name: "Original catalog KPI",
      parent_priority_name: "Original catalog priority",
      previous_value: null,
      new_value: {
        id: kpi.id,
        name: "Original catalog KPI",
      },
      actor_email_snapshot: "catalog-admin@example.org",
    });

    const html = renderToStaticMarkup(
      StrategicAuditTable({ events: [...categoryEvents, ...kpiEvents] }),
    );
    expect(html).toContain("Original catalog priority");
    expect(html).toContain("Renamed catalog priority");
    expect(html).toContain("Original catalog KPI");
    expect(html).toContain("Renamed catalog KPI");
    expect(html).toContain("catalog-admin@example.org");
  });

  it("rolls back a category create when its audit insert fails", () => {
    const actorId = createCatalogActor();
    getDb().exec(
      `CREATE TRIGGER reject_category_create_audit
       BEFORE INSERT ON strategic_audit_events
       WHEN NEW.entity_type = 'strategic_priority' AND NEW.event_type = 'create'
       BEGIN
         SELECT RAISE(ABORT, 'forced category create audit failure');
       END`,
    );

    expect(() =>
      createCategory(
        { slug: "rejected-category-create", name: "Rejected category create" },
        actorId,
      ),
    ).toThrow(/forced category create audit failure/);
    expect(
      getCategoryBySlug("rejected-category-create", { includeArchived: true }),
    ).toBeNull();
    expect(listStrategicAuditEvents()).toEqual([]);
  });

  it("rolls back a category update when its audit insert fails", () => {
    const actorId = createCatalogActor();
    const category = createCategory(
      { slug: "rejected-category-update", name: "Original category name" },
      actorId,
    );
    getDb().exec(
      `CREATE TRIGGER reject_category_update_audit
       BEFORE INSERT ON strategic_audit_events
       WHEN NEW.entity_type = 'strategic_priority' AND NEW.event_type = 'update'
       BEGIN
         SELECT RAISE(ABORT, 'forced category update audit failure');
       END`,
    );

    expect(() =>
      updateCategory(category.id, { name: "Rejected category name" }, actorId),
    ).toThrow(/forced category update audit failure/);
    expect(getCategory(category.id, { includeArchived: true })).toMatchObject({
      name: "Original category name",
    });
    expect(
      listStrategicAuditEvents({
        entity_type: "strategic_priority",
        entity_id: category.id,
      }).map((event) => event.event_type),
    ).toEqual(["create"]);
  });

  it("rolls back KPI create and update writes when their audit inserts fail", () => {
    const actorId = createCatalogActor();
    const category = createCategory(
      { slug: "kpi-rollback-priority", name: "KPI rollback priority" },
      actorId,
    );
    getDb().exec(
      `CREATE TRIGGER reject_kpi_create_audit
       BEFORE INSERT ON strategic_audit_events
       WHEN NEW.entity_type = 'kpi' AND NEW.event_type = 'create'
       BEGIN
         SELECT RAISE(ABORT, 'forced KPI create audit failure');
       END`,
    );
    expect(() =>
      createKPI(
        {
          category_id: category.id,
          slug: "rejected-kpi-create",
          name: "Rejected KPI create",
        },
        actorId,
      ),
    ).toThrow(/forced KPI create audit failure/);
    expect(
      getDb()
        .prepare("SELECT id FROM kpis WHERE slug = ?")
        .get("rejected-kpi-create"),
    ).toBeUndefined();
    getDb().exec("DROP TRIGGER reject_kpi_create_audit");

    const kpi = createKPI(
      {
        category_id: category.id,
        slug: "rejected-kpi-update",
        name: "Original KPI name",
      },
      actorId,
    );
    getDb().exec(
      `CREATE TRIGGER reject_kpi_update_audit
       BEFORE INSERT ON strategic_audit_events
       WHEN NEW.entity_type = 'kpi' AND NEW.event_type = 'update'
       BEGIN
         SELECT RAISE(ABORT, 'forced KPI update audit failure');
       END`,
    );
    expect(() =>
      updateKPI(kpi.id, { name: "Rejected KPI name" }, actorId),
    ).toThrow(/forced KPI update audit failure/);
    expect(getKPI(kpi.id, { includeArchived: true })).toMatchObject({
      name: "Original KPI name",
    });
    expect(
      listStrategicAuditEvents({
        entity_type: "kpi",
        entity_id: kpi.id,
      }).map((event) => event.event_type),
    ).toEqual(["create"]);
  });

  it("preserves and renders an immutable KPI delete snapshot after hard deletion", () => {
    const actorId = createCatalogActor();
    const category = createCategory({
      slug: "legacy",
      name: "Legacy Priority",
    });
    const kpi = createKPI({
      category_id: category.id,
      slug: "legacy-count",
      name: "Legacy count",
    });

    expect(isStrategicKPI(kpi.id)).toBe(false);
    expect(retireOrDeleteKPI(kpi.id, actorId)).toBe("deleted");
    expect(getKPI(kpi.id, { includeArchived: true })).toBeNull();

    updateCategory(category.id, { name: "Renamed live priority" });
    const events = listStrategicAuditEvents({
      entity_type: "kpi",
      entity_id: kpi.id,
    });
    const deleteEvent = events.find((event) => event.event_type === "delete");
    expect(deleteEvent).toMatchObject({
      entity_type: "kpi",
      entity_id: kpi.id,
      event_type: "delete",
      entity_display_name: "Legacy count",
      parent_priority_name: "Legacy Priority",
      parent_goal_name: null,
      previous_value: {
        id: kpi.id,
        category_id: category.id,
        slug: "legacy-count",
        name: "Legacy count",
      },
      new_value: null,
      actor_email_snapshot: "catalog-admin@example.org",
    });

    const html = renderToStaticMarkup(StrategicAuditTable({ events }));
    expect(html).toContain("Legacy count");
    expect(html).toContain("Legacy Priority");
    expect(html).toContain("Delete");
    expect(html).toContain("catalog-admin@example.org");
    expect(html).not.toContain("Renamed live priority");
  });

  it("snapshots every descendant when a parent KPI hard delete cascades", () => {
    const actorId = createCatalogActor();
    const parentCategory = createCategory({
      slug: "direct-parent-category",
      name: "Direct Parent Category",
    });
    const childCategory = createCategory({
      slug: "direct-child-category",
      name: "Direct Child Category",
    });
    const parent = createKPI({
      category_id: parentCategory.id,
      slug: "direct-parent-kpi",
      name: "Direct parent KPI",
    });
    const child = createKPI({
      category_id: childCategory.id,
      parent_id: parent.id,
      slug: "direct-child-kpi",
      name: "Direct child KPI",
    });

    expect(retireOrDeleteKPI(parent.id, actorId)).toBe("deleted");
    expect(getKPI(parent.id, { includeArchived: true })).toBeNull();
    expect(getKPI(child.id, { includeArchived: true })).toBeNull();
    const deleteEvents = listStrategicAuditEvents({ limit: 30 }).filter(
      (event) =>
        event.entity_type === "kpi" &&
        event.event_type === "delete" &&
        (event.entity_id === parent.id || event.entity_id === child.id),
    );
    expect(deleteEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity_id: parent.id,
          entity_display_name: "Direct parent KPI",
          parent_priority_name: "Direct Parent Category",
        }),
        expect.objectContaining({
          entity_id: child.id,
          entity_display_name: "Direct child KPI",
          parent_priority_name: "Direct Child Category",
        }),
      ]),
    );
    expect(deleteEvents).toHaveLength(2);
  });

  it("does not hard-delete a parent KPI with a strategic descendant", () => {
    const actorId = createCatalogActor();
    const category = createCategory({
      slug: "strategic-direct-tree",
      name: "Strategic Direct Tree",
    });
    const parent = createKPI({
      category_id: category.id,
      slug: "strategic-direct-parent",
      name: "Strategic direct parent",
    });
    const child = createKPI({
      category_id: category.id,
      parent_id: parent.id,
      slug: "strategic-direct-child",
      name: "Strategic direct child",
    });
    getDb()
      .prepare(
        `INSERT INTO kpi_measurement_configs (
           kpi_id, effective_from_year, effective_to_year, measurement_type,
           unit, reporting_frequency, aggregation_method, board_level_status,
           configuration_status, created_by, updated_by
         ) VALUES (?, 2025, 2029, 'count', 'items', 'annual', 'none',
                   'not_reported', 'active', ?, ?)`,
      )
      .run(child.id, actorId, actorId);

    expect(isStrategicKPI(parent.id)).toBe(true);
    expect(retireOrDeleteKPI(parent.id, actorId)).toBe("archived");
    expect(getKPI(parent.id, { includeArchived: true })?.archived_at).not.toBeNull();
    expect(getKPI(child.id, { includeArchived: true })).not.toBeNull();
  });

  it("preserves and renders an immutable priority snapshot after category hard deletion", () => {
    const actorId = createCatalogActor();
    const category = createCategory({
      slug: "legacy-priority",
      name: "Legacy Operations",
      description: "Historical operational reporting",
      sort_order: 7,
    });

    expect(isStrategicCategory(category.id)).toBe(false);
    expect(retireOrDeleteCategory(category.id, actorId)).toBe("deleted");
    expect(getCategory(category.id, { includeArchived: true })).toBeNull();

    const events = listStrategicAuditEvents({
      entity_type: "strategic_priority",
      entity_id: category.id,
    });
    const deleteEvent = events.find((event) => event.event_type === "delete");
    expect(deleteEvent).toMatchObject({
      entity_type: "strategic_priority",
      entity_id: category.id,
      event_type: "delete",
      entity_display_name: "Legacy Operations",
      parent_priority_name: "Legacy Operations",
      parent_goal_name: null,
      previous_value: {
        id: category.id,
        slug: "legacy-priority",
        name: "Legacy Operations",
        description: "Historical operational reporting",
        sort_order: 7,
      },
      new_value: null,
      actor_email_snapshot: "catalog-admin@example.org",
    });

    const html = renderToStaticMarkup(StrategicAuditTable({ events }));
    expect(html).toContain("Legacy Operations");
    expect(html).toContain("Strategic priority");
    expect(html).toContain("Delete");
    expect(html).toContain("catalog-admin@example.org");
  });

  it("archives a priority configured for Board reporting instead of hard-deleting it", () => {
    const actorId = createCatalogActor();
    const category = createCategory({
      slug: "board-priority",
      name: "Board Priority",
    });
    const db = getDb();
    const scopeId = Number(db.prepare(
      `INSERT INTO board_reporting_scopes (plan_id, created_by, updated_by)
       SELECT id, ?, ? FROM strategic_plans WHERE status = 'active' LIMIT 1`,
    ).run(actorId, actorId).lastInsertRowid);
    db.prepare(
      `INSERT INTO board_reporting_priorities (
         scope_id, priority_id, display_title, display_order, created_by, updated_by
       ) VALUES (?, ?, 'Board Priority', 10, ?, ?)`,
    ).run(scopeId, category.id, actorId, actorId);

    expect(isStrategicCategory(category.id)).toBe(true);
    expect(retireOrDeleteCategory(category.id, actorId)).toBe("archived");
    expect(getCategory(category.id, { includeArchived: true })).toMatchObject({
      id: category.id,
      archived_at: expect.any(String),
    });
  });

  it("preserves and renders every KPI snapshot when a category hard delete cascades", () => {
    const actorId = createCatalogActor();
    const category = createCategory({
      slug: "legacy-programs",
      name: "Legacy Programs",
    });
    const parent = createKPI({
      category_id: category.id,
      slug: "legacy-attendance",
      name: "Legacy attendance",
      unit: "visitors",
      unit_type: "attendance",
      reporting_frequency: "annual",
    });
    const childCategory = createCategory({
      slug: "legacy-child-programs",
      name: "Legacy Child Programs",
    });
    const child = createKPI({
      category_id: childCategory.id,
      parent_id: parent.id,
      slug: "legacy-youth-attendance",
      name: "Legacy youth attendance",
      unit: "visitors",
      unit_type: "attendance",
      reporting_frequency: "annual",
    });

    expect(retireOrDeleteCategory(category.id, actorId)).toBe("deleted");
    expect(getCategory(category.id, { includeArchived: true })).toBeNull();
    expect(getCategory(childCategory.id, { includeArchived: true })).toMatchObject({
      id: childCategory.id,
      name: "Legacy Child Programs",
    });
    expect(getKPI(parent.id, { includeArchived: true })).toBeNull();
    expect(getKPI(child.id, { includeArchived: true })).toBeNull();

    const events = listStrategicAuditEvents({ limit: 20 });
    const kpiEvents = events.filter(
      (event) =>
        event.entity_type === "kpi" &&
        event.event_type === "delete" &&
        (event.entity_id === parent.id || event.entity_id === child.id),
    );
    expect(kpiEvents).toHaveLength(2);
    expect(kpiEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity_id: parent.id,
          event_type: "delete",
          entity_display_name: "Legacy attendance",
          parent_priority_name: "Legacy Programs",
          previous_value: expect.objectContaining({
            id: parent.id,
            slug: "legacy-attendance",
            name: "Legacy attendance",
          }),
          new_value: null,
          actor_email_snapshot: "catalog-admin@example.org",
        }),
        expect.objectContaining({
          entity_id: child.id,
          event_type: "delete",
          entity_display_name: "Legacy youth attendance",
          parent_priority_name: "Legacy Child Programs",
          previous_value: expect.objectContaining({
            id: child.id,
            parent_id: parent.id,
            slug: "legacy-youth-attendance",
            name: "Legacy youth attendance",
          }),
          new_value: null,
          actor_email_snapshot: "catalog-admin@example.org",
        }),
      ]),
    );
    expect(
      events.filter(
        (event) =>
          event.entity_type === "strategic_priority" &&
          event.entity_id === category.id &&
          event.event_type === "delete",
      ),
    ).toHaveLength(1);

    const html = renderToStaticMarkup(StrategicAuditTable({ events }));
    expect(html).toContain("Legacy attendance");
    expect(html).toContain("Legacy youth attendance");
    expect(html).toContain("Legacy Programs");
    expect(html).toContain("Legacy Child Programs");
    expect(html).toContain("catalog-admin@example.org");
  });

  it("blocks a category cascade when a cross-category descendant has live entries", () => {
    const actorId = createCatalogActor();
    const parentCategory = createCategory({
      slug: "entry-parent-category",
      name: "Entry Parent Category",
    });
    const childCategory = createCategory({
      slug: "entry-child-category",
      name: "Entry Child Category",
    });
    const parent = createKPI({
      category_id: parentCategory.id,
      slug: "entry-parent-kpi",
      name: "Entry parent KPI",
      reporting_frequency: "annual",
    });
    const child = createKPI({
      category_id: childCategory.id,
      parent_id: parent.id,
      slug: "entry-child-kpi",
      name: "Entry child KPI",
      reporting_frequency: "annual",
    });
    getDb()
      .prepare(
        `INSERT INTO monthly_entries (kpi_id, year, month, value)
         VALUES (?, 2026, 0, 17)`,
      )
      .run(child.id);

    expect(countCategoryDependents(parentCategory.id)).toBe(1);
    expect(() => retireOrDeleteCategory(parentCategory.id, actorId)).toThrow(
      DependentEntriesError,
    );
    expect(getCategory(parentCategory.id, { includeArchived: true })).not.toBeNull();
    expect(getKPI(parent.id, { includeArchived: true })).not.toBeNull();
    expect(getKPI(child.id, { includeArchived: true })).not.toBeNull();
    expect(
      listStrategicAuditEvents({ limit: 50 }).filter(
        (event) =>
          event.event_type === "delete" &&
          (event.entity_id === parent.id || event.entity_id === child.id),
      ),
    ).toEqual([]);
  });

  it("does not hard-delete a category with a strategic cross-category descendant", () => {
    const actorId = createCatalogActor();
    const parentCategory = createCategory({
      slug: "strategic-parent-category",
      name: "Strategic Parent Category",
    });
    const childCategory = createCategory({
      slug: "strategic-child-category",
      name: "Strategic Child Category",
    });
    const parent = createKPI({
      category_id: parentCategory.id,
      slug: "strategic-parent-kpi",
      name: "Strategic parent KPI",
    });
    const child = createKPI({
      category_id: childCategory.id,
      parent_id: parent.id,
      slug: "strategic-child-kpi",
      name: "Strategic child KPI",
    });
    getDb()
      .prepare(
        `INSERT INTO kpi_measurement_configs (
           kpi_id, effective_from_year, effective_to_year, measurement_type,
           unit, reporting_frequency, aggregation_method, board_level_status,
           configuration_status, created_by, updated_by
         ) VALUES (?, 2025, 2029, 'count', 'items', 'annual', 'none',
                   'not_reported', 'active', ?, ?)`,
      )
      .run(child.id, actorId, actorId);

    expect(isStrategicCategory(parentCategory.id)).toBe(true);
    expect(retireOrDeleteCategory(parentCategory.id, actorId)).toBe("archived");
    expect(getCategory(parentCategory.id, { includeArchived: true })?.archived_at).not.toBeNull();
    expect(getKPI(parent.id, { includeArchived: true })).not.toBeNull();
    expect(getKPI(child.id, { includeArchived: true })).not.toBeNull();
  });

  it("rolls back the category and every child snapshot when one KPI audit insert fails", () => {
    const actorId = createCatalogActor();
    const category = createCategory({
      slug: "rollback-programs",
      name: "Rollback Programs",
    });
    const firstKpi = createKPI({
      category_id: category.id,
      slug: "rollback-first-kpi",
      name: "Rollback first KPI",
    });
    const rejectedKpi = createKPI({
      category_id: category.id,
      slug: "rollback-rejected-kpi",
      name: "Rollback rejected KPI",
    });
    const eventsBeforeDelete = listStrategicAuditEvents();
    getDb().exec(
      `CREATE TRIGGER reject_cascade_kpi_audit
       BEFORE INSERT ON strategic_audit_events
       WHEN NEW.entity_type = 'kpi' AND NEW.entity_id = ${rejectedKpi.id}
       BEGIN
         SELECT RAISE(ABORT, 'forced cascade KPI audit failure');
       END`,
    );

    expect(() => retireOrDeleteCategory(category.id, actorId)).toThrow(
      /forced cascade KPI audit failure/,
    );
    expect(getCategory(category.id, { includeArchived: true })).toMatchObject({
      id: category.id,
      name: "Rollback Programs",
    });
    expect(getKPI(firstKpi.id, { includeArchived: true })).toMatchObject({
      id: firstKpi.id,
      name: "Rollback first KPI",
    });
    expect(getKPI(rejectedKpi.id, { includeArchived: true })).toMatchObject({
      id: rejectedKpi.id,
      name: "Rollback rejected KPI",
    });
    expect(listStrategicAuditEvents()).toEqual(eventsBeforeDelete);
  });

  it("rolls back the KPI audit snapshot when the hard delete fails", () => {
    const actorId = createCatalogActor();
    const category = createCategory({
      slug: "protected-kpi-priority",
      name: "Protected KPI Priority",
    });
    const kpi = createKPI({
      category_id: category.id,
      slug: "protected-legacy-kpi",
      name: "Protected legacy KPI",
    });
    getDb().exec(
      `CREATE TRIGGER reject_legacy_kpi_delete
       BEFORE DELETE ON kpis
       WHEN OLD.id = ${kpi.id}
       BEGIN
         SELECT RAISE(ABORT, 'forced KPI delete failure');
       END`,
    );

    expect(() => retireOrDeleteKPI(kpi.id, actorId)).toThrow(
      /forced KPI delete failure/,
    );
    expect(getKPI(kpi.id, { includeArchived: true })).toMatchObject({
      id: kpi.id,
      name: "Protected legacy KPI",
    });
    expect(
      listStrategicAuditEvents({
        entity_type: "kpi",
        entity_id: kpi.id,
        event_type: "delete",
      }),
    ).toEqual([]);
  });

  it("rolls back the priority audit snapshot when the category hard delete fails", () => {
    const actorId = createCatalogActor();
    const category = createCategory({
      slug: "protected-priority",
      name: "Protected Priority",
    });
    getDb().exec(
      `CREATE TRIGGER reject_legacy_category_delete
       BEFORE DELETE ON categories
       WHEN OLD.id = ${category.id}
       BEGIN
         SELECT RAISE(ABORT, 'forced category delete failure');
       END`,
    );

    expect(() => retireOrDeleteCategory(category.id, actorId)).toThrow(
      /forced category delete failure/,
    );
    expect(getCategory(category.id, { includeArchived: true })).toMatchObject({
      id: category.id,
      name: "Protected Priority",
    });
    expect(
      listStrategicAuditEvents({
        entity_type: "strategic_priority",
        entity_id: category.id,
        event_type: "delete",
      }),
    ).toEqual([]);
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
