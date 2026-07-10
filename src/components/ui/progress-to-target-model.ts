export const PROGRESS_TO_TARGET_STATUSES = [
  "not_started",
  "in_progress",
  "complete",
  "exceeded",
  "target_not_finalized",
  "needs_definition",
] as const;

export type ProgressToTargetStatus =
  (typeof PROGRESS_TO_TARGET_STATUSES)[number];

/**
 * Calculated, presentation-ready input for ProgressToTarget.
 *
 * Business formulas stay outside React. The component only normalizes unsafe
 * runtime values, formats already-calculated numbers, and caps the visual fill.
 */
export interface ProgressToTargetViewModel {
  status: ProgressToTargetStatus;
  currentAmount: number | null;
  targetAmount: number | null;
  actualProgressPercentage: number | null;
  displayProgressPercentage?: number | null;
  currentAmountLabel?: string | null;
  targetAmountLabel?: string | null;
  unit?: string | null;
  targetYear?: number | null;
  targetDescription?: string | null;
  pacingStatus?: string | null;
  boardStatus?: string | null;
  accessibleLabel?: string | null;
  percentagePrecision?: number;
}

export interface NormalizedProgressToTargetViewModel {
  status: ProgressToTargetStatus;
  stateLabel: string;
  currentAmount: number | null;
  targetAmount: number | null;
  currentAmountLabel: string;
  targetAmountLabel: string;
  actualProgressPercentage: number | null;
  displayProgressPercentage: number;
  actualPercentageLabel: string;
  targetYearLabel: string;
  targetDescription: string;
  pacingStatus: string;
  boardStatus: string;
  accessibleLabel: string;
  ariaValueText: string;
  hasCalculatedProgress: boolean;
}

const STATE_LABELS: Record<ProgressToTargetStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
  exceeded: "Exceeded target",
  target_not_finalized: "Target not finalized",
  needs_definition: "Needs definition",
};

const UNSAFE_TEXT = /^(?:nan|[+-]?infinity|undefined|null)$/i;

export function normalizeProgressToTargetViewModel(
  input: ProgressToTargetViewModel,
): NormalizedProgressToTargetViewModel {
  const currentAmount = finiteOrNull(input.currentAmount);
  const targetAmount = finiteOrNull(input.targetAmount);
  const rawActual = finiteOrNull(input.actualProgressPercentage);
  const rawDisplay = finiteOrNull(input.displayProgressPercentage);
  const percentagePrecision = normalizePrecision(input.percentagePrecision);

  let status = isProgressToTargetStatus(input.status)
    ? input.status
    : "needs_definition";
  if (status !== "needs_definition" && status !== "target_not_finalized") {
    if (targetAmount === null) {
      status = "target_not_finalized";
    } else if (
      rawActual === null &&
      status !== "not_started"
    ) {
      status = "needs_definition";
    }
  }

  const hasCalculatedProgress =
    status !== "needs_definition" && status !== "target_not_finalized";
  const actualProgressPercentage = hasCalculatedProgress
    ? rawActual ?? 0
    : null;
  const displaySource = hasCalculatedProgress
    ? rawDisplay ?? actualProgressPercentage ?? 0
    : 0;
  const displayProgressPercentage = clamp(displaySource, 0, 100);
  const stateLabel = STATE_LABELS[status];
  const currentAmountLabel = amountLabel({
    amount: currentAmount,
    suppliedLabel: input.currentAmountLabel,
    unit: input.unit,
    fallback: "Not reported",
  });
  const targetAmountLabel = targetAmount === null
    ? "Not finalized"
    : amountLabel({
        amount: targetAmount,
        suppliedLabel: input.targetAmountLabel,
        unit: input.unit,
        fallback: "Not finalized",
      });
  const actualPercentageLabel = actualProgressPercentage === null
    ? "Not available"
    : `${formatNumber(actualProgressPercentage, percentagePrecision)}%`;
  const targetYear = finiteYearOrNull(input.targetYear);
  const targetYearLabel = targetYear === null
    ? "Target year not set"
    : `Target year ${targetYear}`;
  const targetDescription = targetDescriptionLabel(status, input.targetDescription);
  const pacingStatus = safeText(input.pacingStatus) ?? "Not assessed";
  const boardStatus = safeText(input.boardStatus) ?? "Not set";
  const accessibleLabel = safeText(input.accessibleLabel) ?? "Progress to target";
  const ariaValueText = hasCalculatedProgress
    ? `${actualPercentageLabel} actual progress; ${stateLabel}. ${currentAmountLabel} current; ${targetAmountLabel} target.`
    : `${stateLabel}. ${targetDescription}`;

  return {
    status,
    stateLabel,
    currentAmount,
    targetAmount,
    currentAmountLabel,
    targetAmountLabel,
    actualProgressPercentage,
    displayProgressPercentage,
    actualPercentageLabel,
    targetYearLabel,
    targetDescription,
    pacingStatus,
    boardStatus,
    accessibleLabel,
    ariaValueText,
    hasCalculatedProgress,
  };
}

export function isProgressToTargetStatus(
  value: unknown,
): value is ProgressToTargetStatus {
  return typeof value === "string" &&
    (PROGRESS_TO_TARGET_STATUSES as readonly string[]).includes(value);
}

function amountLabel({
  amount,
  suppliedLabel,
  unit,
  fallback,
}: {
  amount: number | null;
  suppliedLabel?: string | null;
  unit?: string | null;
  fallback: string;
}): string {
  if (amount === null) return fallback;
  const explicit = safeText(suppliedLabel);
  if (explicit) return explicit;
  const value = formatNumber(amount, 2);
  const safeUnit = safeText(unit);
  return safeUnit ? `${value} ${safeUnit}` : value;
}

function targetDescriptionLabel(
  status: ProgressToTargetStatus,
  description?: string | null,
): string {
  const explicit = safeText(description);
  if (explicit) return explicit;
  if (status === "target_not_finalized") {
    return "Target details have not been finalized.";
  }
  if (status === "needs_definition") {
    return "The measurement definition must be resolved before progress can be calculated.";
  }
  return "No target description provided.";
}

function safeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || UNSAFE_TEXT.test(trimmed)) return null;
  return trimmed;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finiteYearOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0
    ? value
    : null;
}

function normalizePrecision(value: number | undefined): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 4
    ? value
    : 1;
}

function formatNumber(value: number, maximumFractionDigits: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
