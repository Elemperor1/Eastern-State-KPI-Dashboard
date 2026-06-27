import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, requireSession } from "@/lib/session";
import {
  deleteBreakdown,
  listBreakdowns,
  upsertBreakdown,
} from "@/lib/repository";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const filter: Parameters<typeof listBreakdowns>[0] = {};
  const kpiId = url.searchParams.get("kpi_id");
  if (kpiId) filter.kpi_id = Number(kpiId);
  const categoryId = url.searchParams.get("category_id");
  if (categoryId) filter.category_id = Number(categoryId);
  const yearsParam = url.searchParams.getAll("year");
  if (yearsParam.length) filter.years = yearsParam.map(Number);
  return NextResponse.json({ breakdowns: listBreakdowns(filter) });
}

const UpsertSchema = z.object({
  kpi_id: z.number().int().positive(),
  year: z.number().int().min(1900).max(2100),
  label: z.string().min(1),
  value: z.number().finite(),
  sort_order: z.number().int().optional(),
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
  const breakdown = upsertBreakdown({ ...parsed.data, updated_by: sessionUser.id });
  return NextResponse.json({ breakdown }, { status: 201 });
}

const DeleteSchema = z.object({ id: z.number().int().positive() });

export async function DELETE(req: NextRequest) {
  let sessionUser;
  try {
    sessionUser = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = DeleteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  deleteBreakdown(parsed.data.id, sessionUser.id);
  return NextResponse.json({ ok: true });
}
