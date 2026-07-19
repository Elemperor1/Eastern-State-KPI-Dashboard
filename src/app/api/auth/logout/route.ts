import { NextResponse } from "next/server";
import { getSession } from "@/features/auth/session";

/** Implements the post operation. */
export async function POST() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ ok: true });
}