import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  BreakdownEntryConflictError,
  BreakdownEntryNotFoundError,
  deleteBreakdown,
  upsertBreakdown,
} from "@/features/metrics/server";
import { authErrorResponse, requireAdmin } from "@/features/auth/session";
import { assertMutationRequest } from "@/lib/request-guard";

const UpsertSchema = z.object({
  id: z.number().int().positive().nullable().optional(),
  kpi_id: z.number().int().positive(),
  year: z.number().int().min(1900).max(2100),
  month: z.number().int().min(0).max(12).optional(),
  label: z.string().min(1),
  value: z.number().finite(),
  sort_order: z.number().int().optional(),
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
    const breakdown = upsertBreakdown({
      ...parsed.data,
      updated_by: sessionUser.id,
    });
    return NextResponse.json({ breakdown }, { status: 201 });
  } catch (err) {
    if (err instanceof BreakdownEntryNotFoundError) {
      return NextResponse.json(
        { error: "Breakdown entry not found." },
        { status: 404 },
      );
    }
    if (err instanceof BreakdownEntryConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
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
  deleteBreakdown(parsed.data.id, sessionUser.id);
  return NextResponse.json({ ok: true });
}
