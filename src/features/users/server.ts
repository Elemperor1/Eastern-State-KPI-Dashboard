import bcrypt from "bcryptjs";
import { getDb, transaction } from "@/lib/db";
import type { Role, User } from "@/lib/types";

const SALT_ROUNDS = 10;

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

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

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

export function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: Role;
  /** When true the account is created with a temporary credential
   *  that must be rotated at first login (bootstrap / invited users).
   *  Defaults to false for normal admin-created users. */
  mustChangePassword?: boolean;
}): User {
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
  return rowToUser(asUserRow(row)!);
}

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
): void {
  const db = getDb();
  const hash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
  const now = Date.now();
  transaction(() => {
    db.prepare(
      `UPDATE users
       SET password_hash = ?,
           must_change_password = ?,
           sessions_valid_after = MAX(?, sessions_valid_after + 1)
       WHERE id = ?`,
    ).run(hash, mustChange ? 1 : 0, now, id);
  });
}

/**
 * Change a user's role and bump the revocation watermark atomically and
 * monotonically so every currently issued session is invalidated immediately.
 */
export function updateUserRole(id: number, role: Role): void {
  const db = getDb();
  const now = Date.now();
  transaction(() => {
    db.prepare(
      `UPDATE users
       SET role = ?,
           sessions_valid_after = MAX(?, sessions_valid_after + 1)
       WHERE id = ?`,
    ).run(role, now, id);
  });
}

/**
 * Enable or disable a user account and bump the revocation watermark atomically
 * and monotonically.
 */
export function setUserDisabled(id: number, disabled: boolean): void {
  const db = getDb();
  const now = Date.now();
  transaction(() => {
    db.prepare(
      `UPDATE users
       SET disabled = ?,
           sessions_valid_after = MAX(?, sessions_valid_after + 1)
       WHERE id = ?`,
    ).run(disabled ? 1 : 0, now, id);
  });
}

/**
 * Delete a user. Deletion invalidates sessions by row absence; referencing
 * entry/audit rows are SET NULL by the database foreign-key rule.
 */
export function deleteUser(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}
