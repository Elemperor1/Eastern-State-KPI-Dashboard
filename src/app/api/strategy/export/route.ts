import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireSession } from "@/features/auth/session";
import { loadOverviewPageData } from "@/features/reporting/server";
import { buildStrategicBoardCsvText } from "@/features/reporting/strategic-board-report";

const ExportQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(2100),
  throughMonth: z.coerce.number().int().min(1).max(12).default(12),
  format: z.enum(["json", "csv"]).default("json"),
});

export async function GET(req: NextRequest) {
  try {
    await requireSession();
  } catch (error) {
    return authErrorResponse(error);
  }

  const parsed = ExportQuerySchema.safeParse({
    year: req.nextUrl.searchParams.get("year") ?? new Date().getFullYear(),
    throughMonth: req.nextUrl.searchParams.get("throughMonth") ?? 12,
    format: req.nextUrl.searchParams.get("format") ?? "json",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid export query", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = loadOverviewPageData({
    year: parsed.data.year,
    throughMonth: parsed.data.throughMonth,
  });
  if (parsed.data.format === "csv") {
    const output = buildStrategicBoardCsvText(data.strategicBoardReport);
    return new NextResponse(`\ufeff${output.csv}`, {
      status: 200,
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="${output.filename}"`,
        "content-type": "text/csv; charset=utf-8",
      },
    });
  }

  return NextResponse.json(
    { report: data.strategicBoardReport },
    { headers: { "cache-control": "private, no-store" } },
  );
}
