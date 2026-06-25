import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, requireSession } from "@/lib/session";
import {
  deleteEntry,
  listEntries,
  upsertEntry,
} from "@/lib/repository";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const filter: Parameters<typeof listEntries>[0] = {};
  const kpiId = url.searchParams.get("kpi_id");
  if (kpiId) filter.kpi_id = Number(kpiId);
  const categoryId = url.searchParams.get("category_id");
  if (categoryId) filter.category_id = Number(categoryId);
  const yearsParam = url.searchParams.getAll("year");
  if (yearsParam.length) filter.years = yearsParam.map(Number);
  return NextResponse.json({ entries: listEntries(filter) });
}

const UpsertSchema = z.object({
  kpi_id: z.number().int().positive(),
  year: z.number().int().min(1900).max(2100),
  month: z.number().int().min(0).max(12),
  value: z.number().finite(),
  notes: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  let sessionUser;
  try {
    sessionUser = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = UpsertSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const entry = upsertEntry({ ...parsed.data, updated_by: sessionUser.id });
  return NextResponse.json({ entry }, { status: 201 });
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
  deleteEntry(parsed.data.id);
  return NextResponse.json({ ok: true });
}
