import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/features/auth/session";
import { StrategicGoalMembershipUpdateSchema } from "@/features/strategy";
import { updateStrategicGoalMembership } from "@/features/strategy/server";
import { assertMutationRequest } from "@/lib/request-guard";
import {
  invalidStrategyInput,
  strategyEditErrorResponse,
} from "../_edit-response";

export async function PATCH(req: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (error) {
    return authErrorResponse(error);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;

  const parsed = StrategicGoalMembershipUpdateSchema.safeParse(
    await req.json().catch(() => ({})),
  );
  if (!parsed.success) return invalidStrategyInput(parsed.error.flatten());

  try {
    return NextResponse.json({
      membership: updateStrategicGoalMembership(parsed.data, user.id),
    });
  } catch (error) {
    const response = strategyEditErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
