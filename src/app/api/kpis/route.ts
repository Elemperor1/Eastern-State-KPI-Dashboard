import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireAdmin, requireSession } from "@/lib/session";
import { assertMutationRequest } from "@/lib/request-guard";
import {
  createKPI,
  deleteKPI,
  DependentEntriesError,
  listKPIs,
  updateKPI,
} from "@/lib/repository";

const UnitTypeEnum = z.enum(["count", "percent", "currency", "attendance", "note", "breakdown"]);
const FrequencyEnum = z.enum(["monthly", "annual", "flexible"]);
const DirectionEnum = z.enum(["higher", "lower", "neutral"]);

export async function GET() {
  try {
    await requireSession();
  } catch (err) {
    return authErrorResponse(err);
  }
  return NextResponse.json({ kpis: listKPIs() });
}

const CreateSchema = z.object({
  category_id: z.number().int().positive(),
  parent_id: z.number().int().positive().nullable().optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  unit: z.string().optional(),
  unit_type: UnitTypeEnum.optional(),
  reporting_frequency: FrequencyEnum.optional(),
  direction: DirectionEnum.optional(),
  description: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const kpi = createKPI(parsed.data);
    return NextResponse.json({ kpi }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create KPI";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

const UpdateSchema = z.object({
  id: z.number().int().positive(),
  category_id: z.number().int().positive().optional(),
  parent_id: z.number().int().positive().nullable().optional(),
  name: z.string().min(1).optional(),
  unit: z.string().optional(),
  unit_type: UnitTypeEnum.optional(),
  reporting_frequency: FrequencyEnum.optional(),
  direction: DirectionEnum.optional(),
  description: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
  is_active: z.union([z.literal(0), z.literal(1)]).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const parsed = UpdateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  const { id, ...patch } = parsed.data;
  updateKPI(id, patch);
  return NextResponse.json({ ok: true });
}

const DeleteSchema = z.object({ id: z.number().int().positive() });

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();
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
    deleteKPI(parsed.data.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof DependentEntriesError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    throw err;
  }
}
