import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb } from "@/lib/db";
import { bootstrapTestInstallation } from "@/features/installation/test-fixture";
import {
  listDeletedHistoryCategories,
  listDeletedHistoryKpis,
  listEntryHistory,
  listEntryHistoryYears,
  listSetupAuditEvents,
} from "./server";

describe("read-only legacy Activity archive", () => {
  let tmpDir: string;
  let originalDatabasePath: string | undefined;
  let databaseIndex = 0;
  let actorId: number;
  let categoryId: number;
  let kpiId: number;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-activity-archive-"));
    originalDatabasePath = process.env.DATABASE_PATH;
  });

  beforeEach(() => {
    resetDb();
    process.env.DATABASE_PATH = path.join(tmpDir, `activity-${databaseIndex++}.db`);
    bootstrapTestInstallation();
    const db = getDb();
    actorId = Number(
      db.prepare(
        `INSERT INTO users (email, name, password_hash, role)
         VALUES ('archive-admin@example.org', 'Archive Admin', 'hash', 'admin')`,
      ).run().lastInsertRowid,
    );
    categoryId = Number(
      db.prepare(
        `INSERT INTO categories (plan_id, slug, name, sort_order)
         VALUES ((SELECT id FROM strategic_plans WHERE status = 'active'),
                 'visitor-experience', 'Visitor Experience', 1)`,
      ).run().lastInsertRowid,
    );
    kpiId = Number(
      db.prepare(
        `INSERT INTO kpis (
           category_id, slug, name, unit, unit_type, reporting_frequency,
           direction, sort_order
         ) VALUES (?, 'visitor-reach', 'Visitor reach', 'visits', 'count',
                   'annual', 'higher', 1)`,
      ).run(categoryId).lastInsertRowid,
    );
  });

  afterAll(() => {
    resetDb();
    if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDatabasePath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Supports the insert history test scenario. */
  function insertHistory({
    year,
    value,
    label = "Visitor reach",
  }: {
    year: number;
    value: number;
    label?: string;
  }): number {
    return Number(
      getDb().prepare(
        `INSERT INTO entry_history (
           entry_type, entry_id, kpi_id, year, month_or_label,
           prev_value, new_value, changed_by,
           kpi_name, kpi_slug, kpi_unit,
           category_id, category_name, category_slug, changed_by_email
         ) VALUES (
           'monthly', NULL, ?, ?, '0', NULL, ?, ?, ?, 'visitor-reach',
           'visits', ?, 'Visitor Experience', 'visitor-experience',
           'archive-admin@example.org'
         )`,
      ).run(kpiId, year, value, actorId, label, categoryId).lastInsertRowid,
    );
  }

  it("keeps immutable labels while exposing a later rename", () => {
    insertHistory({ year: 2026, value: 12 });
    getDb().prepare("UPDATE kpis SET name = 'Community reach' WHERE id = ?").run(kpiId);
    getDb().prepare("UPDATE categories SET name = 'Guest Experience' WHERE id = ?").run(categoryId);

    expect(listEntryHistory({ kpi_id: kpiId })).toEqual([
      expect.objectContaining({
        kpi_name: "Visitor reach",
        category_name: "Visitor Experience",
        kpi_current_name: "Community reach",
        category_current_name: "Guest Experience",
        metadata_deleted: false,
        metadata_renamed: true,
      }),
    ]);
  });

  it("keeps tombstones and actor snapshots after all live rows are deleted", () => {
    insertHistory({ year: 2026, value: 12 });
    getDb().prepare("DELETE FROM categories WHERE id = ?").run(categoryId);
    getDb().prepare("DELETE FROM users WHERE id = ?").run(actorId);

    expect(listEntryHistory({ category_id: categoryId })).toEqual([
      expect.objectContaining({
        kpi_id: kpiId,
        kpi_name: "Visitor reach",
        category_name: "Visitor Experience",
        changed_by: null,
        changed_by_email: "archive-admin@example.org",
        metadata_deleted: true,
      }),
    ]);
    expect(listDeletedHistoryCategories()).toEqual([
      expect.objectContaining({ id: categoryId, name: "Visitor Experience" }),
    ]);
    expect(listDeletedHistoryKpis()).toEqual([
      expect.objectContaining({ id: kpiId, name: "Visitor reach" }),
    ]);
  });

  it("pages in stable newest-first order and lists years outside the page", () => {
    const ids: number[] = [];
    for (let index = 0; index < 55; index += 1) {
      ids.push(insertHistory({
        year: index === 0 ? 2024 : 2027,
        value: index,
      }));
    }

    const first = listEntryHistory({ limit: 50 });
    const second = listEntryHistory({ limit: 50, offset: 50 });
    expect(first).toHaveLength(50);
    expect(second).toHaveLength(5);
    expect(first[0]?.id).toBe(ids.at(-1));
    expect(second.at(-1)?.id).toBe(ids[0]);
    expect(listEntryHistoryYears()).toEqual([2027, 2024]);
  });

  it("rejects unsafe offsets without changing the first page", () => {
    insertHistory({ year: 2026, value: 1 });
    const newest = insertHistory({ year: 2027, value: 2 });

    expect(listEntryHistory({ limit: 1, offset: Number.POSITIVE_INFINITY })[0]?.id)
      .toBe(newest);
  });

  it("paginates one globally ordered setup stream beyond one thousand events", () => {
    const db = getDb();
    db.exec("DELETE FROM strategic_audit_events; DELETE FROM installation_audit_events;");
    const insertStrategic = db.prepare(
      `INSERT INTO strategic_audit_events (
         entity_type, entity_id, event_type, entity_display_name,
         new_value_json, occurred_at
       ) VALUES ('kpi', ?, 'create', ?, '{}', ?)`,
    );
    for (let id = 1; id <= 1_001; id += 1) {
      const occurredAt = new Date(Date.UTC(2026, 0, 1, 0, 0, id))
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      insertStrategic.run(id, `Strategic ${id}`, occurredAt);
    }
    const insertInstallation = db.prepare(
      `INSERT INTO installation_audit_events (
         entity_type, entity_id, event_type, entity_display_name,
         new_value_json, occurred_at
       ) VALUES ('strategic_plan', ?, 'create', ?, '{}', ?)`,
    );
    insertInstallation.run(1, "Newest installation", "2026-02-01 00:00:00");
    insertInstallation.run(2, "Oldest installation", "2025-12-01 00:00:00");

    expect(
      listSetupAuditEvents({ limit: 4, offset: 1_000 }).map(
        (event) => event.entity_display_name,
      ),
    ).toEqual(["Strategic 2", "Strategic 1", "Oldest installation"]);
  });
});
