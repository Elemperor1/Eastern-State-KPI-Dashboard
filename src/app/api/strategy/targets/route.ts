import { type NextRequest, NextResponse } from "next/server";
import { z } from "@/lib/zod";
import { authErrorResponse, requireAdmin } from "@/features/auth/session";
import {
  StrategicTargetCreateSchema,
  StrategicTargetUpdateSchema,
  StrategyEntityLifecycleSchema,
  withExpectedRevision,
} from "@/features/strategy";
import {
  archiveTarget,
  createStrategicTarget,
  getTargetRecord,
  restoreTarget,
  updateStrategicTarget,
} from "@/features/strategy/server";
import { assertMutationRequest } from "@/lib/request-guard";
import { readJsonBody } from "@/lib/request-body";
import {
  invalidStrategyInput,
  strategyEditErrorResponse,
} from "../_edit-response";

const PatchSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("update"),
      update: withExpectedRevision(StrategicTargetUpdateSchema),
    })
    .strict(),
  z
    .object({ action: z.literal("archive"), ...StrategyEntityLifecycleSchema.shape })
    .strict(),
  z
    .object({ action: z.literal("restore"), ...StrategyEntityLifecycleSchema.shape })
    .strict(),
]);

/**
 * Parses a targets payload, mapping any non-Zod parse throw (such as a
 * recursion RangeError from deeply nested structured_target JSON,
 * S044-C4) to a generic 400 instead of an uncaught 500. The schema-level
 * depth/entry bound makes this unreachable in practice; it stays as a
 * fail-closed backstop.
 */
function safeParseTargetPayload<Schema extends z.ZodType>(
  schema: Schema,
  body: unknown,
) {
  try {
    return schema.safeParse(body);
  } catch {
    return null;
  }
}

/** Implements the authorize operation. */
async function authorize(req: NextRequest) {
  try {
    const user = await requireAdmin();
    return { user, response: assertMutationRequest(req) } as const;
  } catch (error) {
    return { user: null, response: authErrorResponse(error) } as const;
  }
}
/** Implements the post operation. */
export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if (auth.response) return auth.response;
  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;
  const parsed = safeParseTargetPayload(StrategicTargetCreateSchema, bodyResult.body);
  if (!parsed) return invalidStrategyInput({ formErrors: ["Invalid structured target."], fieldErrors: {} });
  if (!parsed.success) return invalidStrategyInput(z.flattenError(parsed.error));
  try {
    return NextResponse.json(
      { target: createStrategicTarget(parsed.data, auth.user!.id) },
      { status: 201 },
    );
  } catch (error) {
    const response = strategyEditErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

/** Implements the patch operation. */
export async function PATCH(req: NextRequest) {
  const auth = await authorize(req);
  if (auth.response) return auth.response;
  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;
  const parsed = safeParseTargetPayload(PatchSchema, bodyResult.body);
  if (!parsed) return invalidStrategyInput({ formErrors: ["Invalid structured target."], fieldErrors: {} });
  if (!parsed.success) return invalidStrategyInput(z.flattenError(parsed.error));
  try {
    if (parsed.data.action === "update") {
      return NextResponse.json({
        target: updateStrategicTarget(parsed.data.update, auth.user!.id),
      });
    }
    if (parsed.data.action === "archive") {
      archiveTarget(parsed.data.id, auth.user!.id);
    } else {
      restoreTarget(parsed.data.id, auth.user!.id);
    }
    return NextResponse.json({ target: getTargetRecord(parsed.data.id) });
  } catch (error) {
    const response = strategyEditErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
