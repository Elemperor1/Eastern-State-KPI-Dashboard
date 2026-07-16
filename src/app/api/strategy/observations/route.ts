import { type NextRequest, NextResponse } from "next/server";
import { z } from "@/lib/zod";
import { authErrorResponse, requireAdmin } from "@/features/auth/session";
import {
  deleteStrategyObservation,
  StrategyObservationSubmissionSchema,
  StrategyValueEntryNotFoundError,
  StrategyValueEntryValidationError,
  upsertStrategyMultiComponentBatch,
  upsertStrategyObservation,
} from "@/features/strategy/server";
import { assertMutationRequest } from "@/lib/request-guard";

const DeleteSchema = z.object({ id: z.number().int().positive() }).strict();

function valueEntryError(error: unknown): NextResponse | null {
  if (error instanceof StrategyValueEntryNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof StrategyValueEntryValidationError) {
    return NextResponse.json(
      { error: error.message, issues: error.issues },
      { status: 400 },
    );
  }
  return null;
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (error) {
    return authErrorResponse(error);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  try {
    const input: unknown = await req.json().catch(() => ({}));
    const parsed = StrategyObservationSubmissionSchema.safeParse(input);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid observation submission.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }
    if ("submission_type" in parsed.data) {
      const results = upsertStrategyMultiComponentBatch(input, user.id);
      return NextResponse.json({ results }, { status: 201 });
    }
    const observation = upsertStrategyObservation(input, user.id);
    return NextResponse.json({ observation }, { status: 201 });
  } catch (error) {
    const response = valueEntryError(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(req: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (error) {
    return authErrorResponse(error);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const parsed = DeleteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  try {
    deleteStrategyObservation(parsed.data.id, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = valueEntryError(error);
    if (response) return response;
    throw error;
  }
}
