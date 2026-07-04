import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireAdmin, requireSession } from "@/lib/session";
import { assertMutationRequest } from "@/lib/request-guard";
import {
  deleteGoal,
  listGoals,
  toggleGoal,
  upsertGoal,
} from "@/lib/repository";

export async function GET() {
  try {
    await requireSession();
  } catch (err) {
    return authErrorResponse(err);
  }
  return NextResponse.json({ goals: listGoals() });
}

const CreateSchema = z.object({
  kpi_id: z.number().int().positive(),
  target_year: z.number().int().min(2000).max(2100),
  goal_type: z.enum(["pct", "number"]),
  target_value: z.number(),
  enabled: z.boolean().optional(),
  notes: z.string().nullable().optional(),
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
    const goal = upsertGoal(parsed.data);
    return NextResponse.json({ goal }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create goal";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

const PatchSchema = z.object({
  id: z.number().int().positive(),
  enabled: z.boolean(),
});

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { id, enabled } = parsed.data;
  toggleGoal(id, enabled);
  return NextResponse.json({ ok: true });
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
  deleteGoal(parsed.data.id);
  return NextResponse.json({ ok: true });
}