import { type NextRequest, NextResponse } from "next/server";
import { z } from "@/lib/zod";
import { authErrorResponse, requireAdmin } from "@/features/auth/session";
import { activateDraft } from "@/features/plans/server";
import { ActivateDraftSchema } from "@/features/plans/validation";
import { assertMutationRequest } from "@/lib/request-guard";
import { readJsonBody } from "@/lib/request-body";
import { planErrorResponse } from "../_response";

/** Atomically activates the exact reviewed Draft after verified backup. */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (error) {
    return authErrorResponse(error);
  }
  const guard = assertMutationRequest(req, { allowDuringPlanActivation: true });
  if (guard) return guard;
  const body = await readJsonBody(req);
  if (!body.ok) return body.response;
  const parsed = ActivateDraftSchema.safeParse(body.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the activation confirmation and try again.", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({
      activation: await activateDraft(parsed.data, user.id),
    });
  } catch (error) {
    const response = planErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
