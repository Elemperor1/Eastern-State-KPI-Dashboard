import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { getDb } from "./db";
import type { Role, SessionUser, User } from "./types";

const SALT_ROUNDS = 10;

/**
 * Reserved account identifiers that must never be reachable through the
 * normal login flow. These rows exist for internal use (FK targets, dev
 * bypass, system tasks) and have password hashes that no caller can match.
 * Centralized so verifyCredentials(), the seed routine, and any future
 * admin UI can agree on the same list.
 */
const RESERVED_EMAILS: ReadonlySet<string> = new Set(
  ["auth-disabled@local"].map((e) => e.toLowerCase()),
);

/** Public for callers that need to detect the bypass identity (UI, session, tests). */
export const BYPASS_USER_EMAIL = "auth-disabled@local";

function isReservedEmail(email: string): boolean {
  return RESERVED_EMAILS.has(email.toLowerCase().trim());
}

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
  if (isReservedEmail(email)) {
    // Reserved accounts (dev bypass, system tasks) must never be reachable
    // through the login route. Return null without consulting the DB so
    // timing/leak surface is identical to "no such user".
    return null;
  }
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
  const email = input.email.toLowerCase().trim();
  const name = input.name.trim();
  // For consistency with the upsert path (see repository.ts) we
  // re-read the row by its natural unique key (email) instead of
  // trusting `result.lastInsertRowid`. Plain INSERTs in node:sqlite
  // do reliably set lastInsertRowid to the new row, but a future
  // change that wraps this in an upsert or that runs through a
  // SAVEPOINT-containing transaction could break that assumption
  // silently. The key-based readback is robust to either case.
  db.prepare(
    `INSERT INTO users (email, name, password_hash, role)
     VALUES (?, ?, ?, ?)`,
  ).run(email, name, hash, input.role);
  const row = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email) as Record<string, unknown> | undefined;
  if (!row) {
    throw new Error(
      `createUser: row not found after insert for email=${email}`,
    );
  }
  return {
    id: Number(row.id),
    email: String(row.email),
    name: String(row.name),
    role: String(row.role) as Role,
    created_at: String(row.created_at),
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
 * Bcrypt hash of a per-process random 64-byte secret. Stored on the bypass
 * row so that even if `verifyCredentials()` were ever extended to look it
 * up, the chance of an attacker guessing the value is negligible. The
 * plaintext is held only in this process's memory for the duration of
 * `ensureSeedAdmin()` and is not persisted.
 */
function newBypassHash(): string {
  return bcrypt.hashSync(crypto.randomBytes(64).toString("base64"), SALT_ROUNDS);
}

/**
 * Stable id reserved for the AUTH_DISABLED bypass user. Picked so the row exists
 * before any seed-admin insert assigns autoincrement ids 1..N — when the bypass
 * row is upserted with this id, FK references from `monthly_entries.updated_by`
 * and `breakdown_entries.updated_by` resolve cleanly.
 */
export const BYPASS_USER_ID = -1;

/**
 * Generate a per-install random password. 24 chars from a 64-symbol
 * base64 alphabet ≈ 144 bits of entropy, well past any practical
 * brute-force threshold.
 *
 * The named seed accounts use a fresh value on every fresh-DB seed so
 * the runtime code path never contains a fixed plaintext. Operators
 * read the password once from the server's stdout line at first
 * startup, rotate it through `/admin/users`, and the seed is done.
 *
 * Implementation: encode 18 random bytes as base64 and take the first
 * 24 chars. 18 bytes is a multiple of 3, so the base64 output is
 * exactly 24 chars with no `=` padding. The 24 chars may include
 * `+` and `/` (base64's two non-alphanumeric chars) — these are
 * safe in JSON / form fields / password managers, even if not as
 * "URL-safe" as a pure alphanumeric would be. The trade-off is
 * guaranteed length: a previous implementation that filtered `+/=`
 * produced passwords of 17-24 chars depending on the random input.
 */
function generateSeedPassword(): string {
  return crypto.randomBytes(18).toString("base64").slice(0, 24);
}

export function ensureSeedAdmin(): void {
  const db = getDb();

  // Idempotent bypass-row upsert: a real `users` row whose id we can return
  // from getSession() while AUTH_DISABLED=true so FK constraints on
  // `*.updated_by` succeed. The hash is regenerated on every seed run so
  // (a) the value is never persisted to source control, and (b) any
  // pre-existing DB with the previously-documented hash is rotated to an
  // unguessable value on next startup. The plaintext is discarded.
  //
  // We use INSERT OR IGNORE then UPDATE so two concurrent calls (e.g.
  // during a Next.js dev hot reload) cannot both try to insert the
  // fixed `id: -1` row. The first call wins; the second becomes a
  // no-op insert that still triggers the UPDATE branch below and
  // rotates the hash, which is idempotent at the data level.
  const bypassHash = newBypassHash();
  db.prepare(
    `INSERT OR IGNORE INTO users (id, email, name, password_hash, role)
     VALUES (?, ?, ?, ?, 'admin')`,
  ).run(BYPASS_USER_ID, BYPASS_USER_EMAIL, "Auth Disabled", bypassHash);
  db.prepare(
    "UPDATE users SET password_hash = ?, role = 'admin', name = ? WHERE email = ?",
  ).run(bypassHash, "Auth Disabled", BYPASS_USER_EMAIL);

  const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as
    | Record<string, unknown>
    | undefined;
  const count = Number(row?.count ?? 0);
  // The bypass row above is always present; the named seed admins are only
  // created on a fresh DB (no users at all).
  if (count > 1) return;

  // Fresh DB: create the named seed accounts with per-install random
  // passwords. No plaintext is stored in source. The plaintext is
  // printed to stdout ONCE per fresh seed (skipped under NODE_ENV=test
  // so unit tests don't leak it into test output) and the operator is
  // expected to read it, rotate the password through `/admin/users`,
  // and forget it. Subsequent startups hit the `count > 1` guard above
  // and do not regenerate the accounts.
  const kerryPassword = generateSeedPassword();
  const zachPassword = generateSeedPassword();
  createUser({
    email: "kerry@easternstate.org",
    name: "Kerry Sautner",
    password: kerryPassword,
    role: "admin",
  });
  createUser({
    email: "zach@easternstate.org",
    name: "Zach Palmer",
    password: zachPassword,
    role: "viewer",
  });
  if (process.env.NODE_ENV !== "test") {
    console.log(
      `[seed] created named accounts on first run. ` +
        `Read these once, rotate them through /admin/users, and they are gone from the log forever:`,
    );
    console.log(`[seed]   kerry@easternstate.org  (admin)   ${kerryPassword}`);
    console.log(`[seed]   zach@easternstate.org   (viewer)  ${zachPassword}`);
  }
}
