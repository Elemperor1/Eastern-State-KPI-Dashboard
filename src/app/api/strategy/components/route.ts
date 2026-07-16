import { type NextRequest, NextResponse } from "next/server";
import { z } from "@/lib/zod";
import { authErrorResponse, requireAdmin } from "@/features/auth/session";
import {
  StrategyComponentCreateSchema,
  StrategyComponentReorderSchema,
  StrategyComponentUpdateSchema,
  StrategyEntityLifecycleSchema,
} from "@/features/strategy";
import {
  archiveComponent,
  createStrategyComponent,
  getComponentRecord,
  reorderStrategyComponents,
  restoreComponent,
  updateStrategyComponent,
} from "@/features/strategy/server";
import { assertMutationRequest } from "@/lib/request-guard";
import {
  invalidStrategyInput,
  strategyEditErrorResponse,
} from "../_edit-response";

const PatchSchema = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("update"), update: StrategyComponentUpdateSchema })
    .strict(),
  z
    .object({ action: z.literal("reorder"), reorder: StrategyComponentReorderSchema })
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
  const parsed = StrategyComponentCreateSchema.safeParse(
    await req.json().catch(() => ({})),
  );
  if (!parsed.success) return invalidStrategyInput(z.flattenError(parsed.error));
  try {
    return NextResponse.json(
      { component: createStrategyComponent(parsed.data, auth.user!.id) },
      { status: 201 },
    );
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
  if (!parsed.success) return invalidStrategyInput(z.flattenError(parsed.error));
  try {
    if (parsed.data.action === "update") {
      return NextResponse.json({
        component: updateStrategyComponent(parsed.data.update, auth.user!.id),
      });
    }
    if (parsed.data.action === "reorder") {
      return NextResponse.json({
        components: reorderStrategyComponents(
          parsed.data.reorder,
          auth.user!.id,
        ),
      });
    }
    if (parsed.data.action === "archive") {
      archiveComponent(parsed.data.id, auth.user!.id);
    } else {
      restoreComponent(parsed.data.id, auth.user!.id);
    }
    return NextResponse.json({ component: getComponentRecord(parsed.data.id) });
  } catch (error) {
    const response = strategyEditErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
