import {
  calculateGoalCompletion,
  type GoalCompletionResult,
  type GoalCompletionRule,
  type GoalKpiExclusionReason,
  type GoalKpiInput,
} from "./calculations";
import type { PersistedStrategicGoal } from "./records";

export type StrategicGoalCompletionDefinition = Pick<
  PersistedStrategicGoal,
  | "id"
  | "completion_rule"
  | "threshold_count"
  | "threshold_percentage"
  | "manual_status"
  | "configuration_status"
  | "unresolved_question"
>;

export interface StrategicGoalCompletionInput {
  goal: StrategicGoalCompletionDefinition;
  kpis: GoalKpiInput[];
}

/**
 * Apply goal-level readiness before the KPI completion rule. Reporting and
 * configuration summaries use this same boundary so an unresolved goal cannot
 * appear eligible in one surface and excluded in another.
 */
export function calculateStrategicGoalCompletion({
  goal,
  kpis,
}: StrategicGoalCompletionInput): GoalCompletionResult {
  if (goal.configuration_status !== "ready" && goal.configuration_status !== "active") {
    return excludedGoalResult(goal, kpis);
  }

  return calculateGoalCompletion({
    goalId: String(goal.id),
    rule: toGoalRule(goal),
    kpis,
  });
}

/** Implements the to goal rule operation. */
function toGoalRule(goal: StrategicGoalCompletionDefinition): GoalCompletionRule {
  switch (goal.completion_rule) {
    case "weighted_average":
      return {
        type: "weighted_average",
        ...(goal.threshold_percentage === null
          ? {}
          : { completionThresholdPercentage: goal.threshold_percentage }),
      };
    case "threshold_count":
      return {
        type: "threshold_count",
        ...(goal.threshold_count === null
          ? {}
          : { thresholdCount: goal.threshold_count }),
        ...(goal.threshold_percentage === null
          ? {}
          : { thresholdPercentage: goal.threshold_percentage }),
      };
    case "manual_status":
      return {
        type: "manual_status",
        complete:
          goal.manual_status === null
            ? null
            : goal.manual_status === "complete",
      };
    case "all_required_kpis":
      return { type: "all_required_kpis" };
  }
}

/** Implements the excluded goal result operation. */
function excludedGoalResult(
  goal: StrategicGoalCompletionDefinition,
  kpis: GoalKpiInput[],
): GoalCompletionResult {
  const code = `GOAL_${goal.configuration_status.toUpperCase()}`;
  const reason = goalExclusionReason(goal.configuration_status);
  return {
    goalId: String(goal.id),
    rule: goal.completion_rule,
    state: "missing",
    eligible: false,
    complete: false,
    completionPercentage: null,
    completedKpisCount: 0,
    totalEligibleKpisCount: 0,
    excludedKpisCount: kpis.length,
    excludedKpis: kpis.map((kpi) => ({
      id: kpi.id,
      label: kpi.label,
      reason,
    })),
    exclusionReasons: [code],
    issues: [{
      kind: "missing",
      code,
      message:
        goal.unresolved_question ??
        `Goal configuration is ${goal.configuration_status.replaceAll("_", " ")}.`,
      field: "configuration_status",
    }],
  };
}

/** Implements the goal exclusion reason operation. */
function goalExclusionReason(
  status: StrategicGoalCompletionDefinition["configuration_status"],
): GoalKpiExclusionReason {
  if (status === "needs_target") return "needs_target";
  if (status === "archived") return "archived";
  if (status === "draft") return "draft";
  return "needs_definition";
}
