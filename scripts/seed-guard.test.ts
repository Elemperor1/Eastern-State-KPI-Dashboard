import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * S053-C1: `db:seed` must refuse to wipe a database unless the operator
 * confirms the exact resolved path via SEED_CONFIRM, and must refuse
 * outright under NODE_ENV=production unless --force is passed. The
 * refusal happens before any database access, so these child runs are
 * fast failure paths; the authorized happy path is covered end-to-end
 * by src/lib/auth-secrecy.test.ts (which also asserts the tombstone).
 */

let workDir = "";
let dbPath = "";

beforeEach(() => {
  workDir = mkdtempSync(path.join(os.tmpdir(), "eskpi-seed-guard-"));
  dbPath = path.join(workDir, "kpi.db");
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db
    .prepare("INSERT INTO meta (key, value) VALUES ('marker', 'untouched')")
    .run();
  db.close();
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** Implements the run seed test scenario. */
function runSeed(overrides: Record<string, string>) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  delete env.SEED_CONFIRM;
  delete env.NODE_ENV;
  Object.assign(env, overrides);
  return spawnSync(
    path.join(process.cwd(), "node_modules", ".bin", "tsx"),
    ["scripts/seed.ts"],
    { cwd: process.cwd(), env: env as NodeJS.ProcessEnv, encoding: "utf8" },
  );
}

/** Implements the marker intact test scenario. */
function markerIntact(): boolean {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const row = db
    .prepare("SELECT value FROM meta WHERE key = 'marker'")
    .get() as { value?: string } | undefined;
  db.close();
  return row?.value === "untouched";
}

/** Runs one explicitly authorized disposable reset. */
function runAuthorizedSeed() {
  return runSeed({
    DATABASE_PATH: dbPath,
    SEED_CONFIRM: dbPath,
    BOOTSTRAP_ADMIN_PASSWORD: "Disposable-Admin-Password-2026!",
    BOOTSTRAP_VIEWER_PASSWORD: "Disposable-Viewer-Password-2026!",
  });
}

/** Throws one source-map-safe child-process diagnostic for a failed seed. */
function requireSeedSuccess(result: ReturnType<typeof runSeed>): void {
  if (result.status === 0) return;
  const diagnostic = `${result.stdout}\n${result.stderr}`.replace(
    /[^\x09\x0a\x0d\x20-\x7e]/gu,
    "?",
  );
  throw new Error(`Authorized disposable seed failed:\n${diagnostic}`);
}

/** Adds lifecycle rows without adapting low-level SQLite diagnostics. */
function addLifecycleFixtureUnsafe(): { draftId: number; eventId: string } {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  const active = db
    .prepare(
      `SELECT id, organization_id, end_year, whole_plan_revision
       FROM strategic_plans WHERE lifecycle_state = 'active'`,
    )
    .get() as {
    id: number;
    organization_id: number;
    end_year: number;
    whole_plan_revision: number;
  };
  const actor = db
    .prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")
    .get() as { id: number };
  const draftId = Number(
    db
      .prepare(
        `INSERT INTO strategic_plans (
           organization_id, predecessor_plan_id, slug, name, description,
           start_year, end_year, status, lifecycle_state, creation_method,
           clone_source_revision, source_reference, approval_source,
           created_by, updated_by
         ) VALUES (?, ?, 'seed-reset-draft', 'Seed reset Draft',
                   'Disposable lifecycle fixture', ?, ?, 'draft', 'draft',
                   'blank', ?, 'Fixture', 'Fixture', ?, ?)`,
      )
      .run(
        active.organization_id,
        active.id,
        active.end_year + 1,
        active.end_year + 5,
        active.whole_plan_revision,
        actor.id,
        actor.id,
      ).lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO plan_section_reviews (
       plan_id, section, review_status, predecessor_revision
     ) VALUES (?, 'plan_details', 'needs_review', ?)`,
  ).run(draftId, active.whole_plan_revision);
  db.prepare(
    `INSERT INTO successor_lineage (
       organization_id, predecessor_plan_id, successor_plan_id, item_kind,
       predecessor_item_id, successor_item_id, relationship_type,
       predecessor_name_snapshot, predecessor_context_json, created_by
     ) VALUES (?, ?, ?, 'priority', 1, 2, 'copied_from',
               'Fixture Priority', '{}', ?)`,
  ).run(active.organization_id, active.id, draftId, actor.id);
  db.prepare(
    `INSERT INTO plan_item_reviews (
       plan_id, item_kind, item_id, review_status
     ) VALUES (?, 'priority', 2, 'needs_review')`,
  ).run(draftId);
  db.prepare(
    `INSERT INTO plan_question_decisions (
       plan_id, item_kind, item_id, classification, explanation,
       expected_revision, decided_by
     ) VALUES (?, 'goal', 3, 'follow_up', 'Fixture follow-up',
               'fixture-revision', ?)`,
  ).run(draftId, actor.id);
  db.prepare(
    `INSERT INTO plan_readiness_overrides (
       plan_id, requirement_key, requirement_label_snapshot, reason,
       plan_revision, created_by
     ) VALUES (?, 'fixture', 'Fixture requirement',
               'Disposable seed-reset proof', 1, ?)`,
  ).run(draftId, actor.id);
  const eventId = "00000000-0000-4000-8000-000000000001";
  db.prepare(
    `INSERT INTO strategic_plan_lifecycle_events (
       event_id, plan_id, predecessor_plan_id, action, before_state,
       after_state, result_json, actor_id
     ) VALUES (?, ?, ?, 'create_blank', NULL, 'draft', '{}', ?)`,
  ).run(eventId, draftId, active.id, actor.id);
  const activationId = "00000000-0000-4000-8000-000000000002";
  db.prepare(
    `INSERT INTO plan_activation_operations (
       activation_id, predecessor_plan_id, successor_plan_id,
       requested_revision, phase, requested_by
     ) VALUES (?, ?, ?, 1, 'failed_precommit', ?)`,
  ).run(activationId, active.id, draftId, actor.id);
  db.prepare(
    `INSERT INTO activation_recovery_audit_events (
       recovery_id, activation_id, backup_id, action, operator_snapshot,
       integrity_result, details_json
     ) VALUES ('00000000-0000-4000-8000-000000000003', ?,
               'fixture-backup', 'reopen_service', 'Fixture operator',
               'fixture', '{}')`,
  ).run(activationId);
  db.close();
  return { draftId, eventId };
}

/** Adds lifecycle rows while keeping failures anchored to this source file. */
function addLifecycleFixture(): { draftId: number; eventId: string } {
  try {
    return addLifecycleFixtureUnsafe();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not prepare lifecycle seed fixture: ${message}`);
  }
}

describe("db:seed destructive-reset guard (S053-C1)", () => {
  it("refuses to wipe when SEED_CONFIRM is unset", () => {
    const res = runSeed({ DATABASE_PATH: dbPath });

    expect(res.status).not.toBe(0);
    expect(`${res.stdout}\n${res.stderr}`).toContain("SEED_CONFIRM");
    expect(markerIntact()).toBe(true);
  });

  it("refuses to wipe when SEED_CONFIRM names a different path", () => {
    const res = runSeed({
      DATABASE_PATH: dbPath,
      SEED_CONFIRM: path.join(workDir, "some-other.db"),
    });

    expect(res.status).not.toBe(0);
    expect(`${res.stdout}\n${res.stderr}`).toContain("SEED_CONFIRM");
    expect(markerIntact()).toBe(true);
  });

  it("refuses under NODE_ENV=production without --force even when confirmed", () => {
    const res = runSeed({
      DATABASE_PATH: dbPath,
      SEED_CONFIRM: dbPath,
      NODE_ENV: "production",
    });

    expect(res.status).not.toBe(0);
    expect(`${res.stdout}\n${res.stderr}`).toContain("production");
    expect(markerIntact()).toBe(true);
  });

  it("clears schema-16 lifecycle rows and resets the bypass after an authorized disposable seed", () => {
    rmSync(dbPath, { force: true });
    requireSeedSuccess(runAuthorizedSeed());
    addLifecycleFixture();

    const result = runAuthorizedSeed();

    requireSeedSuccess(result);
    const db = new DatabaseSync(dbPath, { readOnly: true });
    for (const table of [
      "activation_recovery_audit_events",
      "plan_activation_operations",
      "strategic_plan_lifecycle_events",
      "plan_readiness_overrides",
      "plan_question_decisions",
      "plan_item_reviews",
      "successor_lineage",
      "plan_section_reviews",
    ]) {
      expect(
        db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get(),
      ).toEqual({ count: 0 });
    }
    expect(
      db.prepare(
        "SELECT value FROM meta WHERE key = 'seed_reset_internal_write'",
      ).get(),
    ).toEqual({ value: "0" });
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    db.close();
  });

  it("rolls the complete reset back and clears the bypass when reseeding fails", () => {
    rmSync(dbPath, { force: true });
    requireSeedSuccess(runAuthorizedSeed());
    const fixture = addLifecycleFixture();
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TRIGGER force_seed_reset_failure
      BEFORE DELETE ON categories
      BEGIN
        SELECT RAISE(ABORT, 'forced seed reset failure');
      END;
    `);
    db.close();

    const result = runAuthorizedSeed();

    expect(result.status).not.toBe(0);
    const verification = new DatabaseSync(dbPath, { readOnly: true });
    expect(
      verification.prepare(
        "SELECT value FROM meta WHERE key = 'seed_reset_internal_write'",
      ).get(),
    ).toEqual({ value: "0" });
    expect(
      verification.prepare(
        "SELECT id FROM strategic_plans WHERE id = ?",
      ).get(fixture.draftId),
    ).toEqual({ id: fixture.draftId });
    expect(
      verification.prepare(
        "SELECT event_id FROM strategic_plan_lifecycle_events WHERE event_id = ?",
      ).get(fixture.eventId),
    ).toEqual({ event_id: fixture.eventId });
    verification.close();
  });
});
