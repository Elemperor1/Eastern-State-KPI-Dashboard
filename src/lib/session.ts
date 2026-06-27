import type { IronSession, SessionOptions } from "iron-session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { AUTH_DISABLED } from "./auth-flag";
import type { SessionUser } from "./types";
import { ensureSeedAdmin, findUserByEmail } from "./auth";

export interface SessionData {
  user?: SessionUser;
}

/**
 * Stable identifier for the AUTH_DISABLED bypass user. The matching row is
 * upserted by ensureSeedAdmin() and used here so FK references on
 * `monthly_entries.updated_by` and `breakdown_entries.updated_by` resolve to a
 * real users.id instead of an ad-hoc synthetic placeholder.
 */
export const BYPASS_USER_EMAIL = "auth-disabled@local";

/**
 * Returns the real SessionUser row for the AUTH_DISABLED bypass account, so
 * downstream FKs (e.g. `entries.updated_by`) resolve to an existing user.
 * Idempotently upserts the row first so direct hits on dashboard routes
 * (which never touch the home-page module that calls ensureSeedAdmin) still
 * find a matching users.id. Cheap on the hot path: the second call is a
 * single SELECT by the unique email index.
 */
export function getBypassUser(): SessionUser {
  ensureSeedAdmin();
  const row = findUserByEmail(BYPASS_USER_EMAIL);
  if (!row) {
    throw new Error(
      `Bypass user (${BYPASS_USER_EMAIL}) is missing; ensureSeedAdmin() should have created it.`,
    );
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
  };
}

function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or shorter than 32 chars. Set it in .env.local.",
    );
  }
  return {
    password,
    cookieName: process.env.SESSION_COOKIE_NAME || "eastern_state_kpi_session",
    cookieOptions: {
      // Use SESSION_SECURE env var to avoid build-time inlining of NODE_ENV.
      // Default true (production); set SESSION_SECURE=false for local HTTP testing.
      secure: process.env.SESSION_SECURE !== "false",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
  };
}

/** Get the current session from incoming cookies (server component / route handler). */
export async function getSession(): Promise<IronSession<SessionData>> {
  if (AUTH_DISABLED) {
    return {
      user: getBypassUser(),
      save: async () => {},
      destroy: async () => {},
    } as unknown as IronSession<SessionData>;
  }
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions());
}

/** Throw 401-style helpers for route handlers. */
export async function requireSession(): Promise<SessionUser> {
  if (AUTH_DISABLED) return getBypassUser();
  const session = await getSession();
  if (!session.user) {
    throw new AuthError("Authentication required", 401);
  }
  return session.user;
}

export async function requireAdmin(): Promise<SessionUser> {
  if (AUTH_DISABLED) return getBypassUser();
  const user = await requireSession();
  if (user.role !== "admin") {
    throw new AuthError("Admin privileges required", 403);
  }
  return user;
}

export class AuthError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "AuthError";
  }
}