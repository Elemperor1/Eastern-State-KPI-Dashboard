import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireAdmin, requireSession } from "@/lib/session";
import { assertMutationRequest } from "@/lib/request-guard";
import {
  deleteGoal,
  getKPI,
  listGoals,
  toggleGoal,
  updateGoal,
  upsertGoal,
} from "@/lib/repository";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
  } catch (err) {
    return authErrorResponse(err);
  }
  const sp = req.nextUrl.searchParams;
  const throughMonthRaw = sp.get("throughMonth");
  const throughMonth =
    throughMonthRaw !== null && Number.isFinite(Number(throughMonthRaw))
      ? Math.max(1, Math.min(12, Math.round(Number(throughMonthRaw))))
      : undefined;
  const yearRaw = sp.get("year");
  const year =
    yearRaw !== null && Number.isFinite(Number(yearRaw))
      ? Math.round(Number(yearRaw))
      : undefined;
  return NextResponse.json({ goals: listGoals({ throughMonth, year }) });
}

const CreateSchema = z.object({
  kpi_id: z.number().int().positive(),
  target_year: z.number().int().min(2000).max(2100),
  goal_type: z.enum(["pct", "number"]),
  target_value: z.number().finite(),
  enabled: z.boolean().optional(),
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
  const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  // Verify the KPI exists before upserting — SQLite's ON CONFLICT will
  // otherwise throw a raw FK error that surfaces as a generic 400.
  const kpi = getKPI(parsed.data.kpi_id);
  if (!kpi) {
    return NextResponse.json({ error: "KPI not found" }, { status: 404 });
  }
  try {
    const goal = upsertGoal({ ...parsed.data, updated_by: sessionUser.id });
    return NextResponse.json({ goal }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create goal";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

const PatchSchema = z.object({
  id: z.number().int().positive(),
  enabled: z.boolean(),
  // Optional target-definition fields. When any of these are supplied,
  // the goal's target is updated in place — not just the enabled flag.
  goal_type: z.enum(["pct", "number"]).optional(),
  target_value: z.number().finite().optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  let sessionUser;
  try {
    sessionUser = await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { id, enabled, goal_type, target_value, notes } = parsed.data;

  // If any target-definition fields are present, update them alongside
  // the enabled flag so the progress recalculates immediately.
  const hasTargetUpdate = goal_type !== undefined || target_value !== undefined || notes !== undefined;
  try {
    if (hasTargetUpdate) {
      updateGoal({ id, enabled, goal_type, target_value, notes, updated_by: sessionUser.id });
    } else {
      toggleGoal(id, enabled);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update goal";
    return NextResponse.json({ error: message }, { status: 400 });
  }
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