import { NextResponse } from "next/server";
import {
  StrategyConfigurationError,
  StrategyEditConflictError,
  StrategyEditNotFoundError,
  StrategyEditValidationError,
  StrategyEntityNotFoundError,
} from "@/features/strategy/server";

export function strategyEditErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof StrategyEditValidationError) {
    return NextResponse.json(
      { error: error.message, issues: error.issues },
      { status: 400 },
    );
  }
  if (
    error instanceof StrategyEditNotFoundError ||
    error instanceof StrategyEntityNotFoundError
  ) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (
    error instanceof StrategyEditConflictError ||
    error instanceof StrategyConfigurationError
  ) {
    return NextResponse.json(
      {
        error: error.message,
        ...(error instanceof StrategyEditConflictError
          ? { code: error.code }
          : {}),
      },
      { status: 409 },
    );
  }
  return null;
}
export function invalidStrategyInput(issues: unknown): NextResponse {
  return NextResponse.json(
    { error: "Invalid input", issues },
    { status: 400 },
  );
}
