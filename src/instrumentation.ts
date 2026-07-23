import type { Instrumentation } from "next";
import { logUnexpectedServerError } from "@/lib/operational-log";

/**
 * Records framework-captured server errors through the bounded operational
 * logger. Request headers, URLs, exception messages, stacks, cookies, bodies,
 * and session context are deliberately excluded.
 */
export const onRequestError: Instrumentation.onRequestError = (
  _error,
  request,
  context,
) => {
  logUnexpectedServerError({
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
  });
};
