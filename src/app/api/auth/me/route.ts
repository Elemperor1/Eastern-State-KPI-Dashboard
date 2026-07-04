import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ensureCsrfCookie } from "@/lib/request-guard";

/**
 * Returns the validated, DB-synced current user — or null if there is
 * no session or the session has been invalidated by a security-
 * sensitive account change (issuedAt < sessions_valid_after) or by
 * deletion/disablement. This is a minimum-route endpoint reachable by
 * must_change users (the /setup-password page uses it to decide where
 * to route), so it must NOT apply the must_change 403 gate that
 * requireSession does — it only reports the flag so the client can
 * navigate accordingly.
 *
 * D8AD-CAN-004 hardening: this endpoint also (idempotently) issues the
 * double-submit CSRF cookie. It is a safe, authenticated read called on
 * every page load, so it is the natural place to ensure the cookie is
 * present before the client attempts any mutation — including for
 * sessions established before this hardening shipped, and for the
 * AUTH_DISABLED dev bypass (which has no login flow to set it).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const res = NextResponse.json({ user: user ?? null }, { status: 200 });
  // Issue the double-submit CSRF cookie (D8AD-CAN-004 hardening).
  ensureCsrfCookie(req, res);
  return res;
}