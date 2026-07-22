import { type NextRequest, NextResponse } from "next/server";
import { z } from "@/lib/zod";
import {
  authErrorResponse,
  requireAdmin,
  requireStaffSession,
} from "@/features/auth/session";
import {
  archiveStrategyDistributionBand,
  createStrategyDistributionBand,
  listEffectiveDistributionBands,
  reorderStrategyDistributionBands,
  restoreStrategyDistributionBand,
  StrategyValueEntryNotFoundError,
  StrategyValueEntryValidationError,
  updateStrategyDistributionBand,
} from "@/features/strategy/server";
import { assertMutationRequest } from "@/lib/request-guard";

const QuerySchema = z.object({
  kpi_id: z.coerce.number().int().positive(),
  component_id: z.preprocess(
    (value) => (value === null || value === "" ? null : Number(value)),
    z.number().int().positive().nullable(),
  ),
  reporting_year: z.coerce.number().int().min(1900).max(2100),
  include_archived: z.preprocess(
    (value) => value === "true",
    z.boolean(),
  ),
});

const PatchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), band: z.unknown().optional() }).strict(),
  z.object({ action: z.literal("reorder"), order: z.unknown().optional() }).strict(),
  z.object({ action: z.literal("archive"), id: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("restore"), id: z.number().int().positive() }).strict(),
]);

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

/** Retrieves the requested data. */
export async function GET(req: NextRequest) {
  try {
    await requireStaffSession();
  } catch (error) {
    return authErrorResponse(error);
  }
  const parsed = QuerySchema.safeParse({
    kpi_id: req.nextUrl.searchParams.get("kpi_id"),
    component_id: req.nextUrl.searchParams.get("component_id"),
    reporting_year: req.nextUrl.searchParams.get("reporting_year"),
    include_archived: req.nextUrl.searchParams.get("include_archived"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  try {
    const bands = listEffectiveDistributionBands(parsed.data);
    return NextResponse.json({ bands });
  } catch (error) {
    const response = valueEntryError(error);
    if (response) return response;
    throw error;
  }
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
    const band = createStrategyDistributionBand(
      await req.json().catch(() => ({})),
      user.id,
    );
    return NextResponse.json({ band }, { status: 201 });
  } catch (error) {
    const response = valueEntryError(error);
    if (response) return response;
    throw error;
  }
}

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
  const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  try {
    if (parsed.data.action === "update") {
      return NextResponse.json({
        band: updateStrategyDistributionBand(parsed.data.band, user.id),
      });
    }
    if (parsed.data.action === "reorder") {
      return NextResponse.json({
        bands: reorderStrategyDistributionBands(parsed.data.order, user.id),
      });
    }
    const band =
      parsed.data.action === "archive"
        ? archiveStrategyDistributionBand(parsed.data.id, user.id)
        : restoreStrategyDistributionBand(parsed.data.id, user.id);
    return NextResponse.json({ band });
  } catch (error) {
    const response = valueEntryError(error);
    if (response) return response;
    throw error;
  }
}
