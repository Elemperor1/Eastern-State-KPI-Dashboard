import { NextRequest, NextResponse } from "next/server";
import { listEntryHistory } from "@/features/audit/server";
import { authErrorResponse, requireAdmin } from "@/features/auth/session";

/**
 * Admin-only audit-trail endpoint. Powers /admin/history.
 *
 * Filters (all optional):
 *   kpi_id       — limit to one KPI
 *   category_id  — limit to one category
 *   year         — limit to one year
 *   limit        — page size (1–1000, default 200)
 *
 * History rows are append-only and survive deletes of the source entry; an
 * entry_id may refer to a row that no longer exists in monthly_entries or
 * breakdown_entries (e.g. after a delete or a schema bump).
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return authErrorResponse(err);
  }
  const url = new URL(req.url);
  const filter: Parameters<typeof listEntryHistory>[0] = {};
  const kpiId = url.searchParams.get("kpi_id");
  if (kpiId) filter.kpi_id = Number(kpiId);
  const categoryId = url.searchParams.get("category_id");
  if (categoryId) filter.category_id = Number(categoryId);
  const year = url.searchParams.get("year");
  if (year) filter.year = Number(year);
  const limit = url.searchParams.get("limit");
  if (limit) filter.limit = Number(limit);
  return NextResponse.json({ history: listEntryHistory(filter) });
}
