import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireAdmin } from "@/lib/session";
import { assertMutationRequest } from "@/lib/request-guard";
import {
  findUserById,
  setUserDisabled,
  updateUserRole,
} from "@/lib/auth";

/**
 * Admin-only account-control endpoint for security-sensitive user
 * changes that are NOT password resets: role changes and account
 * disable/enable (D8AD-CAN-003 req 5). Each operation bumps the
 * user's `sessions_valid_after` watermark atomically (inside
 * updateUserRole / setUserDisabled), so every session the target
 * user currently holds is invalidated immediately and they must
 * re-authenticate under their new role / re-enabled account. A
 * disabled account additionally cannot log in at all
 * (verifyCredentials returns null) and is rejected by getCurrentUser
 * even if a cookie predates the watermark bump.
 *
 * The actor must be an active admin (requireAdmin). An admin may not
 * target their own account here: disabling or downgrading yourself
 * would invalidate your own session mid-request and lock you out
 * with no other admin to recover the account, so the guard refuses
 * the self-targeted change with a 400.
 */
const AccountSchema = z
  .object({
    id: z.number().int().positive(),
    role: z.enum(["admin", "viewer"]).optional(),
    disabled: z.boolean().optional(),
  })
  .refine((d) => d.role !== undefined || d.disabled !== undefined, {
    message: "Provide either a role or a disabled flag.",
  });

export async function PATCH(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const parsed = AccountSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { id, role, disabled } = parsed.data;

  // An admin cannot change their own role or disabled state — the
  // watermark bump would invalidate the very session making the
  // request, and a self-disable with no other admin is an
  // unrecoverable lockout.
  if (id === actor.id) {
    return NextResponse.json(
      { error: "You cannot change your own role or disabled state." },
      { status: 400 },
    );
  }

  const target = findUserById(id);
  if (!target) {
    // Generic 404 — a missing id is not an existence leak of a
    // *deleted former* user (the id was supplied by the admin UI from
    // a live listUsers() row), and we never confirm or deny a former
    // account here. The login route is the leak-sensitive surface and
    // it already answers identically for unknown vs wrong vs disabled.
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  try {
    if (role !== undefined && role !== target.role) {
      updateUserRole(id, role);
    }
    if (disabled !== undefined && disabled !== target.disabled) {
      setUserDisabled(id, disabled);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update account.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, user: findUserById(id) });
}