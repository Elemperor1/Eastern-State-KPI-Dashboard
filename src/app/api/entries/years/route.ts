import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { listAvailableYears } from "@/lib/repository";

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ years: listAvailableYears() });
}