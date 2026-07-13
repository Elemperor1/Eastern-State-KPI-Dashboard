export interface GoalExclusionReasonViewModel {
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

export interface NormalizedGoalExclusionReason {
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

export function normalizePriorityGoalCompletionViewModel(
  input: PriorityGoalCompletionViewModel,
): NormalizedPriorityGoalCompletionViewModel {
  return {
    ...normalizeGoalCompletionViewModel(input),
    priorityId: safeText(input.priorityId) ?? "unassigned-priority",
    priorityName: safeText(input.priorityName) ?? "Unnamed strategic priority",
  };
}

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
            .map(humanizeExclusionReason),
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

const EXCLUSION_REASON_LABELS: Record<string, string> = {
  NO_ELIGIBLE_KPIS: "No required, fully configured KPIs are eligible",
  GOAL_NEEDS_DEFINITION: "Goal definition is not finalized",
  GOAL_NEEDS_TARGET: "Goal target is not finalized",
  GOAL_DRAFT: "Goal configuration is still a draft",
  GOAL_ARCHIVED: "Goal is archived",
  MANUAL_STATUS_REQUIRED: "Manual completion status has not been set",
  ZERO_WEIGHT_TOTAL: "KPI weights need a positive total",
  INVALID_COMPLETION_THRESHOLD: "The completion threshold needs correction",
  INVALID_THRESHOLD_COUNT: "The required KPI count needs correction",
  needs_definition: "One or more KPI definitions are not finalized",
  needs_target: "One or more KPI targets are not finalized",
  missing_progress: "Current KPI progress is not available",
  invalid_progress: "Current KPI progress needs correction",
  draft: "One or more KPI configurations are still drafts",
  archived: "One or more KPIs are archived",
  informational: "The KPI is informational and does not count toward completion",
};

function humanizeExclusionReason(reason: string): string {
  const known = EXCLUSION_REASON_LABELS[reason];
  if (known) return known;
  if (!/^[A-Za-z0-9_]+$/.test(reason) || !reason.includes("_")) return reason;

  const words = reason.toLowerCase().replaceAll("_", " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function nonNegativeInteger(value: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function finiteOrNull(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /^(?:nan|[+-]?infinity|undefined|null)$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function formatPercentage(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(value);
}

function pluralize(noun: string, count: number): string {
  return count === 1 ? noun : `${noun}s`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
