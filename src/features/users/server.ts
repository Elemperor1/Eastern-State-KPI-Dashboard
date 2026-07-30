import bcrypt from "bcryptjs";
import { isReservedAuthEmail } from "@/lib/reserved-auth-identities";
import { getDb, transaction, type DB } from "@/lib/db";
import type { Role, User } from "@/lib/types";

const SALT_ROUNDS = 10;

/**
 * Error thrown when an account mutation is refused because it would remove
 * the last active administrator or target the actor's own account. Routes
 * map this to 409 (guard refusals are operator-facing and safe to show).
 */
export class UserLifecycleGuardError extends Error {}

/**
 * Error thrown when an account mutation targets the actor's own account.
 * A specialization of UserLifecycleGuardError so routes can answer 400
 * (client error on the request itself) while genuine guard refusals stay
 * 409 Conflict.
 */
export class UserSelfTargetError extends UserLifecycleGuardError {}

/** Error thrown when an account mutation targets a missing account. */
export class UserNotFoundError extends Error {}

/**
 * The authenticated principal responsible for a user lifecycle mutation.
 * `null` (or an omitted actor) records a System-attributed event — used by
 * seed/bootstrap and operator CLI flows that act outside a session.
 */
export interface UserLifecycleActor {
  id: number | null;
  email: string | null;
}

export type UserLifecycleEventType =
  | "create"
  | "password_reset"
  | "password_change"
  | "role_change"
  | "disable"
  | "enable"
  | "delete";

interface UserLifecycleSubject {
  id: number;
  email: string;
  name: string;
  role: Role;
  disabled: boolean;
  created_at: string;
}

/**
 * Appends one immutable user lifecycle audit event. Callers must invoke this
 * inside the same transaction as the mutation it describes so the audit row
 * and the change commit or roll back together. NEVER pass password hashes or
 * credentials in previousValue/newValue.
 */
function recordUserLifecycleEvent(
  db: DB,
  input: {
    eventType: UserLifecycleEventType;
    subject: UserLifecycleSubject;
    actor?: UserLifecycleActor | null;
    previousValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
  },
): void {
  db.prepare(
    `INSERT INTO user_lifecycle_audit_events (
       subject_user_id, subject_email_snapshot, subject_name_snapshot,
       subject_role_snapshot, event_type, previous_value_json, new_value_json,
       actor_id, actor_email_snapshot
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.subject.id,
    input.subject.email,
    input.subject.name,
    input.subject.role,
    input.eventType,
    input.previousValue == null ? null : JSON.stringify(input.previousValue),
    input.newValue == null ? null : JSON.stringify(input.newValue),
    input.actor?.id ?? null,
    input.actor?.email ?? "System",
  );
}

/**
 * Reads the mutation subject inside the caller's transaction, throwing a
 * typed UserNotFoundError when the account no longer exists so routes can
 * answer 404 instead of silently no-oping.
 */
function readSubjectForUpdate(db: DB, id: number): UserLifecycleSubject {
  const row = asUserRow(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
  if (!row) {
    throw new UserNotFoundError("User not found.");
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    disabled: row.disabled !== 0,
    created_at: row.created_at,
  };
}

/**
 * Refuses a role change, disable, or deletion that would remove the LAST
 * active administrator (D8AD zero-admin guard). Must run inside the same
 * transaction as the mutation it protects: the app holds a single writer
 * connection, so the check and the write are atomic with respect to every
 * other application write. Without this guard a single self-inflicted or
 * raced admin removal leaves zero admins, and the only recovery is
 * out-of-band database surgery.
 */
function assertNotLastActiveAdmin(
  db: DB,
  subjectId: number,
  action: string,
): void {
  const subject = db
    .prepare("SELECT role, disabled FROM users WHERE id = ?")
    .get(subjectId) as { role: Role; disabled: number } | undefined;
  if (!subject || subject.role !== "admin" || Number(subject.disabled) !== 0) {
    return;
  }
  const others = db
    .prepare(
      `SELECT email FROM users
       WHERE role = 'admin' AND disabled = 0 AND id != ?`,
    )
    .all(subjectId) as { email: string }[];
  const hasOtherDurableAdmin = others.some(
    ({ email }) => !isReservedAuthEmail(email),
  );
  if (!hasOtherDurableAdmin) {
    throw new UserLifecycleGuardError(
      `Refusing to ${action} the last active administrator. ` +
        `Promote or re-enable another admin first; operator recovery is npm run setup:admin.`,
    );
  }
}

interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  role: Role;
  created_at: string;
  must_change_password: number;
  disabled: number;
  sessions_valid_after: number;
}

export interface UserCredentialRecord {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  role: Role;
  must_change_password: boolean;
  disabled: boolean;
  sessions_valid_after: number;
}

/** Implements the as user row operation. */
function asUserRow(row: Record<string, unknown> | undefined): UserRow | undefined {
  if (!row) return undefined;
  return {
    id: Number(row.id),
    email: String(row.email),
    name: String(row.name),
    password_hash: String(row.password_hash),
    role: String(row.role) as Role,
    created_at: String(row.created_at),
    must_change_password: Number(row.must_change_password ?? 0),
    disabled: Number(row.disabled ?? 0),
    sessions_valid_after: Number(row.sessions_valid_after ?? 0),
  };
}

/** Implements the row to user operation. */
function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    created_at: row.created_at,
    must_change_password: row.must_change_password !== 0,
    disabled: row.disabled !== 0,
    sessions_valid_after: row.sessions_valid_after,
  };
}

/** Implements the row to credential record operation. */
function rowToCredentialRecord(row: UserRow): UserCredentialRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    password_hash: row.password_hash,
    role: row.role,
    must_change_password: row.must_change_password !== 0,
    disabled: row.disabled !== 0,
    sessions_valid_after: row.sessions_valid_after,
  };
}

/** Builds email. */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/** Retrieves user by email. */
export function findUserByEmail(email: string): User | null {
  const db = getDb();
  const row = asUserRow(
    db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(normalizeEmail(email)),
  );
  return row ? rowToUser(row) : null;
}

/** Look up a user by id for session revalidation and account-management flows. */
export function findUserById(id: number): User | null {
  const db = getDb();
  const row = asUserRow(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
  return row ? rowToUser(row) : null;
}

/** Retrieves user credential record by email. */
export function findUserCredentialRecordByEmail(
  email: string,
): UserCredentialRecord | null {
  const db = getDb();
  const row = asUserRow(
    db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(normalizeEmail(email)),
  );
  return row ? rowToCredentialRecord(row) : null;
}

/** Builds user. */
export function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: Role;
  /** When true the account is created with a temporary credential
   *  that must be rotated at first login (bootstrap / invited users).
   *  The library default is false; the admin API always passes true so
   *  UI-created accounts rotate at first login. */
  mustChangePassword?: boolean;
}, actor?: UserLifecycleActor | null): User {
  const db = getDb();
  const hash = bcrypt.hashSync(input.password, SALT_ROUNDS);
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const mustChange = input.mustChangePassword ? 1 : 0;
  // Stamp the session-revocation watermark at creation time so the
  // session validator has a baseline to compare the first session's
  // issuedAt against. Date.now() is the same value the login route
  // will record as session.issuedAt, and a session is valid iff
  // issuedAt >= this watermark, so a session issued moments after
  // creation is valid.
  const now = Date.now();
  // Use the same key-based readback pattern as conflict-capable metric
  // writes: re-read the row by its natural unique key (email) instead of
  // trusting `result.lastInsertRowid`. Plain INSERTs in node:sqlite
  // do reliably set lastInsertRowid to the new row, but a future
  // change that wraps this in an upsert or that runs through a
  // SAVEPOINT-containing transaction could break that assumption
  // silently. The key-based readback is robust to either case.
  return transaction(() => {
    db.prepare(
      `INSERT INTO users (email, name, password_hash, role, must_change_password, sessions_valid_after)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(email, name, hash, input.role, mustChange, now);
    const row = db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email) as Record<string, unknown> | undefined;
    if (!row) {
      throw new Error(
        `createUser: row not found after insert for email=${email}`,
      );
    }
    const subject = asUserRow(row)!;
    recordUserLifecycleEvent(db, {
      eventType: "create",
      subject: {
        id: subject.id,
        email: subject.email,
        name: subject.name,
        role: subject.role,
        disabled: subject.disabled !== 0,
        created_at: subject.created_at,
      },
      actor,
      newValue: {
        email,
        name,
        role: input.role,
        must_change_password: mustChange === 1,
      },
    });
    return rowToUser(subject);
  });
}

/** Retrieves users. */
export function listUsers(): User[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM users ORDER BY created_at ASC")
    .all() as Record<string, unknown>[];
  return rows
    .map((r) => asUserRow(r))
    .filter((r): r is UserRow => r !== undefined)
    .map(rowToUser);
}

/**
 * Set a user's password. `mustChange` controls the must_change_password flag.
 *
 * The hash write, the flag write, and the sessions_valid_after watermark bump
 * all run in a single transaction so a torn update can never leave a row with a
 * new hash but stale revocation state. The SQL bump is strictly monotonic: even
 * when a session and this change share the same Date.now() millisecond, the new
 * watermark is at least the previous value + 1 and therefore revokes it.
 */
export function updateUserPassword(
  id: number,
  newPassword: string,
  mustChange: boolean,
  actor?: UserLifecycleActor | null,
): void {
  const db = getDb();
  const hash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
  const now = Date.now();
  transaction(() => {
    const subject = readSubjectForUpdate(db, id);
    db.prepare(
      `UPDATE users
       SET password_hash = ?,
           must_change_password = ?,
           sessions_valid_after = MAX(?, sessions_valid_after + 1)
       WHERE id = ?`,
    ).run(hash, mustChange ? 1 : 0, now, id);
    recordUserLifecycleEvent(db, {
      eventType: "password_reset",
      subject,
      actor,
      newValue: { must_change_password: mustChange },
    });
  });
}

/**
 * Replace a password only if the live credential still matches the hash that
 * was reauthenticated. This binds proof and write into one SQLite statement,
 * so an administrator reset that wins the race cannot be overwritten by a
 * stale self-service request.
 */
export function updateUserPasswordIfCurrent(
  id: number,
  expectedPasswordHash: string,
  newPassword: string,
  mustChange: boolean,
  actor?: UserLifecycleActor | null,
): boolean {
  const db = getDb();
  const hash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
  const now = Date.now();
  return transaction(() => {
    const subject = readSubjectForUpdate(db, id);
    const result = db.prepare(
      `UPDATE users
       SET password_hash = ?,
           must_change_password = ?,
           sessions_valid_after = MAX(?, sessions_valid_after + 1)
       WHERE id = ? AND password_hash = ?`,
    ).run(hash, mustChange ? 1 : 0, now, id, expectedPasswordHash);
    if (result.changes !== 1) {
      return false;
    }
    recordUserLifecycleEvent(db, {
      eventType: "password_change",
      subject,
      actor,
      newValue: { must_change_password: mustChange },
    });
    return true;
  });
}

/**
 * Change a user's role and bump the revocation watermark atomically and
 * monotonically so every currently issued session is invalidated immediately.
 */
export function updateUserRole(
  id: number,
  role: Role,
  actor?: UserLifecycleActor | null,
): void {
  const db = getDb();
  const now = Date.now();
  transaction(() => {
    const subject = readSubjectForUpdate(db, id);
    if (subject.role === role) {
      return;
    }
    if (role !== "admin") {
      assertNotLastActiveAdmin(db, id, "change the role of");
    }
    db.prepare(
      `UPDATE users
       SET role = ?,
           sessions_valid_after = MAX(?, sessions_valid_after + 1)
       WHERE id = ?`,
    ).run(role, now, id);
    recordUserLifecycleEvent(db, {
      eventType: "role_change",
      subject,
      actor,
      previousValue: { role: subject.role },
      newValue: { role },
    });
  });
}

/**
 * Enable or disable a user account and bump the revocation watermark atomically
 * and monotonically.
 */
export function setUserDisabled(
  id: number,
  disabled: boolean,
  actor?: UserLifecycleActor | null,
): void {
  const db = getDb();
  const now = Date.now();
  transaction(() => {
    const subject = readSubjectForUpdate(db, id);
    if (disabled) {
      assertNotLastActiveAdmin(db, id, "disable");
    }
    db.prepare(
      `UPDATE users
       SET disabled = ?,
           sessions_valid_after = MAX(?, sessions_valid_after + 1)
       WHERE id = ?`,
    ).run(disabled ? 1 : 0, now, id);
    recordUserLifecycleEvent(db, {
      eventType: disabled ? "disable" : "enable",
      subject,
      actor,
      previousValue: { disabled: subject.disabled },
      newValue: { disabled },
    });
  });
}

/**
 * Delete a user. Deletion invalidates sessions by row absence; referencing
 * entry/audit rows are SET NULL by the database foreign-key rule. The
 * deletion is refused when it targets the actor's own account or the last
 * active administrator, and a missing account raises UserNotFoundError so
 * routes answer 404 instead of reporting a phantom success. An immutable
 * lifecycle audit event with the full non-secret subject snapshot is
 * written in the same transaction BEFORE the row is removed.
 */
export function deleteUser(
  id: number,
  actor?: UserLifecycleActor | null,
): void {
  const db = getDb();
  transaction(() => {
    const subject = readSubjectForUpdate(db, id);
    if (actor?.id != null && actor.id === id) {
      throw new UserSelfTargetError(
        "You cannot delete your own account.",
      );
    }
    assertNotLastActiveAdmin(db, id, "delete");
    recordUserLifecycleEvent(db, {
      eventType: "delete",
      subject,
      actor,
      previousValue: {
        email: subject.email,
        name: subject.name,
        role: subject.role,
        disabled: subject.disabled,
        created_at: subject.created_at,
      },
    });
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
  });
}
