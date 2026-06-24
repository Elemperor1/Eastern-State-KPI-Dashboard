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

export function ensureSeedAdmin(): void {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as
    | Record<string, unknown>
    | undefined;
  const count = Number(row?.count ?? 0);
  if (count > 0) return;
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