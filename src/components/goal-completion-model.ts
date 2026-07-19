interface GoalExclusionReasonViewModel {
  goalId: string;
  goalName?: string | null;
  reasons: string[];
}

export interface GoalCompletionViewModel {
  completedGoalsCount: number;
  totalEligibleGoalsCount: number;
  completionPercentage: number | null;
  excludedGoalsCount: number;
  excludedGoalReasons: GoalExclusionReasonViewModel[];
}

export interface PriorityGoalCompletionViewModel
  extends GoalCompletionViewModel {
  priorityId: string;
  priorityName: string;
}

interface NormalizedGoalExclusionReason {
  goalId: string;
  goalName: string;
  reasons: string[];
}

export interface NormalizedGoalCompletionViewModel {
  completedGoalsCount: number;
  totalEligibleGoalsCount: number;
  completionPercentage: number | null;
  displayCompletionPercentage: number;
  completionPercentageLabel: string;
  countLabel: string;
  excludedGoalsCount: number;
  excludedNote: string;
  excludedGoalReasons: NormalizedGoalExclusionReason[];
  hasEligibleGoals: boolean;
  hasCompletionPercentage: boolean;
  progressAriaValueText: string;
}

export interface NormalizedPriorityGoalCompletionViewModel
  extends NormalizedGoalCompletionViewModel {
  priorityId: string;
  priorityName: string;
}

/** Builds goal completion view model. */
export function normalizeGoalCompletionViewModel(
  input: GoalCompletionViewModel,
): NormalizedGoalCompletionViewModel {
  const totalEligibleGoalsCount = nonNegativeInteger(
    input.totalEligibleGoalsCount,
  );
  const completedGoalsCount = Math.min(
    nonNegativeInteger(input.completedGoalsCount),
    totalEligibleGoalsCount,
  );
  const hasEligibleGoals = totalEligibleGoalsCount > 0;
  const suppliedPercentage = finiteOrNull(input.completionPercentage);
  const completionPercentage = hasEligibleGoals && suppliedPercentage !== null
    ? clamp(suppliedPercentage, 0, 100)
    : null;
  const displayCompletionPercentage = completionPercentage ?? 0;
  const completionPercentageLabel = completionPercentage === null
    ? "Not available"
    : `${formatPercentage(completionPercentage)}%`;
  const countLabel = `${completedGoalsCount} of ${totalEligibleGoalsCount} goals completed`;
  const excludedGoalReasons = normalizeExclusionReasons(
    input.excludedGoalReasons,
  );
  const excludedGoalsCount = Math.max(
    nonNegativeInteger(input.excludedGoalsCount),
    excludedGoalReasons.length,
  );
  const excludedNote = excludedGoalsCount === 0
    ? "No goals are excluded for configuration gaps."
    : `${excludedGoalsCount} ${pluralize("goal", excludedGoalsCount)} excluded because configuration is incomplete.`;
  const hasCompletionPercentage = completionPercentage !== null;
  const progressAriaValueText = hasCompletionPercentage
    ? `${completionPercentageLabel} goal completion. ${countLabel}.`
    : `Goal completion percentage not available. ${countLabel}.`;

  return {
    completedGoalsCount,
    totalEligibleGoalsCount,
    completionPercentage,
    displayCompletionPercentage,
    completionPercentageLabel,
    countLabel,
    excludedGoalsCount,
    excludedNote,
    excludedGoalReasons,
    hasEligibleGoals,
    hasCompletionPercentage,
    progressAriaValueText,
  };
}

/** Builds priority goal completion view model. */
export function normalizePriorityGoalCompletionViewModel(
  input: PriorityGoalCompletionViewModel,
): NormalizedPriorityGoalCompletionViewModel {
  return {
    ...normalizeGoalCompletionViewModel(input),
    priorityId: safeText(input.priorityId) ?? "unassigned-priority",
    priorityName: safeText(input.priorityName) ?? "Unnamed strategic priority",
  };
}

/** Builds exclusion reasons. */
function normalizeExclusionReasons(
  reasons: GoalExclusionReasonViewModel[] | null | undefined,
): NormalizedGoalExclusionReason[] {
  if (!Array.isArray(reasons)) return [];
  return reasons.flatMap((item, index) => {
    const normalizedReasons = Array.isArray(item?.reasons)
      ? unique(
          item.reasons
            .map((reason) => safeText(reason))
            .filter((reason): reason is string => reason !== null)
            .map(humanizeReportingReason),
        )
      : [];
    if (normalizedReasons.length === 0) return [];
    const goalId = safeText(item.goalId) ?? `excluded-goal-${index + 1}`;
    return [{
      goalId,
      goalName: safeText(item.goalName) ?? `Goal ${goalId}`,
      reasons: normalizedReasons,
    }];
  });
}

/** Implements the non negative integer operation. */
function nonNegativeInteger(value: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

/** Implements the finite or null operation. */
function finiteOrNull(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Implements the safe text operation. */
function safeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /^(?:nan|[+-]?infinity|undefined|null)$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/** Formats percentage. */
function formatPercentage(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(value);
}

/** Implements the pluralize operation. */
function pluralize(noun: string, count: number): string {
  return count === 1 ? noun : `${noun}s`;
}

/** Implements the clamp operation. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Implements the unique operation. */
function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
import { humanizeReportingReason } from "@/features/reporting/language";
