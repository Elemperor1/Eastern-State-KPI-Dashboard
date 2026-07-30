import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { bootstrapInstallation } from "../src/features/installation/server";
import { createSuccessorDraft } from "../src/features/plans/server";
import { getDb, resetDb } from "../src/lib/db";

/** Hashes the small disposable recovery fixture. */
function sha256(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

/** Stops the proof with a concise assertion failure. */
function assertProof(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-recovery-proof-"));
const databasePath = path.join(directory, "recovery.db");
const activationId = crypto.randomUUID();
const backupPath = path.join(directory, `plan-activation-${activationId}.sqlite`);
process.env.DATABASE_PATH = databasePath;
try {
  const actorId = Number(
    getDb().prepare(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ('recovery@example.org', 'Recovery Admin', 'hash', 'admin')`,
    ).run().lastInsertRowid,
  );
  const active = bootstrapInstallation({
    organization: {
      slug: "recovery-site",
      name: "Recovery Site",
      shortName: "Recovery",
    },
    plan: {
      slug: "plan-2021-2025",
      name: "Plan 2021–2025",
      description: "Current plan.",
      startYear: 2021,
      endYear: 2025,
      sourceReference: "Test approval",
    },
  }).installation.plan;
  const draft = createSuccessorDraft({
    creationMethod: "blank",
    name: "Plan 2026–2030",
    description: "Recovery fixture.",
    endYear: 2030,
    approvalSource: "Test approval",
  }, actorId);
  getDb().prepare(
    `INSERT INTO plan_activation_operations (
       activation_id, predecessor_plan_id, successor_plan_id,
       requested_revision, phase, requested_by
     ) VALUES (?, ?, ?, ?, 'pausing', ?)`,
  ).run(activationId, active.id, draft.id, draft.wholePlanRevision, actorId);
  getDb().prepare(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('plan_activation_write_pause', '1')",
  ).run();
  getDb().exec("PRAGMA wal_checkpoint(TRUNCATE)");
  fs.copyFileSync(databasePath, backupPath, fs.constants.COPYFILE_EXCL);
  const backupHash = sha256(backupPath);
  getDb().prepare(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('plan_activation_internal_write', '1')",
  ).run();
  getDb().prepare(
    `UPDATE strategic_plans
     SET status = 'archived', lifecycle_state = 'archived',
         archived_at = datetime('now')
     WHERE id = ?`,
  ).run(active.id);
  getDb().prepare(
    `UPDATE strategic_plans
     SET status = 'active', lifecycle_state = 'active',
         activation_id = ?, activated_at = datetime('now')
     WHERE id = ?`,
  ).run(activationId, draft.id);
  getDb().prepare(
    `UPDATE plan_activation_operations
     SET phase = 'verification_failed', backup_id = ?,
         backup_path = ?, backup_sha256 = ?, backup_size = ?,
         committed_at = datetime('now'), committed_write_counter = ?
     WHERE activation_id = ?`,
  ).run(
    `plan-activation-${activationId}`,
    backupPath,
    backupHash,
    fs.statSync(backupPath).size,
    Number(
      (
        getDb()
          .prepare(
            "SELECT value FROM meta WHERE key = 'authoritative_write_counter'",
          )
          .get() as { value: string }
      ).value,
    ),
    activationId,
  );
  getDb().prepare(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('active_plan_integrity_blocked', '1')",
  ).run();
  getDb().prepare(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('plan_activation_internal_write', '0')",
  ).run();
  getDb().exec("PRAGMA wal_checkpoint(TRUNCATE)");
  resetDb();

  const postWriteDatabasePath = path.join(directory, "recovery-post-write.db");
  fs.copyFileSync(databasePath, postWriteDatabasePath, fs.constants.COPYFILE_EXCL);
  const postWrite = new DatabaseSync(postWriteDatabasePath, { timeout: 5_000 });
  try {
    postWrite.prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('plan_activation_internal_write', '1')",
    ).run();
    postWrite.prepare(
      "UPDATE organizations SET name = name || ' changed after activation' WHERE id = 1",
    ).run();
    postWrite.prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('plan_activation_internal_write', '0')",
    ).run();
  } finally {
    postWrite.close();
  }
  const refused = spawnSync(
    process.execPath,
    [path.resolve("node_modules/tsx/dist/cli.mjs"), "scripts/plan-activation-recovery.ts"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_PATH: postWriteDatabasePath,
        PLAN_RECOVERY_CONFIRM: fs.realpathSync(postWriteDatabasePath),
        PLAN_RECOVERY_ACTIVATION_ID: activationId,
        PLAN_RECOVERY_ACTION: "restore-backup",
        PLAN_RECOVERY_OPERATOR: "Automated recovery proof",
      },
    },
  );
  assertProof(
    refused.status !== 0,
    "recovery did not refuse a database with a post-activation write",
  );
  assertProof(
    refused.stderr.includes("authoritative data changed after activation"),
    "recovery refusal did not identify the post-activation write boundary",
  );
  const refusedDatabase = new DatabaseSync(postWriteDatabasePath, {
    readOnly: true,
  });
  try {
    const organization = refusedDatabase
      .prepare("SELECT name FROM organizations WHERE id = 1")
      .get() as { name?: string } | undefined;
    assertProof(
      organization?.name?.endsWith(" changed after activation"),
      "refused recovery replaced the post-activation database",
    );
  } finally {
    refusedDatabase.close();
  }

  const result = spawnSync(
    process.execPath,
    [path.resolve("node_modules/tsx/dist/cli.mjs"), "scripts/plan-activation-recovery.ts"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_PATH: databasePath,
        PLAN_RECOVERY_CONFIRM: fs.realpathSync(databasePath),
        PLAN_RECOVERY_ACTIVATION_ID: activationId,
        PLAN_RECOVERY_ACTION: "restore-backup",
        PLAN_RECOVERY_OPERATOR: "Automated recovery proof",
      },
    },
  );
  assertProof(result.status === 0, result.stderr || "recovery command failed");
  const restored = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const predecessor = restored.prepare(
      "SELECT lifecycle_state FROM strategic_plans WHERE id = ?",
    ).get(active.id) as { lifecycle_state?: string } | undefined;
    const successor = restored.prepare(
      "SELECT lifecycle_state FROM strategic_plans WHERE id = ?",
    ).get(draft.id) as { lifecycle_state?: string } | undefined;
    const audit = restored.prepare(
      `SELECT action, integrity_result, details_json
       FROM activation_recovery_audit_events WHERE activation_id = ?`,
    ).get(activationId) as Record<string, unknown> | undefined;
    assertProof(predecessor?.lifecycle_state === "active", "predecessor was not restored Active");
    assertProof(successor?.lifecycle_state === "draft", "successor was not restored Draft");
    assertProof(audit?.action === "restore_pre_activation_backup", "recovery audit is missing");
    assertProof(
      audit.integrity_result === "verified_restored_pre_activation_state",
      "restoration verification evidence is missing",
    );
    const details = JSON.parse(String(audit.details_json)) as {
      writeSafetyProof?: {
        committedWriteCounter?: number;
        currentWriteCounter?: number;
        noPostActivationWrites?: boolean;
      };
    };
    assertProof(
      details.writeSafetyProof?.noPostActivationWrites === true &&
        details.writeSafetyProof.committedWriteCounter ===
          details.writeSafetyProof.currentWriteCounter,
      "durable no-post-activation-write evidence is missing",
    );
  } finally {
    restored.close();
  }
  const retained = fs.readdirSync(path.join(directory, "plan-activation-recovery"))
    .some((name) => name.startsWith(`failed-${activationId}-`));
  assertProof(retained, "failed database was not retained");
  console.log("[plan-recovery-proof] verified restore, retained failed state, and immutable recovery evidence");
} finally {
  resetDb();
  delete process.env.DATABASE_PATH;
  fs.rmSync(directory, { recursive: true, force: true });
}
