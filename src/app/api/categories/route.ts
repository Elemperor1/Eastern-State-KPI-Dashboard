import { type NextRequest, NextResponse } from "next/server";
import { z } from "@/lib/zod";
import { authErrorResponse, requireAdmin } from "@/features/auth/session";
import { assertMutationRequest } from "@/lib/request-guard";
import {
  archiveCategory,
  CatalogEntityNotFoundError,
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
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  sort_order: z.number().int().optional(),
});

function refreshedCatalogPayload() {
  return {
    kpis: listKPIs({ includeInactive: true, includeArchived: true }),
    categories: listCategories({ includeArchived: true }),
  };
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})));
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
    const message = err instanceof Error ? err.message : "Could not create category";
    return NextResponse.json({ error: message }, { status: 400 });
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
      name: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      sort_order: z.number().int().optional(),
    })
    .strict(),
]);

export async function PATCH(req: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const parsed = UpdateSchema.safeParse(await req.json().catch(() => ({})));
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

const DeleteSchema = z.object({ id: z.number().int().positive() });

export async function DELETE(req: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const parsed = DeleteSchema.safeParse(await req.json().catch(() => ({})));
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
