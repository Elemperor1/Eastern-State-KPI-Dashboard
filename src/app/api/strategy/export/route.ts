import { type NextRequest, NextResponse } from "next/server";
import { z } from "@/lib/zod";
import { authErrorResponse, requireSession } from "@/features/auth/session";
import {
  listStrategicReportingPeriods,
  loadBoardReportPageData,
  reportingCycleThroughMonth,
} from "@/features/reporting/server";
import { buildStrategicBoardCsvText } from "@/features/reporting/strategic-board-report";

const ExportQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(2100),
  throughMonth: z.coerce.number().int().min(1).max(12).default(12),
  period: z.string().min(1).optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

/** Retrieves the requested data. */
export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireSession();
  } catch (error) {
    return authErrorResponse(error);
  }

  const parsed = ExportQuerySchema.safeParse({
    year: req.nextUrl.searchParams.get("year") ?? new Date().getFullYear(),
    throughMonth: req.nextUrl.searchParams.get("throughMonth") ?? 12,
    period: req.nextUrl.searchParams.get("period") ?? undefined,
    format: req.nextUrl.searchParams.get("format") ?? "json",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid export query", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }

  const reportingPeriod = parsed.data.period
    ? listStrategicReportingPeriods(
        parsed.data.year,
        user.role === "board" ? "board" : "staff",
      ).find(
        (candidate) => candidate.value === parsed.data.period,
      )
    : undefined;
  if (parsed.data.period && !reportingPeriod) {
    return NextResponse.json({ error: "Invalid reporting period" }, { status: 400 });
  }

  const data = loadBoardReportPageData({
    year: parsed.data.year,
    throughMonth: reportingPeriod
      ? reportingCycleThroughMonth(reportingPeriod)
      : parsed.data.throughMonth,
    ...(reportingPeriod ? { reportingPeriod } : {}),
    audience: user.role === "board" ? "board" : "staff",
  });
  if (parsed.data.format === "csv") {
    const output = buildStrategicBoardCsvText(data.report);
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
    { report: data.report },
    { headers: { "cache-control": "private, no-store" } },
  );
}
