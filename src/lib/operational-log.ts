import {
  logReadinessFailure as writeReadinessFailure,
  logUnexpectedServerError as writeUnexpectedServerError,
} from "../../scripts/operational-log.mjs";
import type { ReadinessFailureReason } from "@/features/health/readiness";

type ServerErrorContext = {
  method: string;
  route: string;
  routeType: string;
  renderSource?: string;
};

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
