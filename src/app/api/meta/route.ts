import { NextResponse } from "next/server";
import { authErrorResponse, requireSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { listAvailableYears } from "@/lib/repository";

export async function GET() {
  try {
    await requireSession();
  } catch (err) {
    return authErrorResponse(err);
  }
  const db = getDb();
  const row = db.prepare("SELECT value FROM meta WHERE key = 'sample_data'").get() as
    | { value?: string }
    | undefined;
  return NextResponse.json({
    sampleData: row?.value === "1",
    years: listAvailableYears(),
  });
}
