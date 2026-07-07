import type { IronSession, SessionOptions } from "iron-session";
import { getIronSession } from "iron-session";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_DISABLED } from "./auth-flag";
import type { SessionUser } from "./types";
import { BYPASS_USER_EMAIL, ensureSeedAdmin } from "@/features/auth/server";
import { findUserByEmail, findUserById } from "@/features/users/server";

export interface SessionData {
  user?: SessionUser;
  /** Unix-ms timestamp recorded at login. A session is valid only if
   *  issuedAt >= the user's live sessions_valid_after watermark; any
   *  security-sensitive account change (password reset/change, role
   *  change, disable/enable) bumps that watermark past issuedAt and
   *  thus invalidates this session (and every other session issued
   *  before the change). Deletion invalidates by row absence instead.
   *  See getCurrentUser(). */
  issuedAt?: number;
}

/**
 * Returns the real SessionUser row for the AUTH_DISABLED bypass account, so
 * downstream FKs (e.g. `entries.updated_by`) resolve to an existing user.
 * Idempotently upserts the row first so direct hits on dashboard routes
 * (which never touch the home-page module that calls ensureSeedAdmin) still
 * find a matching users.id. Cheap on the hot path: the second call is a
 * single SELECT by the unique email index.
 *
 * Note: this account's password_hash is rotated to an unguessable random
 * value on every ensureSeedAdmin() call. The login flow is blocked from
 * reaching it by a reserved-email check in verifyCredentials(), so the
 * stored hash is a defense-in-depth measure, not the only barrier.
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
    must_change_password: false,
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

/**
 * Re-validate the cookie session against the live DB and return the
 * authoritative, up-to-date SessionUser — or null if the session is
 * absent, stale, or belongs to a deleted / disabled user.
 *
 * This is the single chokepoint that enforces durable session
 * revocation (D8AD-CAN-001 req 6 / D8AD-CAN-003 req 3 + req 4) for
 * every authenticated request. The cookie may carry a user that was
 * valid at login time but has since been rotated/reset/disabled/
 * role-changed/deleted by an admin or by the user themselves on
 * another device. We re-read the row from the DB by its stable id
 * (NEVER by email — req 7) and apply three checks:
 *
 *   1. The user still exists. (A deleted user's cookie is destroyed.)
 *   2. The user is not disabled. (A disabled user's cookie is
 *      destroyed — req 4.)
 *   3. session.issuedAt >= user.sessions_valid_after. Any
 *      security-sensitive account change (password reset/change,
 *      role change, disable/enable) bumps the watermark past any
 *      session issued before it, so every prior session — including
 *      the one that performed the change — is invalidated (req 5).
 *      We destroy the stale cookie so the client re-authenticates.
 *
 * The role check ("no longer has the required role", req 4) is
 * applied downstream by requireAdmin against the DB-synced role
 * returned here — a downgraded admin's cookie carries the fresh
 * (downgraded) role, so admin APIs reject them. The watermark bump
 * on role change additionally clears their cookie outright.
 *
 * We also sync role / name / must_change_password from the DB back
 * into the cookie so a post-login admin role change or admin-issued
 * reset is reflected without a re-login (the must_change_password
 * flip is what drives the /setup-password redirect on the next
 * navigation).
 *
 * NOTE: this helper does NOT apply the must_change_password 403 gate.
 * That gate lives in requireSession/requireAdmin so the minimum-route
 * set (change-password, me, logout, login) can still see a must_change
 * user through getCurrentUser and let them complete the rotation.
 *
 * Returns the bypass user directly when AUTH_DISABLED is on.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  if (AUTH_DISABLED) return getBypassUser();
  const session = await getSession();
  if (!session.user) return null;
  const dbUser = findUserById(session.user.id);
  if (!dbUser) {
    // Deleted user: row gone → no session can revalidate. Clear the
    // invalid cookie (req 8) and treat as logged out.
    await session.destroy();
    return null;
  }
  if (dbUser.disabled) {
    // Disabled user: account is suspended → reject and clear the
    // cookie. The watermark was bumped at disable time too, but the
    // explicit disabled flag is a second, belt-and-braces gate so a
    // session issued moments before disablement (issuedAt >= the
    // pre-disable watermark) is still rejected.
    await session.destroy();
    return null;
  }
  const issuedAt = session.issuedAt ?? 0;
  if (issuedAt < dbUser.sessions_valid_after) {
    // A security-sensitive account change bumped the watermark past
    // this session's issuance time. Invalidate everywhere: destroy
    // the cookie and treat as logged out.
    await session.destroy();
    return null;
  }
  const synced: SessionUser = {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
    must_change_password: dbUser.must_change_password,
  };
  // Persist if the cookie's view is out of date, or if a legacy
  // session predates the issuedAt field (stamp it so future checks
  // have a concrete value rather than re-running this branch).
  const stale =
    session.user.role !== synced.role ||
    session.user.name !== synced.name ||
    session.user.must_change_password !== synced.must_change_password ||
    session.issuedAt === undefined;
  if (stale) {
    session.user = synced;
    if (session.issuedAt === undefined) session.issuedAt = issuedAt;
    await session.save();
  }
  return synced;
}

/**
 * Read-only variant of getCurrentUser for server components.
 *
 * In Next.js 15, `cookies()` from `next/headers` returns
 * `ReadonlyRequestCookies` when called in a server component — calling
 * `.set()` or `.delete()` on it throws.  getCurrentUser() calls
 * session.save() and session.destroy() to sync role/name and clear
 * revoked cookies, which is only legal in a Route Handler or Server
 * Action.
 *
 * This variant performs the same DB-backed revocation checks (deleted,
 * disabled, sessions_valid_after watermark) so a stale or revoked
 * session returns null → the page redirects to /login.  It never
 * touches the cookie, so cookie cleanup happens on the next Route
 * Handler call (API route, login, logout) instead.  The stale cookie
 * is overwritten on re-login, so there is no practical security gap.
 */
export async function getCurrentUserReadOnly(): Promise<SessionUser | null> {
  if (AUTH_DISABLED) return getBypassUser();
  const session = await getSession();
  if (!session.user) return null;
  const dbUser = findUserById(session.user.id);
  if (!dbUser) return null;
  if (dbUser.disabled) return null;
  const issuedAt = session.issuedAt ?? 0;
  if (issuedAt < dbUser.sessions_valid_after) return null;
  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
    must_change_password: dbUser.must_change_password,
  };
}

/** Throw 401-style helpers for route handlers. */
export async function requireSession(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError("Authentication required", 401);
  }
  // A logged-in user whose credential is still a temporary bootstrap /
  // admin-issued password may not use the application until they rotate
  // it. Block every data API behind requireSession/requireAdmin so a
  // user who bookmarks a deep link cannot bypass the forced rotation
  // page. The self-service change-password + logout + me routes do not
  // go through this helper, so rotation itself stays reachable.
  if (user.must_change_password) {
    throw new AuthError(
      "Password rotation required before normal application use.",
      403,
    );
  }
  return user;
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

/**
 * Translate a thrown AuthError into a consistent JSON response so every
 * protected API route answers unauthorized access with the same shape
 * and status (D8AD-CAN-003 req 8). 401 = no valid session (missing,
 * deleted, disabled, or revoked-by-watermark); 403 = authenticated but
 * insufficient (must_change still owed, or non-admin hitting an admin
 * route). Any non-AuthError thrown by the gate is treated as 401 — the
 * gates only throw AuthError, so this is a defensive default.
 *
 * Cookie clearing happens upstream in getCurrentUser (it destroys the
 * stale cookie before requireSession throws), so by the time this
 * returns 401 the invalid cookie has already been cleared from the
 * response where practical.
 */
export function authErrorResponse(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    if (err.status === 403) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
