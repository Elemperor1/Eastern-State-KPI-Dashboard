import { type NextRequest, NextResponse } from "next/server";
import { z } from "@/lib/zod";
import { verifyCredentials } from "@/features/auth/server";
import { updateUserPassword } from "@/features/users/server";
import { getCurrentUser, getSession } from "@/features/auth/session";
import { assertMutationRequest } from "@/lib/request-guard";

const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
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

  const parsed = ChangePasswordSchema.safeParse(
    await req.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }
  const { currentPassword, newPassword } = parsed.data;

  // Re-authenticate so a captured session cookie alone cannot rotate
  // the password. verifyCredentials() rejects the reserved bypass
  // email, which is unreachable here anyway.
  const reauthenticated = await verifyCredentials(user.email, currentPassword);
  if (!reauthenticated) {
    return NextResponse.json(
      { error: "Your current password is incorrect." },
      { status: 401 },
    );
  }

  // Atomic: hash + must_change=0 + sessions_valid_after=now in one
  // transaction. The watermark bump invalidates all prior sessions.
  updateUserPassword(user.id, newPassword, false);

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
