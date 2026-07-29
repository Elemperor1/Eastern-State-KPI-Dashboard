import { type NextRequest, NextResponse } from "next/server";
import { z } from "@/lib/zod";
import {
  NewPasswordSchema,
  PasswordVerifySchema,
} from "@/lib/password-policy";
import { verifyCredentials } from "@/features/auth/server";
import {
  updateUserPasswordIfCurrent,
  UserNotFoundError,
} from "@/features/users/server";
import { getCurrentUser, getSession } from "@/features/auth/session";
import { assertMutationRequest } from "@/lib/request-guard";
import { CREDENTIAL_BODY_MAX_BYTES, readJsonBody } from "@/lib/request-body";
import {
  clearFailures,
  lockedMsRemaining,
  pruneExpired,
  recordFailure,
} from "@/lib/login-throttle";
import { logAuthThrottle } from "@/lib/operational-log";

const ChangePasswordSchema = z
  .object({
    // Shared credential ceiling (S025-C1): bounds the synchronous bcryptjs
    // UTF-8 encode on both the reauthentication compare and the new hash.
    currentPassword: PasswordVerifySchema,
    newPassword: NewPasswordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    error: "The new password must be different from the current password.",
    path: ["newPassword"],
  });

/**
 * Self-service password rotation for the logged-in user.
 *
 * This is the endpoint the forced `/setup-password` page calls so a
 * user who logged in with a temporary bootstrap / admin-issued
 * credential can replace it with a permanent one of their own
 * choosing. Re-authenticating with the current password defends
 * against a stolen session cookie being used to silently swap in a
 * new password; the new password clears `must_change_password`, which
 * re-enables normal application use.
 *
 * D8AD-CAN-001 req 5 + req 6 / D8AD-CAN-003 req 5: the hash write,
 * the must_change flag clear, and the sessions_valid_after watermark
 * bump happen atomically in updateUserPassword's transaction. Bumping
 * the watermark invalidates EVERY session issued before the change
 * (issuedAt < new watermark) — including this actor's own current
 * session, which we destroy here so the user must re-authenticate
 * with the new password. A captured temp-credential session on
 * another device is invalidated the same way.
 */
export async function POST(req: NextRequest) {
  // getCurrentUser re-validates against the DB and applies the
  // sessions_valid_after watermark check. It does NOT apply the
  // must_change 403 gate (this route must stay reachable by the very
  // users who owe a rotation), so we enforce that gate ourselves below.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  // D8AD-CAN-004 hardening: shared CSRF guard (Origin/Referer +
  // exact application/json content-type + double-submit token).
  // Runs after authentication, before the body is parsed.
  const guard = assertMutationRequest(req);
  if (guard) return guard;

  // An account that is not on a temporary credential has no rotation
  // to perform here. (This also covers the AUTH_DISABLED bypass user,
  // which never carries must_change_password.)
  if (!user.must_change_password) {
    return NextResponse.json(
      { error: "No password rotation is required for this account." },
      { status: 400 },
    );
  }

  const bodyResult = await readJsonBody(req, CREDENTIAL_BODY_MAX_BYTES);
  if (!bodyResult.ok) return bodyResult.response;
  const parsed = ChangePasswordSchema.safeParse(bodyResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }
  const { currentPassword, newPassword } = parsed.data;

  // Credential-verification throttle, uniform with /api/auth/login but in
  // its own key space: the current-password compare is a full bcrypt
  // verification, and without a lockout a stolen must_change_password
  // session gets unlimited distinguishable online guesses at the current
  // credential. The lock is checked BEFORE the compare so throttled
  // attempts are cheap; a correct password clears the counter, exactly
  // like the login route's anti-lockout property.
  pruneExpired();
  const throttleKey = `pwchg:${user.email.toLowerCase().trim()}`;
  const lockedMs = lockedMsRemaining(throttleKey);
  if (lockedMs > 0) {
    logAuthThrottle("change_password_lockout");
    return NextResponse.json(
      {
        error:
          "Too many failed attempts. Please wait a few minutes and try again.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil(lockedMs / 1000))),
        },
      },
    );
  }

  // Re-authenticate so a captured session cookie alone cannot rotate
  // the password. verifyCredentials() rejects the reserved bypass
  // email, which is unreachable here anyway.
  const reauthenticated = await verifyCredentials(user.email, currentPassword);
  if (!reauthenticated) {
    const { lockedUntil } = recordFailure(throttleKey);
    if (lockedUntil > Date.now()) {
      logAuthThrottle("change_password_lockout");
    }
    // Uniform with /api/auth/login: the attempt that TRIPS the threshold
    // is a normal 401 with a Retry-After hint; subsequent attempts are
    // refused with 429 before the compare (above).
    const headers: Record<string, string> = {};
    if (lockedUntil > Date.now()) {
      headers["Retry-After"] = String(
        Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000)),
      );
    }
    return NextResponse.json(
      { error: "Your current password is incorrect." },
      { status: 401, headers },
    );
  }
  clearFailures(throttleKey);

  // Atomic: hash + must_change=0 + sessions_valid_after=now in one
  // transaction. The watermark bump invalidates all prior sessions.
  let changed: boolean;
  try {
    changed = updateUserPasswordIfCurrent(
      user.id,
      reauthenticated.passwordHash,
      newPassword,
      false,
      { id: user.id, email: user.email },
    );
  } catch (err) {
    // The account row vanished between session validation and the write
    // (narrow race): the session can never be valid again, so destroy it
    // and answer as if reauthentication failed rather than surfacing a 500.
    if (err instanceof UserNotFoundError) {
      const session = await getSession();
      session.destroy();
      return NextResponse.json(
        { error: "Your account is no longer available. Sign in again." },
        { status: 401 },
      );
    }
    throw err;
  }
  if (!changed) {
    const session = await getSession();
    session.destroy();
    return NextResponse.json(
      {
        error:
          "Your credential changed before this request completed. Sign in again.",
      },
      { status: 409 },
    );
  }

  // Destroy this actor's session too (req 6: invalidate sessions
  // issued "before or during" the replacement). The client must
  // re-authenticate with the new password. We do NOT keep the cookie
  // alive with a refreshed issuedAt — that would leave a session
  // issued "during" the replacement still valid, which the
  // requirement explicitly forbids.
  const session = await getSession();
  session.destroy();

  return NextResponse.json({ ok: true });
}
