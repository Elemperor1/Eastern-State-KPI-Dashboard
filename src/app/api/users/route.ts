import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireAdmin } from "@/features/auth/session";
import { assertMutationRequest } from "@/lib/request-guard";
import {
  createUser,
  deleteUser,
  listUsers,
  updateUserPassword,
} from "@/features/users/server";

function refreshedUsersPayload() {
  return { users: listUsers() };
}

const CreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(["admin", "viewer"]),
});

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const user = createUser(parsed.data);
    return NextResponse.json({ user, ...refreshedUsersPayload() }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create user";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

const UpdatePasswordSchema = z.object({
  id: z.number().int().positive(),
  password: z.string().min(8),
});

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const parsed = UpdatePasswordSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  // An admin-issued password is a TEMPORARY credential: the user must
  // rotate it at next login. updateUserPassword sets
  // must_change_password = 1, which forces the user through
  // /setup-password before they can reach the dashboard.
  updateUserPassword(parsed.data.id, parsed.data.password, true);
  return NextResponse.json({ ok: true, ...refreshedUsersPayload() });
}

const DeleteSchema = z.object({ id: z.number().int().positive() });

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const parsed = DeleteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  deleteUser(parsed.data.id);
  return NextResponse.json({ ok: true, ...refreshedUsersPayload() });
}
