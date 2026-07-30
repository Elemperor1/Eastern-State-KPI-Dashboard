import { type NextRequest, NextResponse } from "next/server";
import { z } from "@/lib/zod";
import { authErrorResponse, requireAdmin } from "@/features/auth/session";
import {
  EXPLICIT_STRATEGY_REPORTING_FREQUENCIES,
  MEASUREMENT_TYPES,
} from "@/features/strategy";
import { assertMutationRequest } from "@/lib/request-guard";
import { readJsonBody } from "@/lib/request-body";
import { logUnexpectedServerError } from "@/lib/operational-log";
import {
  archiveKPI,
  CatalogEntityNotFoundError,
  CatalogPlanLifecycleError,
  createStrategicMeasure,
  DependentEntriesError,
  KpiArchivedCategoryError,
  KpiParentCycleError,
  KpiSemanticMutationError,
  KpiStrategicReparentError,
  listCategories,
  listKPIs,
  restoreKPI,
  retireOrDeleteKPI,
  StrategicMeasureContextError,
  updateKPI,
} from "@/features/catalog/server";

const UnitTypeEnum = z.enum(["count", "percent", "currency", "attendance", "note", "breakdown"]);
const FrequencyEnum = z.enum(["monthly", "annual", "flexible"]);
const DirectionEnum = z.enum(["higher", "lower", "neutral"]);

/** Implements the refreshed catalog payload operation. */
function refreshedCatalogPayload() {
  return {
    kpis: listKPIs({ includeInactive: true, includeArchived: true }),
    categories: listCategories({ includeArchived: true }),
  };
}

const CreateSchema = z.object({
  goal_id: z.number().int().positive(),
  reporting_year: z
    .number()
    .int()
    .min(1900)
    .max(2100),
  // Catalog-string maxima mirror the strategic-layer caps (slug 120 /
  // name 200 / unit 80 / description 4000, NOV-C1): these values persist
  // verbatim and are duplicated into immutable audit snapshots.
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(200),
  unit: z.string().trim().min(1).max(80),
  measurement_type: z.enum(MEASUREMENT_TYPES),
  reporting_frequency: z.enum(EXPLICIT_STRATEGY_REPORTING_FREQUENCIES),
  direction: DirectionEnum,
  description: z.string().max(4000).nullable().optional(),
}).strict();

/** Implements the post operation. */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;
  const parsed = CreateSchema.safeParse(bodyResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: z.flattenError(parsed.error) }, { status: 400 });
  }
  try {
    const created = createStrategicMeasure(parsed.data, user.id);
    return NextResponse.json({ ...created, ...refreshedCatalogPayload() }, { status: 201 });
  } catch (err) {
    // Typed catalog errors map to client-safe statuses (mirroring PATCH);
    // anything else is an unexpected server failure: never echo raw
    // SQLite/driver/feature error text to the client (F-09 R-08), return
    // a generic 500, and log only bounded non-sensitive context.
    if (err instanceof StrategicMeasureContextError) {
      const status =
        err.code === "STRATEGIC_MEASURE_GOAL_NOT_FOUND"
          ? 404
          : err.code === "STRATEGIC_MEASURE_CONTEXT_ARCHIVED"
            ? 409
            : 400;
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status },
      );
    }
    if (
      err instanceof CatalogPlanLifecycleError ||
      err instanceof KpiSemanticMutationError ||
      err instanceof KpiArchivedCategoryError ||
      err instanceof KpiStrategicReparentError
    ) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 409 },
      );
    }
    if (err instanceof KpiParentCycleError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400 },
      );
    }
    if (err instanceof DependentEntriesError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    if (err instanceof CatalogEntityNotFoundError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 404 },
      );
    }
    // Routine client conflict (duplicate slug): safe 409, mirroring the
    // users route — never the raw constraint text.
    if (err instanceof Error && /unique constraint failed/i.test(err.message)) {
      return NextResponse.json(
        { error: "A measure with that slug already exists." },
        { status: 409 },
      );
    }
    logUnexpectedServerError({
      method: "POST",
      route: "/api/kpis",
      routeType: "route",
    });
    return NextResponse.json({ error: "Could not create KPI." }, { status: 500 });
  }
}

const UpdateSchema = z.union([
  z
    .object({
      action: z.enum(["archive", "restore"]),
      id: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      id: z.number().int().positive(),
      category_id: z.number().int().positive().optional(),
      parent_id: z.number().int().positive().nullable().optional(),
      name: z.string().min(1).max(200).optional(),
      unit: z.string().trim().min(1).max(80).optional(),
      unit_type: UnitTypeEnum.optional(),
      reporting_frequency: FrequencyEnum.optional(),
      direction: DirectionEnum.optional(),
      description: z.string().max(4000).nullable().optional(),
      sort_order: z.number().int().optional(),
      is_active: z.union([z.literal(0), z.literal(1)]).optional(),
    })
    .strict(),
]);

/** Implements the patch operation. */
export async function PATCH(req: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;
  const parsed = UpdateSchema.safeParse(bodyResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: z.flattenError(parsed.error) }, { status: 400 });
  }
  try {
    if ("action" in parsed.data) {
      if (parsed.data.action === "archive") {
        archiveKPI(parsed.data.id, user.id);
      } else {
        restoreKPI(parsed.data.id, user.id);
      }
      return NextResponse.json({
        ok: true,
        lifecycle: parsed.data.action === "archive" ? "archived" : "restored",
        ...refreshedCatalogPayload(),
      });
    }
    const { id, ...patch } = parsed.data;
    updateKPI(id, patch, user.id);
    return NextResponse.json({ ok: true, ...refreshedCatalogPayload() });
  } catch (err) {
    if (
      err instanceof CatalogPlanLifecycleError ||
      err instanceof KpiSemanticMutationError ||
      err instanceof KpiArchivedCategoryError ||
      err instanceof KpiStrategicReparentError
    ) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 409 },
      );
    }
    if (err instanceof KpiParentCycleError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400 },
      );
    }
    if (err instanceof CatalogEntityNotFoundError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 404 },
      );
    }
    throw err;
  }
}

const DeleteSchema = z.object({ id: z.number().int().positive() }).strict();

/** Removes or resets the selected state. */
export async function DELETE(req: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;
  const parsed = DeleteSchema.safeParse(bodyResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  try {
    const lifecycle = retireOrDeleteKPI(parsed.data.id, user.id);
    return NextResponse.json({
      ok: true,
      lifecycle,
      ...refreshedCatalogPayload(),
    });
  } catch (err) {
    if (err instanceof DependentEntriesError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    if (err instanceof CatalogEntityNotFoundError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 404 },
      );
    }
    throw err;
  }
}
