import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireAdmin } from "@/features/auth/session";
import {
  StrategicGoalSettingsUpdateSchema,
  StrategyEntityLifecycleSchema,
} from "@/features/strategy";
import {
  archiveStrategicGoal,
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
