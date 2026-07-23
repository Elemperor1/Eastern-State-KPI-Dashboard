import { NextResponse } from "next/server";
import { checkReadiness } from "@/features/health/readiness";
import { logReadinessFailure } from "@/lib/operational-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RESPONSE_HEADERS = {
  "cache-control": "no-store, max-age=0",
} as const;

/** Reports whether this process can safely receive production traffic. */
export function GET(): NextResponse {
  const result = checkReadiness();
  if (!result.ready) {
    logReadinessFailure(result.reason);
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers: RESPONSE_HEADERS },
    );
  }
  return NextResponse.json(
    { status: "ready" },
    { status: 200, headers: RESPONSE_HEADERS },
  );
}
