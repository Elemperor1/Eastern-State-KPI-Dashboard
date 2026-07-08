import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  EntryPeriodMismatchError,
  deleteEntry,
  upsertEntry,
} from "@/features/metrics/server";
import { authErrorResponse, requireAdmin } from "@/features/auth/session";
import { assertMutationRequest } from "@/lib/request-guard";

const UpsertSchema = z.object({
  kpi_id: z.number().int().positive(),
  year: z.number().int().min(1900).max(2100),
  month: z.number().int().min(0).max(12),
  value: z.number().finite(),
  notes: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  let sessionUser;
  try {
    sessionUser = await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const parsed = UpsertSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const entry = upsertEntry({ ...parsed.data, updated_by: sessionUser.id });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    if (error instanceof EntryPeriodMismatchError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

const DeleteSchema = z.object({ id: z.number().int().positive() });

export async function DELETE(req: NextRequest) {
  let sessionUser;
  try {
    sessionUser = await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const parsed = DeleteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  deleteEntry(parsed.data.id, sessionUser.id);
  return NextResponse.json({ ok: true });
}
