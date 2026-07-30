import {
  logAuthThrottle as writeAuthThrottle,
  logReadinessFailure as writeReadinessFailure,
  logUnexpectedServerError as writeUnexpectedServerError,
} from "./operational-log-core.mjs";
import type { ReadinessFailureReason } from "@/features/health/readiness";

export type AuthThrottleReason =
  | "change_password_lockout"
  | "login_verify_budget_exceeded";

type ServerErrorContext = {
  method: string;
  route: string;
  routeType: string;
  renderSource?: string;
};

/** Records a bounded, non-sensitive authentication throttle event. */
export function logAuthThrottle(reason: AuthThrottleReason): void {
  writeAuthThrottle(reason);
}

/** Records a bounded readiness failure event. */
export function logReadinessFailure(reason: ReadinessFailureReason): void {
  writeReadinessFailure(reason);
}

/** Records a bounded unexpected server error event. */
export function logUnexpectedServerError(context: ServerErrorContext): void {
  writeUnexpectedServerError({
    ...context,
    renderSource: context.renderSource ?? "unknown",
  });
}
