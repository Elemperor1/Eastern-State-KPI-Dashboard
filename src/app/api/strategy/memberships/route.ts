import { type NextRequest, NextResponse } from "next/server";
import { z } from "@/lib/zod";
import { authErrorResponse, requireAdmin } from "@/features/auth/session";
import {
  StrategicGoalMembershipUpdateSchema,
} from "@/features/strategy";
import {
  createSuccessorStrategicGoalMembership,
  updateStrategicGoalMembership,
} from "@/features/strategy/server";
import { assertMutationRequest } from "@/lib/request-guard";
import {
  invalidStrategyInput,
  strategyEditErrorResponse,
} from "../_edit-response";

const SuccessorMembershipSchema = z
  .object({
    action: z.literal("create_successor"),
    predecessor_id: z.number().int().positive(),
    effective_start_year: z.number().int().min(1900).max(2100),
    role: z.enum(["required", "informational"]),
    weight: z.number().finite().positive(),
    display_order: z.number().int().nonnegative(),
  })
  .strict();

const PatchSchema = z.union([
  StrategicGoalMembershipUpdateSchema,
  SuccessorMembershipSchema,
]);

/** Implements the patch operation. */
export async function PATCH(req: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (error) {
    return authErrorResponse(error);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;

  const parsed = PatchSchema.safeParse(
    await req.json().catch(() => ({})),
  );
  if (!parsed.success) return invalidStrategyInput(z.flattenError(parsed.error));

  try {
    if ("action" in parsed.data) {
      return NextResponse.json(
        createSuccessorStrategicGoalMembership(
          {
            predecessor_id: parsed.data.predecessor_id,
            effective_start_year: parsed.data.effective_start_year,
            role: parsed.data.role,
            weight: parsed.data.weight,
            display_order: parsed.data.display_order,
          },
          user.id,
        ),
        { status: 201 },
      );
    }
    return NextResponse.json({
      membership: updateStrategicGoalMembership(parsed.data, user.id),
    });
  } catch (error) {
    const response = strategyEditErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
