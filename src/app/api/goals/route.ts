import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/features/auth/session";
import { assertMutationRequest } from "@/lib/request-guard";
import {
  CreateGoalSchema,
  DeleteGoalSchema,
  PatchGoalSchema,
  deleteGoal,
  listGoals,
  parseGoalListParams,
  toggleGoal,
  updateGoal,
  upsertGoal,
} from "@/features/goals";
import { getKPI } from "@/features/catalog/server";

function refreshedGoalsPayload(req: NextRequest) {
  const { throughMonth, year } = parseGoalListParams(req.nextUrl.searchParams);
  return { goals: listGoals({ throughMonth, year }) };
}

export async function POST(req: NextRequest) {
  let sessionUser;
  try {
    sessionUser = await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const parsed = CreateGoalSchema.safeParse(await req.json().catch(() => ({})));
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
    return NextResponse.json({ goal, ...refreshedGoalsPayload(req) }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create goal";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  let sessionUser;
  try {
    sessionUser = await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const parsed = PatchGoalSchema.safeParse(await req.json().catch(() => ({})));
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
  return NextResponse.json({ ok: true, ...refreshedGoalsPayload(req) });
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const parsed = DeleteGoalSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  deleteGoal(parsed.data.id);
  return NextResponse.json({ ok: true, ...refreshedGoalsPayload(req) });
}
