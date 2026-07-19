import { type NextRequest, NextResponse } from "next/server";
import { z } from "@/lib/zod";
import { authErrorResponse, requireAdmin } from "@/features/auth/session";
import {
  deleteStrategyDistribution,
  StrategyValueEntryNotFoundError,
  StrategyValueEntryValidationError,
  upsertStrategyDistribution,
} from "@/features/strategy/server";
import { assertMutationRequest } from "@/lib/request-guard";

const DeleteSchema = z.object({ id: z.number().int().positive() }).strict();

/** Implements the value entry error operation. */
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

/** Implements the post operation. */
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
    const distribution = upsertStrategyDistribution(
      await req.json().catch(() => ({})),
      user.id,
    );
    return NextResponse.json({ distribution }, { status: 201 });
  } catch (error) {
    const response = valueEntryError(error);
    if (response) return response;
    throw error;
  }
}

/** Removes or resets the selected state. */
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
    deleteStrategyDistribution(parsed.data.id, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = valueEntryError(error);
    if (response) return response;
    throw error;
  }
}
