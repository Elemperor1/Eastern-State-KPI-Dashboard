const REPORTING_REASON_LABELS: Record<string, string> = {
  NO_ELIGIBLE_KPIS: "No required, fully configured measures are ready",
  GOAL_NEEDS_DEFINITION: "The goal definition is not finalized",
  GOAL_NEEDS_TARGET: "The goal target is not finalized",
  GOAL_DRAFT: "The goal setup is still a draft",
  GOAL_ARCHIVED: "The goal is archived",
  MANUAL_STATUS_REQUIRED: "The completion status has not been set",
  ZERO_WEIGHT_TOTAL: "The measure weights need a positive total",
  INVALID_COMPLETION_THRESHOLD: "The completion threshold needs correction",
  INVALID_THRESHOLD_COUNT: "The required measure count needs correction",
  needs_definition: "One or more measure definitions are not finalized",
  needs_target: "One or more measure targets are not finalized",
  missing_progress: "Current progress is not available",
  invalid_progress: "Current progress needs correction",
  draft: "One or more measure definitions are still drafts",
  archived: "One or more measures are archived",
  informational: "This measure provides context and does not count toward completion",
};

/** Implements the humanize code operation. */
function humanizeCode(value: string): string {
  const known = REPORTING_REASON_LABELS[value];
  if (known) return known;
  if (!/^[A-Za-z0-9_]+$/.test(value) || !value.includes("_")) return value;
  const words = value.toLocaleLowerCase().replaceAll("_", " ");
  return `${words.charAt(0).toLocaleUpperCase()}${words.slice(1)}`;
}

/** Convert calculation/configuration codes into short production language. */
export function humanizeReportingReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) return "";

  const separator = trimmed.indexOf(": ");
  if (separator > 0) {
    const label = trimmed.slice(0, separator);
    const detail = trimmed.slice(separator + 2);
    return `${label}: ${detail
      .split(";")
      .map((part) => humanizeCode(part.trim()))
      .filter(Boolean)
      .join("; ")}`;
  }

  return trimmed
    .split(";")
    .map((part) => humanizeCode(part.trim()))
    .filter(Boolean)
    .join("; ");
}

/** Implements the humanize reporting reasons operation. */
export function humanizeReportingReasons(reasons: string[]): string[] {
  return Array.from(
    new Set(reasons.map(humanizeReportingReason).filter(Boolean)),
  );
}
