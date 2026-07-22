import { type NextRequest, NextResponse } from "next/server";
import { z } from "@/lib/zod";
import { authErrorResponse, requireAdmin } from "@/features/auth/session";
import {
  BoardReportingEditConflictError,
  BoardReportingScopeUpdateSchema,
  BoardReportingValidationError,
  updateBoardReportingScope,
} from "@/features/board-reporting";
import { assertMutationRequest } from "@/lib/request-guard";

/** Updates the complete Board reporting visibility configuration atomically. */
export async function PATCH(req: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (error) {
    return authErrorResponse(error);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const parsed = BoardReportingScopeUpdateSchema.safeParse(
    await req.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid Board visibility settings", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({
      scope: updateBoardReportingScope(parsed.data, user.id),
    });
  } catch (error) {
    if (error instanceof BoardReportingEditConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof BoardReportingValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
