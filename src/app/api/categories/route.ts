import { type NextRequest, NextResponse } from "next/server";
import { z } from "@/lib/zod";
import { authErrorResponse, requireAdmin } from "@/features/auth/session";
import { assertMutationRequest } from "@/lib/request-guard";
import { readJsonBody } from "@/lib/request-body";
import { logUnexpectedServerError } from "@/lib/operational-log";
import {
  archiveCategory,
  CatalogEntityNotFoundError,
  CatalogPlanLifecycleError,
  createCategory,
  DependentEntriesError,
  listCategories,
  listKPIs,
  restoreCategory,
  retireOrDeleteCategory,
  updateCategory,
} from "@/features/catalog/server";
import {
  InstallationEditConflictError,
  InstallationValidationError,
  updateActiveInstallation,
} from "@/features/installation/server";
import { PlanSettingsUpdateActionSchema } from "@/features/installation/validation";

const CreateSchema = z.object({
  // Catalog-string maxima mirror the strategic-layer caps (slug 120 /
  // name 200 / description 4000, NOV-C1): values persist verbatim and are
  // duplicated into immutable audit snapshots.
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional().nullable(),
  sort_order: z.number().int().optional(),
});

/** Implements the refreshed catalog payload operation. */
function refreshedCatalogPayload() {
  return {
    kpis: listKPIs({ includeInactive: true, includeArchived: true }),
    categories: listCategories({ includeArchived: true }),
  };
}

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
    return NextResponse.json(
      { error: "Invalid input", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  try {
    const category = createCategory(parsed.data, user.id);
    return NextResponse.json({ category, ...refreshedCatalogPayload() }, { status: 201 });
  } catch (err) {
    // F-09 R-08 follow-up: never echo raw SQLite/driver error text (for
    // example a UNIQUE constraint message) to the client. Typed catalog
    // errors map to client-safe statuses; anything else is an unexpected
    // server failure — generic 500, logged with bounded context only.
    if (err instanceof CatalogEntityNotFoundError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 404 },
      );
    }
    if (err instanceof CatalogPlanLifecycleError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 409 },
      );
    }
    if (err instanceof DependentEntriesError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    // Routine client conflict (duplicate slug): safe 409, mirroring the
    // users route — never the raw constraint text.
    if (err instanceof Error && /unique constraint failed/i.test(err.message)) {
      return NextResponse.json(
        { error: "A priority with that slug already exists." },
        { status: 409 },
      );
    }
    logUnexpectedServerError({
      method: "POST",
      route: "/api/categories",
      routeType: "route",
    });
    return NextResponse.json(
      { error: "Could not create category." },
      { status: 500 },
    );
  }
}

const UpdateSchema = z.union([
  PlanSettingsUpdateActionSchema,
  z
    .object({
      action: z.enum(["archive", "restore"]),
      id: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      id: z.number().int().positive(),
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(4000).nullable().optional(),
      sort_order: z.number().int().optional(),
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
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  try {
    if ("action" in parsed.data) {
      if (parsed.data.action === "update_plan") {
        const { action: _action, ...update } = parsed.data;
        return NextResponse.json({
          ok: true,
          installation: updateActiveInstallation(update, user.id),
        });
      }
      if (parsed.data.action === "archive") {
        archiveCategory(parsed.data.id, user.id);
      } else {
        restoreCategory(parsed.data.id, user.id);
      }
      return NextResponse.json({
        ok: true,
        lifecycle: parsed.data.action === "archive" ? "archived" : "restored",
        ...refreshedCatalogPayload(),
      });
    }
    const { id, ...patch } = parsed.data;
    updateCategory(id, patch, user.id);
    return NextResponse.json({ ok: true, ...refreshedCatalogPayload() });
  } catch (err) {
    if (err instanceof InstallationEditConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof CatalogPlanLifecycleError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 409 },
      );
    }
    if (err instanceof InstallationValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
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
    const lifecycle = retireOrDeleteCategory(parsed.data.id, user.id);
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
