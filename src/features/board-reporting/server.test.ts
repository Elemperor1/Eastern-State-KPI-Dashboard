import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrapInstallation } from "@/features/installation/server";
import { createCategory, createKPI } from "@/features/catalog/server";
import { getDb, resetDb } from "@/lib/db";
import {
  BoardReportingEditConflictError,
  BoardReportingValidationError,
  getBoardReportingAdminModel,
  getBoardReportingScope,
  updateBoardReportingScope,
} from "./server";

describe("database-backed Board reporting configuration", () => {
  let directory: string;
  let originalDatabasePath: string | undefined;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-board-reporting-"));
    originalDatabasePath = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = path.join(directory, "board-reporting.db");
    resetDb();
    bootstrapInstallation({
      organization: { slug: "museum", name: "Museum", shortName: "Museum" },
      plan: {
        slug: "plan",
        name: "Strategic Plan",
        description: null,
        startYear: 2025,
        endYear: 2029,
        sourceReference: null,
      },
    });
  });

  afterEach(() => {
    resetDb();
    if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDatabasePath;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  /** Creates the catalog and actor used by an edit scenario. */
  function fixture() {
    const priority = createCategory({ slug: "visitor", name: "Visitor Experience" });
    const otherPriority = createCategory({ slug: "learning", name: "Learning" });
    const measure = createKPI({
      category_id: priority.id,
      slug: "attendance",
      name: "Attendance",
      unit: "visitors",
      unit_type: "attendance",
      reporting_frequency: "annual",
      direction: "higher",
    });
    const otherMeasure = createKPI({
      category_id: otherPriority.id,
      slug: "downloads",
      name: "Lesson downloads",
      unit: "downloads",
      unit_type: "count",
      reporting_frequency: "annual",
      direction: "higher",
    });
    const actorId = Number(getDb().prepare(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ('editor@example.org', 'Editor', 'hash', 'admin')`,
    ).run().lastInsertRowid);
    return { priority, otherPriority, measure, otherMeasure, actorId };
  }

  it("persists the complete editable scope, linked measures, revision, and actor audit", () => {
    const { priority, measure, actorId } = fixture();
    const initial = getBoardReportingAdminModel();
    expect(initial.scope.priorities).toEqual([]);
    expect(initial.availablePriorities).toHaveLength(2);

    const updated = updateBoardReportingScope({
      expectedRevision: initial.scope.revision,
      priorities: [{
        priorityId: priority.id,
        displayTitle: "A Board-specific visitor title",
        statements: [{ text: "Grow attendance.", kpiIds: [measure.id] }],
      }],
    }, actorId);

    expect(updated).toMatchObject({
      revision: 1,
      priorities: [{
        prioritySlug: "visitor",
        displayTitle: "A Board-specific visitor title",
        statements: [{
          text: "Grow attendance.",
          measures: [{ slug: "attendance" }],
        }],
      }],
    });
    expect(getBoardReportingScope()).toEqual(updated);
    expect(getDb().prepare(
      "SELECT event_type, actor_email_snapshot FROM board_reporting_audit_events ORDER BY id DESC LIMIT 1",
    ).get()).toEqual({ event_type: "update", actor_email_snapshot: "editor@example.org" });
  });

  it("rejects stale edits atomically and never recreates content after an Admin removes it", () => {
    const { priority, measure, actorId } = fixture();
    const initial = getBoardReportingScope();
    const first = updateBoardReportingScope({
      expectedRevision: initial.revision,
      priorities: [{
        priorityId: priority.id,
        displayTitle: "Visitor",
        statements: [{ text: "Grow attendance.", kpiIds: [measure.id] }],
      }],
    }, actorId);
    expect(() => updateBoardReportingScope({
      expectedRevision: initial.revision,
      priorities: [],
    }, actorId)).toThrow(BoardReportingEditConflictError);
    expect(getBoardReportingScope()).toEqual(first);

    const emptied = updateBoardReportingScope({
      expectedRevision: first.revision,
      priorities: [],
    }, actorId);
    resetDb();
    expect(getBoardReportingScope()).toEqual(emptied);
    expect(getBoardReportingScope().priorities).toEqual([]);
  });

  it("rejects a measure linked under a different priority without partial writes", () => {
    const { priority, otherMeasure, actorId } = fixture();
    const initial = getBoardReportingScope();
    expect(() => updateBoardReportingScope({
      expectedRevision: initial.revision,
      priorities: [{
        priorityId: priority.id,
        displayTitle: "Visitor",
        statements: [{ text: "Wrong link.", kpiIds: [otherMeasure.id] }],
      }],
    }, actorId)).toThrow(BoardReportingValidationError);
    expect(getBoardReportingScope()).toEqual(initial);
  });

  it("removes archived catalog entities from the effective Board authorization scope", () => {
    const { priority, measure, actorId } = fixture();
    const initial = getBoardReportingScope();
    updateBoardReportingScope({
      expectedRevision: initial.revision,
      priorities: [{
        priorityId: priority.id,
        displayTitle: "Visitor",
        statements: [{ text: "Grow attendance.", kpiIds: [measure.id] }],
      }],
    }, actorId);

    getDb().prepare(
      "UPDATE kpis SET archived_at = datetime('now'), is_active = 0 WHERE id = ?",
    ).run(measure.id);
    expect(getBoardReportingScope().priorities[0]?.statements[0]?.measures).toEqual([]);

    getDb().prepare(
      "UPDATE categories SET archived_at = datetime('now') WHERE id = ?",
    ).run(priority.id);
    expect(getBoardReportingScope().priorities).toEqual([]);
  });
});
