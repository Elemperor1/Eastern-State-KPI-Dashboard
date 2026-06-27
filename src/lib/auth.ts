import bcrypt from "bcryptjs";
import { getDb } from "./db";
import type { Role, SessionUser, User } from "./types";

const SALT_ROUNDS = 10;

interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  role: Role;
  created_at: string;
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
  };
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    created_at: row.created_at,
  };
}

export function findUserByEmail(email: string): User | null {
  const db = getDb();
  const row = asUserRow(
    db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email.toLowerCase().trim()),
  );
  return row ? rowToUser(row) : null;
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const db = getDb();
  const row = asUserRow(
    db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email.toLowerCase().trim()),
  );
  if (!row) return null;
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
  };
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: Role;
}): User {
  const db = getDb();
  const hash = bcrypt.hashSync(input.password, SALT_ROUNDS);
  const result = db
    .prepare(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES (?, ?, ?, ?)`,
    )
    .run(input.email.toLowerCase().trim(), input.name.trim(), hash, input.role);
  return {
    id: Number(result.lastInsertRowid),
    email: input.email.toLowerCase().trim(),
    name: input.name.trim(),
    role: input.role,
    created_at: new Date().toISOString(),
  };
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

export function updateUserPassword(id: number, newPassword: string): void {
  const db = getDb();
  const hash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, id);
}

export function deleteUser(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

/**
 * Bcrypt hash of the synthetic placeholder password "__bypass_disabled_not_a_real_password__".
 * Kept as a constant so the seed is idempotent without re-hashing at runtime.
 * The plain-text value is intentionally not a credential anyone can sign in with.
 */
const BYPASS_PASSWORD_HASH =
  "$2a$10$cl80j8yESM1p1sDXfdNqfuoPJg53icrtO6s/Mgoun4KJfUV6ULzgK";

/**
 * Stable id reserved for the AUTH_DISABLED bypass user. Picked so the row exists
 * before any seed-admin insert assigns autoincrement ids 1..N — when the bypass
 * row is upserted with this id, FK references from `monthly_entries.updated_by`
 * and `breakdown_entries.updated_by` resolve cleanly.
 */
export const BYPASS_USER_ID = -1;

export function ensureSeedAdmin(): void {
  const db = getDb();

  // Idempotent bypass-row upsert: a real `users` row whose id we can return
  // from getSession() while AUTH_DISABLED=true so FK constraints on
  // `*.updated_by` succeed. The placeholder hash above is bcrypt but not a
  // real credential — there is no login flow that can use it.
  const existingBypass = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get("auth-disabled@local") as { id: number } | undefined;
  if (existingBypass) {
    db.prepare(
      "UPDATE users SET password_hash = ?, role = 'admin', name = ? WHERE email = ?",
    ).run(BYPASS_PASSWORD_HASH, "Auth Disabled", "auth-disabled@local");
  } else {
    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, role)
       VALUES (?, ?, ?, ?, 'admin')`,
    ).run(
      BYPASS_USER_ID,
      "auth-disabled@local",
      "Auth Disabled",
      BYPASS_PASSWORD_HASH,
    );
  }

  const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as
    | Record<string, unknown>
    | undefined;
  const count = Number(row?.count ?? 0);
  // The bypass row above is always present; the named seed admins are only
  // created on a fresh DB (no users at all).
  if (count > 1) return;
  createUser({
    email: "kerry@easternstate.org",
    name: "Kerry Sautner",
    password: "KerryAdmin!2026",
    role: "admin",
  });
  createUser({
    email: "zach@easternstate.org",
    name: "Zach Palmer",
    password: "ZachView!2026",
    role: "viewer",
  });
}