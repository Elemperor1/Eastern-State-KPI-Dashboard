import type { IronSession, SessionOptions } from "iron-session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import type { SessionUser } from "./types";

export interface SessionData {
  user?: SessionUser;
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
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
  };
}

/** Get the current session from incoming cookies (server component / route handler). */
export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions());
}

/** Throw 401-style helpers for route handlers. */
export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session.user) {
    throw new AuthError("Authentication required", 401);
  }
  return session.user;
}

export async function requireAdmin(): Promise<SessionUser> {
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