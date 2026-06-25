import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "@/lib/repository";

const CreateSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  sort_order: z.number().int().optional(),
});

export async function GET() {
  return NextResponse.json({ categories: listCategories() });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const category = createCategory(parsed.data);
    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create category";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

const UpdateSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = UpdateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { id, ...patch } = parsed.data;
  updateCategory(id, patch);
  return NextResponse.json({ ok: true });
}

const DeleteSchema = z.object({ id: z.number().int().positive() });

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = DeleteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  deleteCategory(parsed.data.id);
  return NextResponse.json({ ok: true });
}