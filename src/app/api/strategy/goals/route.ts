import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireAdmin } from "@/features/auth/session";
import {
  STRATEGIC_PLAN_END_YEAR,
  StrategicGoalSettingsUpdateSchema,
  StrategyEntityLifecycleSchema,
} from "@/features/strategy";
import {
  archiveStrategicGoal,
  createSuccessorStrategicGoal,
  getStrategicGoalRecord,
  restoreStrategicGoal,
  updateStrategicGoalSettings,
} from "@/features/strategy/server";
import { assertMutationRequest } from "@/lib/request-guard";
import {
  invalidStrategyInput,
  strategyEditErrorResponse,
} from "../_edit-response";

const PatchSchema = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("update"), update: StrategicGoalSettingsUpdateSchema })
    .strict(),
  z
    .object({
      action: z.literal("create_successor"),
      predecessor_id: z.number().int().positive(),
      effective_start_year: z.number().int().min(2025).max(STRATEGIC_PLAN_END_YEAR),
      update: StrategicGoalSettingsUpdateSchema,
    })
    .strict(),
  z
    .object({ action: z.literal("archive"), ...StrategyEntityLifecycleSchema.shape })
    .strict(),
  z
    .object({ action: z.literal("restore"), ...StrategyEntityLifecycleSchema.shape })
    .strict(),
]);

export async function PATCH(req: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (error) {
    return authErrorResponse(error);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return invalidStrategyInput(parsed.error.flatten());
  try {
    if (parsed.data.action === "update") {
      return NextResponse.json({
        goal: updateStrategicGoalSettings(parsed.data.update, user.id),
      });
    }
    if (parsed.data.action === "create_successor") {
      return NextResponse.json(
        createSuccessorStrategicGoal(
          {
            predecessor_id: parsed.data.predecessor_id,
            effective_start_year: parsed.data.effective_start_year,
            update: parsed.data.update,
          },
          user.id,
        ),
        { status: 201 },
      );
    }
    if (parsed.data.action === "archive") {
      archiveStrategicGoal(parsed.data.id, user.id);
    } else {
      restoreStrategicGoal(parsed.data.id, user.id);
    }
    return NextResponse.json({ goal: getStrategicGoalRecord(parsed.data.id) });
  } catch (error) {
    const response = strategyEditErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
