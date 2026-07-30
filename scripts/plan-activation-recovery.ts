import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import schemaVersion from "../src/lib/schema-version.json";

type Operation = Record<string, unknown>;
type WriteSafetyProof = {
  committedWriteCounter: number;
  currentWriteCounter: number;
  writePause: "1";
  integrityBlocked: "1";
  internalWrite: "0";
  noPostActivationWrites: true;
};

/** Stops recovery with one operator-safe message. */
function fail(message: string): never {
  console.error(`[plan-recovery] ${message}`);
  process.exit(1);
}

/** Resolves and validates the explicitly named database. */
function recoveryDatabasePath(): string {
  const requested = process.env.DATABASE_PATH?.trim();
  if (!requested || !path.isAbsolute(requested)) {
    fail("DATABASE_PATH must name the absolute database being recovered.");
  }
  const resolved = fs.realpathSync(requested);
  const confirmation = process.env.PLAN_RECOVERY_CONFIRM?.trim();
  if (confirmation !== resolved) {
    fail("PLAN_RECOVERY_CONFIRM must exactly match the resolved DATABASE_PATH.");
  }
  return resolved;
}

/** Hashes a retained backup for identity verification. */
function sha256(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

/** Performs the reusable SQLite integrity checks. */
function verifyDatabase(db: DatabaseSync): void {
  const quick = db.prepare("PRAGMA quick_check").all();
  if (quick.length !== 1 || !Object.values(quick[0] ?? {}).includes("ok")) {
    fail("SQLite quick_check failed.");
  }
  if (db.prepare("PRAGMA foreign_key_check").all().length > 0) {
    fail("SQLite foreign_key_check failed.");
  }
  const schema = db.prepare(
    "SELECT value FROM meta WHERE key = 'schema_version'",
  ).get() as { value?: unknown } | undefined;
  if (Number(schema?.value) !== schemaVersion.schemaVersion) {
    fail(`The database is not schema ${schemaVersion.schemaVersion}.`);
  }
}

/** Reads the one exact activation operation selected by the operator. */
function operation(db: DatabaseSync, activationId: string): Operation {
  const row = db.prepare(
    "SELECT * FROM plan_activation_operations WHERE activation_id = ?",
  ).get(activationId) as Operation | undefined;
  if (!row) fail("No activation operation matches PLAN_RECOVERY_ACTIVATION_ID.");
  return row;
}

/** Proves the failed activation remained fail-closed without later writes. */
function verifyNoPostActivationWrites(
  db: DatabaseSync,
  row: Operation,
): WriteSafetyProof {
  if (String(row.phase) !== "verification_failed" || !row.committed_at) {
    fail(
      "Restore is allowed only after a committed activation failed post-commit verification.",
    );
  }
  const committedWriteCounter = Number(row.committed_write_counter);
  const counters = Object.fromEntries(
    (
      db
        .prepare(
          `SELECT key, value FROM meta
           WHERE key IN (
             'authoritative_write_counter',
             'plan_activation_write_pause',
             'active_plan_integrity_blocked',
             'plan_activation_internal_write'
           )`,
        )
        .all() as Array<{ key: string; value: string }>
    ).map((item) => [item.key, item.value]),
  );
  const currentWriteCounter = Number(counters.authoritative_write_counter);
  if (
    !Number.isSafeInteger(committedWriteCounter) ||
    committedWriteCounter < 0 ||
    !Number.isSafeInteger(currentWriteCounter) ||
    currentWriteCounter < 0
  ) {
    fail(
      "Restore refused because the durable post-activation write witness is unavailable.",
    );
  }
  if (committedWriteCounter !== currentWriteCounter) {
    fail(
      "Restore refused because authoritative data changed after activation; preserve the database and repair forward.",
    );
  }
  if (
    counters.plan_activation_write_pause !== "1" ||
    counters.active_plan_integrity_blocked !== "1" ||
    counters.plan_activation_internal_write !== "0"
  ) {
    fail(
      "Restore refused because the fail-closed write-pause evidence is incomplete.",
    );
  }
  return {
    committedWriteCounter,
    currentWriteCounter,
    writePause: "1",
    integrityBlocked: "1",
    internalWrite: "0",
    noPostActivationWrites: true,
  };
}

/** Prints a bounded, non-secret recovery status. */
function inspect(dbPath: string, activationId: string): void {
  const db = new DatabaseSync(dbPath, { readOnly: true, timeout: 5_000 });
  try {
    verifyDatabase(db);
    const row = operation(db, activationId);
    const markers = Object.fromEntries(
      (db.prepare(
        `SELECT key, value FROM meta
         WHERE key IN (
           'plan_activation_write_pause',
             'active_plan_integrity_blocked',
             'plan_activation_internal_write',
             'authoritative_write_counter'
           ) ORDER BY key`,
      ).all() as Array<{ key: string; value: string }>).map((item) => [item.key, item.value]),
    );
    console.log(JSON.stringify({
      activationId,
      phase: row.phase,
      predecessorPlanId: row.predecessor_plan_id,
      successorPlanId: row.successor_plan_id,
      backupId: row.backup_id,
      backupPath: row.backup_path,
      backupSha256: row.backup_sha256,
      committedWriteCounter: row.committed_write_counter,
      markers,
    }, null, 2));
  } finally {
    db.close();
  }
}

/** Restores the verified pre-activation image and retains the failed database. */
function restore(dbPath: string, activationId: string, operator: string): void {
  const incident = new DatabaseSync(dbPath, { readOnly: true, timeout: 5_000 });
  let row: Operation;
  let writeSafetyProof: WriteSafetyProof;
  try {
    verifyDatabase(incident);
    row = operation(incident, activationId);
    writeSafetyProof = verifyNoPostActivationWrites(incident, row);
  } finally {
    incident.close();
  }
  const backupPath = String(row.backup_path ?? "");
  if (!backupPath || !path.isAbsolute(backupPath) || !fs.existsSync(backupPath)) {
    fail("The recorded pre-activation backup is unavailable.");
  }
  const expectedBackupId = `plan-activation-${activationId}`;
  if (
    String(row.backup_id ?? "") !== expectedBackupId ||
    path.basename(backupPath) !== `${expectedBackupId}.sqlite`
  ) {
    fail("The recorded backup identity does not match this activation.");
  }
  const recordedHash = String(row.backup_sha256 ?? "");
  if (!recordedHash || sha256(backupPath) !== recordedHash) {
    fail("The retained backup does not match its recorded SHA-256.");
  }
  const backupDb = new DatabaseSync(backupPath, { readOnly: true, timeout: 5_000 });
  try {
    verifyDatabase(backupDb);
    const predecessor = backupDb.prepare(
      "SELECT lifecycle_state FROM strategic_plans WHERE id = ?",
    ).get(Number(row.predecessor_plan_id)) as { lifecycle_state?: string } | undefined;
    const successor = backupDb.prepare(
      "SELECT lifecycle_state FROM strategic_plans WHERE id = ?",
    ).get(Number(row.successor_plan_id)) as { lifecycle_state?: string } | undefined;
    if (predecessor?.lifecycle_state !== "active" || successor?.lifecycle_state !== "draft") {
      fail("The backup is not the verified pre-activation plan state.");
    }
  } finally {
    backupDb.close();
  }

  const recoveryDir = path.join(path.dirname(dbPath), "plan-activation-recovery");
  fs.mkdirSync(recoveryDir, { recursive: true, mode: 0o700 });
  const recoveryId = crypto.randomUUID();
  const preservedPath = path.join(recoveryDir, `failed-${activationId}-${recoveryId}.sqlite`);
  fs.copyFileSync(dbPath, preservedPath, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(preservedPath, 0o600);
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${dbPath}${suffix}`;
    if (fs.existsSync(sidecar)) {
      const retainedSidecar = `${preservedPath}${suffix}`;
      fs.copyFileSync(sidecar, retainedSidecar, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(retainedSidecar, 0o600);
    }
  }
  const stagedPath = path.join(recoveryDir, `restore-${recoveryId}.sqlite`);
  fs.copyFileSync(backupPath, stagedPath, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(stagedPath, 0o600);
  const staged = new DatabaseSync(stagedPath, { timeout: 5_000 });
  try {
    verifyDatabase(staged);
    staged.prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('plan_activation_internal_write', '1')",
    ).run();
    staged.exec("BEGIN IMMEDIATE;");
    try {
      staged.prepare(
        `UPDATE plan_activation_operations
         SET phase = 'failed_precommit',
             failure_code = 'operator_restored_pre_activation_backup',
             updated_at = datetime('now')
         WHERE activation_id = ?`,
      ).run(activationId);
      staged.prepare(
        `INSERT INTO activation_recovery_audit_events (
           recovery_id, activation_id, backup_id, action, operator_snapshot,
           integrity_result, details_json
         ) VALUES (?, ?, ?, 'restore_pre_activation_backup', ?,
                   'verified_restored_pre_activation_state', ?)`,
      ).run(
        recoveryId,
        activationId,
        String(row.backup_id),
        operator,
        JSON.stringify({
          failedDatabasePreservedAt: preservedPath,
          restoredFrom: backupPath,
          restoredSha256: recordedHash,
          writeSafetyProof,
        }),
      );
      staged.exec(`
        INSERT OR REPLACE INTO meta (key, value)
          VALUES ('plan_activation_write_pause', '0');
        INSERT OR REPLACE INTO meta (key, value)
          VALUES ('plan_activation_internal_write', '0');
        INSERT OR REPLACE INTO meta (key, value)
          VALUES ('active_plan_integrity_blocked', '0');
      `);
      staged.exec("COMMIT;");
    } catch (error) {
      staged.exec("ROLLBACK;");
      throw error;
    }
  } finally {
    staged.close();
  }
  const displacedPath = path.join(recoveryDir, `displaced-${recoveryId}.sqlite`);
  fs.renameSync(dbPath, displacedPath);
  const displacedSidecars: Array<{ original: string; displaced: string }> = [];
  for (const suffix of ["-wal", "-shm"]) {
    const original = `${dbPath}${suffix}`;
    if (fs.existsSync(original)) {
      const displaced = `${displacedPath}${suffix}`;
      fs.renameSync(original, displaced);
      displacedSidecars.push({ original, displaced });
    }
  }
  try {
    fs.renameSync(stagedPath, dbPath);
  } catch (error) {
    fs.renameSync(displacedPath, dbPath);
    for (const sidecar of displacedSidecars) {
      fs.renameSync(sidecar.displaced, sidecar.original);
    }
    throw error;
  }
  fs.chmodSync(dbPath, 0o600);
  console.log(`[plan-recovery] restored activation ${activationId}; failed database retained at ${preservedPath}`);
}

const action = process.env.PLAN_RECOVERY_ACTION?.trim();
const activationId = process.env.PLAN_RECOVERY_ACTIVATION_ID?.trim();
if (!activationId) fail("PLAN_RECOVERY_ACTIVATION_ID is required.");
const dbPath = recoveryDatabasePath();
if (action === "inspect") {
  inspect(dbPath, activationId);
} else if (action === "restore-backup") {
  const operator = process.env.PLAN_RECOVERY_OPERATOR?.trim();
  if (!operator) fail("PLAN_RECOVERY_OPERATOR is required for restoration.");
  restore(dbPath, activationId, operator);
} else {
  fail("PLAN_RECOVERY_ACTION must be inspect or restore-backup.");
}
