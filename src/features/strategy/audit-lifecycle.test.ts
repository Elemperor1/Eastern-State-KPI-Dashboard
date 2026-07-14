import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb } from "@/lib/db";
import { listStrategicAuditEvents, recordStrategicAuditEvent } from "./audit";

describe("strategic audit deletion lifecycle", () => {
  let tmpDir: string;
  let originalDatabasePath: string | undefined;
  let databaseIndex = 0;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-audit-lifecycle-"));
    originalDatabasePath = process.env.DATABASE_PATH;
  });

  beforeEach(() => {
    resetDb();
    process.env.DATABASE_PATH = path.join(tmpDir, `audit-${databaseIndex++}.db`);
  });

  afterAll(() => {
    resetDb();
    if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDatabasePath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("keeps KPI, goal, and priority names visible after every live row and actor is deleted", () => {
    const db = getDb();
    const actorId = Number(
      db
        .prepare(
          `INSERT INTO users (email, name, password_hash, role)
           VALUES ('audit-admin@example.org', 'Audit Admin', 'hash', 'admin')`,
        )
        .run().lastInsertRowid,
    );
    const priorityId = Number(
      db
        .prepare(
          `INSERT INTO categories (slug, name, sort_order)
           VALUES ('visitor-experience', 'Visitor Experience', 1)`,
        )
        .run().lastInsertRowid,
    );
    const kpiId = Number(
      db
        .prepare(
          `INSERT INTO kpis (
             category_id, slug, name, unit, unit_type, reporting_frequency,
             direction, sort_order
           ) VALUES (?, 'visitor-upgrades', 'Visitor upgrades', 'projects',
                     'count', 'annual', 'higher', 1)`,
        )
        .run(priorityId).lastInsertRowid,
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
        .run(priorityId, actorId, actorId).lastInsertRowid,
    );
    db.prepare(
      `INSERT INTO goal_kpis (
         goal_id, kpi_id, effective_from_year, effective_to_year,
         created_by, updated_by
       ) VALUES (?, ?, 2025, 2029, ?, ?)`,
    ).run(goalId, kpiId, actorId, actorId);

    recordStrategicAuditEvent({
      entity_type: "kpi",
      entity_id: kpiId,
      event_type: "update",
      entity_display_name: "Visitor upgrades",
      parent_priority_name: "Visitor Experience",
      parent_goal_name: "Amenity goal",
      previous_value: { configuration_status: "draft" },
      new_value: { configuration_status: "active" },
      actor_id: actorId,
    });
    recordStrategicAuditEvent({
      entity_type: "strategic_goal",
      entity_id: goalId,
      event_type: "update",
      entity_display_name: "Amenity goal",
      parent_priority_name: "Visitor Experience",
      parent_goal_name: "Amenity goal",
      previous_value: { configuration_status: "draft" },
      new_value: { configuration_status: "active" },
      actor_id: actorId,
    });
    recordStrategicAuditEvent({
      entity_type: "strategic_priority",
      entity_id: priorityId,
      event_type: "update",
      entity_display_name: "Visitor Experience",
      parent_priority_name: "Visitor Experience",
      previous_value: { name: "Visitor experience" },
      new_value: { name: "Visitor Experience" },
      actor_id: actorId,
    });

    db.prepare("DELETE FROM goal_kpis WHERE goal_id = ?").run(goalId);
    db.prepare("DELETE FROM strategic_goals WHERE id = ?").run(goalId);
    db.prepare("DELETE FROM categories WHERE id = ?").run(priorityId);
    db.prepare("DELETE FROM users WHERE id = ?").run(actorId);

    expect(db.prepare("SELECT id FROM strategic_goals WHERE id = ?").get(goalId)).toBeUndefined();
    expect(db.prepare("SELECT id FROM kpis WHERE id = ?").get(kpiId)).toBeUndefined();
    expect(db.prepare("SELECT id FROM categories WHERE id = ?").get(priorityId)).toBeUndefined();

    const events = listStrategicAuditEvents({ limit: 10 });
    expect(events).toHaveLength(3);
    const kpiEvent = events.find(
      (event) => event.entity_type === "kpi" && event.entity_id === kpiId,
    );
    expect(kpiEvent).toMatchObject({
      entity_display_name: "Visitor upgrades",
      parent_priority_name: "Visitor Experience",
      parent_goal_name: "Amenity goal",
      actor_id: null,
      actor_email_snapshot: "audit-admin@example.org",
      previous_value: { configuration_status: "draft" },
      new_value: { configuration_status: "active" },
    });
    expect(kpiEvent?.occurred_at).toEqual(expect.any(String));
    expect(events.find((event) => event.entity_type === "strategic_goal")).toMatchObject({
      entity_display_name: "Amenity goal",
      parent_priority_name: "Visitor Experience",
    });
    expect(events.find((event) => event.entity_type === "strategic_priority")).toMatchObject({
      entity_display_name: "Visitor Experience",
    });
  });

  it("filters related entities and display names before applying the result limit", () => {
    const identityMatch = recordStrategicAuditEvent({
      entity_type: "target",
      entity_id: 41,
      event_type: "update",
      entity_display_name: "Annual target",
      previous_value: { target_value: 4 },
      new_value: { target_value: 5 },
    });
    const nameMatch = recordStrategicAuditEvent({
      entity_type: "distribution_observation",
      entity_id: 42,
      event_type: "update",
      entity_display_name: "Visitor upgrades distribution",
      previous_value: { respondent_total: 10 },
      new_value: { respondent_total: 12 },
    });

    for (let index = 0; index < 501; index += 1) {
      recordStrategicAuditEvent({
        entity_type: "kpi",
        entity_id: 1_000 + index,
        event_type: "update",
        entity_display_name: `Unrelated KPI ${index}`,
        previous_value: { value: index },
        new_value: { value: index + 1 },
      });
    }

    const events = listStrategicAuditEvents({
      identities: [{ entity_type: "target", entity_id: 41 }],
      entity_display_name_contains: "Visitor upgrades",
      limit: 500,
    });

    expect(events.map((event) => event.id)).toEqual([
      nameMatch.id,
      identityMatch.id,
    ]);
  });

  it("pages audit events with a validated offset", () => {
    const first = recordStrategicAuditEvent({
      entity_type: "kpi",
      entity_id: 51,
      event_type: "create",
      entity_display_name: "First measure",
      new_value: { name: "First measure" },
    });
    const second = recordStrategicAuditEvent({
      entity_type: "kpi",
      entity_id: 52,
      event_type: "create",
      entity_display_name: "Second measure",
      new_value: { name: "Second measure" },
    });

    expect(listStrategicAuditEvents({ limit: 1, offset: 0 }).map((event) => event.id)).toEqual([
      second.id,
    ]);
    expect(listStrategicAuditEvents({ limit: 1, offset: 1 }).map((event) => event.id)).toEqual([
      first.id,
    ]);
    expect(
      listStrategicAuditEvents({ limit: 1, offset: Number.POSITIVE_INFINITY }).map(
        (event) => event.id,
      ),
    ).toEqual([second.id]);
  });

  it("rejects incomplete audit snapshots before writing a row", () => {
    expect(() =>
      recordStrategicAuditEvent({
        entity_type: "kpi_observation",
        entity_id: 1,
        event_type: "update",
        entity_display_name: "Visitor upgrades — 2026",
        new_value: { scalar_value: 2 },
      }),
    ).toThrow(/previous snapshot/i);
    expect(() =>
      recordStrategicAuditEvent({
        entity_type: "distribution_band",
        entity_id: 2,
        event_type: "archive",
        entity_display_name: "Higher income range",
        previous_value: { archived_at: null },
      }),
    ).toThrow(/new snapshot/i);
    expect(() =>
      recordStrategicAuditEvent({
        entity_type: "strategic_goal",
        entity_id: 3,
        event_type: "create",
        entity_display_name: "   ",
        new_value: { name: "Amenity goal" },
      }),
    ).toThrow(/display name/i);
    expect(listStrategicAuditEvents()).toEqual([]);
  });
});
