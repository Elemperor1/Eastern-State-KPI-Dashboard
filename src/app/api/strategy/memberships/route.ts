import { type NextRequest, NextResponse } from "next/server";
import { z } from "@/lib/zod";
import { authErrorResponse, requireAdmin } from "@/features/auth/session";
import {
  StrategicGoalMembershipUpdateSchema,
  withExpectedRevision,
} from "@/features/strategy";
import {
  createSuccessorStrategicGoalMembership,
  updateStrategicGoalMembership,
} from "@/features/strategy/server";
import { assertMutationRequest } from "@/lib/request-guard";
import { readJsonBody } from "@/lib/request-body";
import {
  invalidStrategyInput,
  strategyEditErrorResponse,
} from "../_edit-response";

const SuccessorMembershipSchema = z
  .object({
    action: z.literal("create_successor"),
    predecessor_id: z.number().int().positive(),
    expected_revision: z.string().min(1),
    effective_start_year: z.number().int().min(1900).max(2100),
    role: z.enum(["required", "informational"]),
    // Same domain-sane ceiling as the membership schemas in
    // features/strategy/validation.ts (S019-C1).
    weight: z.number().finite().positive().max(10_000),
    display_order: z.number().int().nonnegative(),
  })
  .strict();

const PatchSchema = z.union([
  withExpectedRevision(StrategicGoalMembershipUpdateSchema),
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

  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;
  const parsed = PatchSchema.safeParse(bodyResult.body);
  if (!parsed.success) return invalidStrategyInput(z.flattenError(parsed.error));

  try {
    if ("action" in parsed.data) {
      return NextResponse.json(
        createSuccessorStrategicGoalMembership(
          {
            predecessor_id: parsed.data.predecessor_id,
            expected_revision: parsed.data.expected_revision,
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
