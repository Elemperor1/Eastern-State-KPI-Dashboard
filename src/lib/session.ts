import type { IronSession, SessionOptions } from "iron-session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { AUTH_DISABLED } from "./auth-flag";
import type { SessionUser } from "./types";

export interface SessionData {
  user?: SessionUser;
}

const BYPASS_USER: SessionUser = {
  id: 0,
  email: "auth-disabled@local",
  name: "Auth Disabled",
  role: "admin",
};

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
      user: BYPASS_USER,
      save: async () => {},
      destroy: async () => {},
    } as unknown as IronSession<SessionData>;
  }
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions());
}

/** Throw 401-style helpers for route handlers. */
export async function requireSession(): Promise<SessionUser> {
  if (AUTH_DISABLED) return BYPASS_USER;
  const session = await getSession();
  if (!session.user) {
    throw new AuthError("Authentication required", 401);
  }
  return session.user;
}

export async function requireAdmin(): Promise<SessionUser> {
  if (AUTH_DISABLED) return BYPASS_USER;
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