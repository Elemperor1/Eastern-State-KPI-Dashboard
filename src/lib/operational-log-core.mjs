const SERVICE = "eastern-state-kpi";
const STARTUP_PHASES = new Set([
  "initialization_started",
  "initialization_completed",
  "server_starting",
]);
const STARTUP_FAILURE_REASONS = new Set([
  "database_incompatible",
  "database_missing",
  "database_unavailable",
  "initialization_incomplete",
  "initialization_failed",
  "migration_command_failed",
  "migration_in_progress",
  "migration_postcheck_failed",
  "seed_command_failed",
  "unsafe_seed_refused",
]);
const MIGRATION_PHASES = new Set(["started", "completed"]);
const MIGRATION_FAILURE_REASONS = new Set([
  "database_marker_failed",
  "migration_command_failed",
  "migration_execution_failed",
]);
const READINESS_FAILURE_REASONS = new Set([
  "database_missing",
  "database_unavailable",
  "database_incompatible",
  "migration_in_progress",
  "initialization_incomplete",
]);
const HTTP_METHODS = new Set([
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
]);
const ROUTE_TYPES = new Set(["render", "route", "action", "proxy"]);
const RENDER_SOURCES = new Set([
  "react-server-components",
  "react-server-components-payload",
  "server-rendering",
  "unknown",
]);

/** Emits a bounded JSON event to the process log stream. */
function emit(level, event, details = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE,
    event,
    ...details,
  };
  const serialized = JSON.stringify(record);
  if (level === "error") {
    console.error(serialized);
  } else {
    console.info(serialized);
  }
}

/** Records a known production startup phase. */
export function logStartup(phase) {
  if (!STARTUP_PHASES.has(phase)) return;
  emit("info", "startup", { phase });
}

/** Records a bounded production startup failure. */
export function logStartupFailure(reason, exitCode) {
  if (!STARTUP_FAILURE_REASONS.has(reason)) return;
  const details = { reason };
  if (Number.isInteger(exitCode) && exitCode >= 0 && exitCode <= 255) {
    details.exit_code = exitCode;
  }
  emit("error", "startup_failure", details);
}

/** Records a known production migration phase. */
export function logMigration(phase) {
  if (!MIGRATION_PHASES.has(phase)) return;
  emit("info", "migration", { phase });
}

/** Records a migration failure without serializing its exception. */
export function logMigrationFailure(reason, exitCode) {
  if (!MIGRATION_FAILURE_REASONS.has(reason)) return;
  const details = { reason };
  if (Number.isInteger(exitCode) && exitCode >= 0 && exitCode <= 255) {
    details.exit_code = exitCode;
  }
  emit("error", "migration_failure", details);
}

/** Records a readiness failure using a bounded operational reason code. */
export function logReadinessFailure(reason) {
  if (!READINESS_FAILURE_REASONS.has(reason)) return;
  emit("error", "readiness_failure", { reason });
}

/**
 * Records a framework-captured server error without its message, stack,
 * headers, request URL, body, cookies, or user/session context.
 */
export function logUnexpectedServerError({
  method,
  route,
  routeType,
  renderSource,
}) {
  emit("error", "unexpected_server_error", {
    method: HTTP_METHODS.has(method) ? method : "UNKNOWN",
    route: safeRouteTemplate(route),
    route_type: ROUTE_TYPES.has(routeType) ? routeType : "unknown",
    render_source: RENDER_SOURCES.has(renderSource)
      ? renderSource
      : "unknown",
  });
}

/** Reduces a framework route template to a safe bounded identifier. */
function safeRouteTemplate(value) {
  if (typeof value !== "string") return "unknown";
  const route = value.split("?", 1)[0];
  if (
    route.length === 0 ||
    route.length > 160 ||
    !/^\/[A-Za-z0-9_./()[\]-]*$/.test(route)
  ) {
    return "unknown";
  }
  return route;
}
