import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireAdmin } from "@/features/auth/session";
import {
  MeasurementConfigurationCreateSchema,
  MeasurementConfigurationUpdateSchema,
  STRATEGIC_PLAN_END_YEAR,
  StrategyEntityLifecycleSchema,
} from "@/features/strategy";
import {
  archiveMeasurementConfig,
  createMeasurementConfiguration,
  createSuccessorMeasurementConfiguration,
  getMeasurementConfigRecord,
  restoreMeasurementConfig,
  updateMeasurementConfiguration,
} from "@/features/strategy/server";
import { assertMutationRequest } from "@/lib/request-guard";
import {
  invalidStrategyInput,
  strategyEditErrorResponse,
} from "../_edit-response";

const PatchSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("update"),
      update: MeasurementConfigurationUpdateSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("create_successor"),
      predecessor_id: z.number().int().positive(),
      successor: MeasurementConfigurationCreateSchema.refine(
        (successor) =>
          successor.effective_start_year >= 2025 &&
          successor.effective_start_year <= STRATEGIC_PLAN_END_YEAR &&
          successor.effective_end_year !== null &&
          successor.effective_end_year <= STRATEGIC_PLAN_END_YEAR,
        {
          message: "Successor definitions must stay within 2025–2029.",
          path: ["effective_start_year"],
        },
      ),
    })
    .strict(),
  z
    .object({ action: z.literal("archive"), ...StrategyEntityLifecycleSchema.shape })
    .strict(),
  z
    .object({ action: z.literal("restore"), ...StrategyEntityLifecycleSchema.shape })
    .strict(),
]);

async function authorize(req: NextRequest) {
  try {
    const user = await requireAdmin();
    return { user, response: assertMutationRequest(req) } as const;
  } catch (error) {
    return { user: null, response: authErrorResponse(error) } as const;
  }
}
export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if (auth.response) return auth.response;
  const parsed = MeasurementConfigurationCreateSchema.safeParse(
    await req.json().catch(() => ({})),
  );
  if (!parsed.success) return invalidStrategyInput(parsed.error.flatten());
  try {
    const configuration = createMeasurementConfiguration(
      parsed.data,
      auth.user!.id,
    );
    return NextResponse.json({ configuration }, { status: 201 });
  } catch (error) {
    const response = strategyEditErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await authorize(req);
  if (auth.response) return auth.response;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return invalidStrategyInput(parsed.error.flatten());
  try {
    if (parsed.data.action === "update") {
      return NextResponse.json({
        configuration: updateMeasurementConfiguration(
          parsed.data.update,
          auth.user!.id,
        ),
      });
    }
    if (parsed.data.action === "create_successor") {
      return NextResponse.json(
        createSuccessorMeasurementConfiguration(
          {
            predecessor_id: parsed.data.predecessor_id,
            successor: parsed.data.successor,
          },
          auth.user!.id,
        ),
        { status: 201 },
      );
    }
    if (parsed.data.action === "archive") {
      archiveMeasurementConfig(parsed.data.id, auth.user!.id);
    } else {
      restoreMeasurementConfig(parsed.data.id, auth.user!.id);
    }
    return NextResponse.json({
      configuration: getMeasurementConfigRecord(parsed.data.id),
    });
  } catch (error) {
    const response = strategyEditErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
