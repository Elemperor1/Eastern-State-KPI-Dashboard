import { NextResponse } from "next/server";
import { authErrorResponse, requireSession } from "@/lib/session";
import { listAvailableYears } from "@/lib/repository";

export async function GET() {
  try {
    await requireSession();
  } catch (err) {
    return authErrorResponse(err);
  }
  return NextResponse.json({ years: listAvailableYears() });
}