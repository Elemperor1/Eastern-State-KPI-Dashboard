import { NextResponse } from "next/server";
import {
  PlanActivationBackupError,
  PlanActivationCommittedVerificationError,
  PlanLifecycleConflictError,
  PlanLifecycleNotFoundError,
  PlanLifecycleValidationError,
} from "@/features/plans/server";

/** Maps plan-domain failures to stable, non-sensitive API responses. */
export function planErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof PlanLifecycleValidationError) {
    return NextResponse.json(
      { error: error.message, issues: error.issues },
      { status: 400 },
    );
  }
  if (error instanceof PlanLifecycleNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof PlanLifecycleConflictError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 409 },
    );
  }
  if (error instanceof PlanActivationBackupError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  if (error instanceof PlanActivationCommittedVerificationError) {
    return NextResponse.json(
      { error: error.message, activation: error.result },
      { status: 503 },
    );
  }
  return null;
}
