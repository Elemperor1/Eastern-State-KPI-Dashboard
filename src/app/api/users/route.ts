import { type NextRequest, NextResponse } from "next/server";
import { z } from "@/lib/zod";
import { NewPasswordSchema } from "@/lib/password-policy";
import { authErrorResponse, requireAdmin } from "@/features/auth/session";
import { assertMutationRequest } from "@/lib/request-guard";
import {
  CREDENTIAL_BODY_MAX_BYTES,
  readJsonBody,
} from "@/lib/request-body";
import {
  createUser,
  deleteUser,
  findUserById,
  listUsers,
  updateUserPassword,
  UserLifecycleGuardError,
  UserNotFoundError,
  UserSelfTargetError,
} from "@/features/users/server";

/** Implements the refreshed users payload operation. */
function refreshedUsersPayload() {
  return { users: listUsers() };
}

const CreateSchema = z.object({
  // Account-field maxima match the audit-snapshot caps the values are
  // copied into (actor_display_name 200 / actor_email 320, NOV-C2); the
  // password shares the credential ceiling (S025-C1).
  email: z.email().max(320),
  name: z.string().min(1).max(200),
  password: NewPasswordSchema,
  role: z.enum(["admin", "viewer", "board"]),
});

/** Implements the post operation. */
export async function POST(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const bodyResult = await readJsonBody(req, CREDENTIAL_BODY_MAX_BYTES);
  if (!bodyResult.ok) return bodyResult.response;
  const parsed = CreateSchema.safeParse(bodyResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: z.flattenError(parsed.error) }, { status: 400 });
  }
  try {
    // An admin-issued initial password is a TEMPORARY credential: the new
    // user must rotate it through /setup-password at first login, exactly
    // like an admin-issued reset (see PATCH below). This keeps a forgotten
    // "welcome" password from living forever.
    const user = createUser(
      { ...parsed.data, mustChangePassword: true },
      actor,
    );
    return NextResponse.json({ user, ...refreshedUsersPayload() }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && /unique constraint failed/i.test(err.message)) {
      return NextResponse.json(
        { error: "A user with that email already exists." },
        { status: 409 },
      );
    }
    // Never echo raw driver/database messages to the client.
    return NextResponse.json({ error: "Could not create user." }, { status: 400 });
  }
}

const UpdatePasswordSchema = z.object({
  id: z.number().int().positive(),
  password: NewPasswordSchema,
});

/** Implements the patch operation. */
export async function PATCH(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const bodyResult = await readJsonBody(req, CREDENTIAL_BODY_MAX_BYTES);
  if (!bodyResult.ok) return bodyResult.response;
  const parsed = UpdatePasswordSchema.safeParse(bodyResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const target = findUserById(parsed.data.id);
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  // An admin-issued password is a TEMPORARY credential: the user must
  // rotate it at next login. updateUserPassword sets
  // must_change_password = 1, which forces the user through
  // /setup-password before they can reach the dashboard.
  try {
    updateUserPassword(parsed.data.id, parsed.data.password, true, actor);
    return NextResponse.json({ ok: true, ...refreshedUsersPayload() });
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not reset password." }, { status: 400 });
  }
}

const DeleteSchema = z.object({ id: z.number().int().positive() });

/** Removes or resets the selected state. */
export async function DELETE(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;
  const parsed = DeleteSchema.safeParse(bodyResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  // Mirror the account-route self-target refusal: an admin deleting their
  // own account would invalidate their session mid-request and can orphan
  // administration when they are the last active admin.
  if (parsed.data.id === actor.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 400 },
    );
  }
  const target = findUserById(parsed.data.id);
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  try {
    deleteUser(parsed.data.id, actor);
    return NextResponse.json({ ok: true, ...refreshedUsersPayload() });
  } catch (err) {
    if (err instanceof UserSelfTargetError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof UserLifecycleGuardError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof UserNotFoundError) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not delete user." }, { status: 400 });
  }
}
