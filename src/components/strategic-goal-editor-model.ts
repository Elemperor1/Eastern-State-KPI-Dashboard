import {
  StrategicGoalInputSchema,
  StrategicGoalMembershipUpdateSchema,
  type BoardStatus,
  type ConfigurationStatus,
  type GoalCompletionRuleName,
  type GoalManualStatus,
  type GoalMembershipRole,
  type PersistedGoalMembership,
  type PersistedStrategicGoal,
} from "@/features/strategy";

export const STRATEGIC_GOALS_ENDPOINT = "/api/strategy/goals";
export const STRATEGIC_GOAL_MEMBERSHIPS_ENDPOINT =
  "/api/strategy/memberships";

export type EditableGoalConfigurationStatus = Exclude<
  ConfigurationStatus,
  "archived"
>;

export interface StrategicGoalMemberSummary {
  id: number;
  name: string;
  role: GoalMembershipRole;
  weight: number;
  displayOrder: number;
  effectiveFromYear: number;
  effectiveToYear: number | null;
  configurationStatus: ConfigurationStatus | null;
}

export interface StrategicGoalEditorRecord extends PersistedStrategicGoal {
  members: StrategicGoalMemberSummary[];
}

export interface StrategicGoalSettingsDraft {
  completionRule: GoalCompletionRuleName;
  thresholdMode: "count" | "percentage";
  thresholdValue: string;
  manualStatus: GoalManualStatus | "";
  boardStatus: BoardStatus;
  configurationStatus: EditableGoalConfigurationStatus;
  unresolvedQuestion: string;
  owner: string;
  dueDate: string;
  resolutionNotes: string;
  sourceReference: string;
  lastReviewedDate: string;
}

export type StrategicGoalFormErrors = Record<string, string>;

export type StrategicGoalPayloadResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; errors: StrategicGoalFormErrors };

export interface StrategicGoalMutation {
  endpoint: typeof STRATEGIC_GOALS_ENDPOINT;
  method: "PATCH";
  body: Record<string, unknown>;
}

interface StrategicGoalMutationResult {
  ok: boolean;
  error: string | null;
  goal?: Partial<PersistedStrategicGoal>;
}

export type StrategicGoalMutationRunner = (
  mutation: StrategicGoalMutation,
) => Promise<StrategicGoalMutationResult>;

export interface StrategicGoalMembershipDraft {
  role: GoalMembershipRole;
  weight: string;
  displayOrder: string;
}

export interface StrategicGoalMembershipMutation {
  endpoint: typeof STRATEGIC_GOAL_MEMBERSHIPS_ENDPOINT;
  method: "PATCH";
  body: Record<string, unknown>;
}

interface StrategicGoalMembershipMutationResult {
  ok: boolean;
  error: string | null;
  membership?: Pick<
    PersistedGoalMembership,
    "id" | "role" | "weight" | "display_order"
  >;
}

export type StrategicGoalMembershipMutationRunner = (
  mutation: StrategicGoalMembershipMutation,
) => Promise<StrategicGoalMembershipMutationResult>;

export interface StrategicGoalFilters {
  priorityId: number | null;
  includeArchived: boolean;
}

/** Determines whether can create strategic goal successor. */
export function canCreateStrategicGoalSuccessor(
  goal: Pick<StrategicGoalEditorRecord, "plan_start_year" | "plan_end_year">,
  reportingYear: number,
  planEndYear: number,
): boolean {
  return (
    reportingYear < planEndYear &&
    Math.max(goal.plan_start_year + 1, reportingYear + 1) <=
      Math.min(goal.plan_end_year, planEndYear)
  );
}

/** Determines whether can create goal membership successor. */
export function canCreateGoalMembershipSuccessor(
  membership: Pick<
    StrategicGoalMemberSummary,
    "effectiveFromYear" | "effectiveToYear"
  >,
  reportingYear: number,
  planEndYear: number,
): boolean {
  const finalYear = Math.min(
    membership.effectiveToYear ?? planEndYear,
    planEndYear,
  );
  return (
    reportingYear < planEndYear &&
    Math.max(membership.effectiveFromYear + 1, reportingYear + 1) <= finalYear
  );
}

/** Retrieves strategic goal selection. */
export function resolveStrategicGoalSelection(
  goals: StrategicGoalEditorRecord[],
  requestedGoalId: number | null,
): number | null {
  if (
    requestedGoalId !== null &&
    goals.some((goal) => goal.id === requestedGoalId)
  ) {
    return requestedGoalId;
  }
  return (
    goals.find((goal) => goal.archived_at === null)?.id ?? goals[0]?.id ?? null
  );
}

/** Implements the strategic goal successor path operation. */
export function strategicGoalSuccessorPath(
  successor: Pick<PersistedStrategicGoal, "id" | "plan_start_year">,
): string {
  return `/setup?area=goals&year=${successor.plan_start_year}&goal=${successor.id}`;
}

/** Implements the optional text operation. */
function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Implements the errors from issues operation. */
function errorsFromIssues(
  issues: Array<{ path: PropertyKey[]; message: string }>,
): StrategicGoalFormErrors {
  const errors: StrategicGoalFormErrors = {};
  for (const issue of issues) {
    const field = issue.path.join(".") || "form";
    if (!errors[field]) errors[field] = issue.message;
  }
  return errors;
}

/** Implements the strategic goal membership draft from data operation. */
export function strategicGoalMembershipDraftFromData(
  membership: StrategicGoalMemberSummary,
): StrategicGoalMembershipDraft {
  return {
    role: membership.role,
    weight: String(membership.weight),
    displayOrder: String(membership.displayOrder),
  };
}

/** Builds strategic goal membership mutation. */
export function buildStrategicGoalMembershipMutation(
  membershipId: number,
  draft: StrategicGoalMembershipDraft,
):
  | {
      ok: true;
      mutation: StrategicGoalMembershipMutation;
      errors: Record<string, never>;
    }
  | { ok: false; mutation: null; errors: StrategicGoalFormErrors } {
  const weight = draft.weight.trim() === "" ? Number.NaN : Number(draft.weight);
  const displayOrder =
    draft.displayOrder.trim() === ""
      ? Number.NaN
      : Number(draft.displayOrder);
  const parsed = StrategicGoalMembershipUpdateSchema.safeParse({
    id: membershipId,
    role: draft.role,
    weight,
    display_order: displayOrder,
  });
  if (!parsed.success) {
    return {
      ok: false,
      mutation: null,
      errors: errorsFromIssues(parsed.error.issues),
    };
  }
  return {
    ok: true,
    errors: {},
    mutation: {
      endpoint: STRATEGIC_GOAL_MEMBERSHIPS_ENDPOINT,
      method: "PATCH",
      body: parsed.data,
    },
  };
}

/** Builds strategic goal membership successor mutation. */
export function buildStrategicGoalMembershipSuccessorMutation(
  membershipId: number,
  effectiveStartYear: number,
  draft: StrategicGoalMembershipDraft,
  planStartYear: number,
  planEndYear: number,
): ReturnType<typeof buildStrategicGoalMembershipMutation> {
  const built = buildStrategicGoalMembershipMutation(membershipId, draft);
  if (!built.ok) return built;
  if (
    !Number.isInteger(effectiveStartYear) ||
    effectiveStartYear < planStartYear ||
    effectiveStartYear > planEndYear
  ) {
    return {
      ok: false,
      mutation: null,
      errors: {
        effective_start_year: `Use a whole strategic-plan year from ${planStartYear} through ${planEndYear}.`,
      },
    };
  }
  const update = built.mutation.body as {
    role: GoalMembershipRole;
    weight: number;
    display_order: number;
  };
  return {
    ok: true,
    errors: {},
    mutation: {
      endpoint: STRATEGIC_GOAL_MEMBERSHIPS_ENDPOINT,
      method: "PATCH",
      body: {
        action: "create_successor",
        predecessor_id: membershipId,
        effective_start_year: effectiveStartYear,
        role: update.role,
        weight: update.weight,
        display_order: update.display_order,
      },
    },
  };
}

/** Implements the strategic goal draft from data operation. */
export function strategicGoalDraftFromData(
  goal: StrategicGoalEditorRecord,
): StrategicGoalSettingsDraft {
  return {
    completionRule: goal.completion_rule,
    thresholdMode:
      goal.threshold_percentage !== null ? "percentage" : "count",
    thresholdValue:
      goal.threshold_percentage !== null
        ? String(goal.threshold_percentage)
        : goal.threshold_count !== null
          ? String(goal.threshold_count)
          : "",
    manualStatus: goal.manual_status ?? "",
    boardStatus: goal.board_level_status,
    configurationStatus:
      goal.configuration_status === "archived"
        ? "draft"
        : goal.configuration_status,
    unresolvedQuestion: goal.unresolved_question ?? "",
    owner: goal.owner ?? "",
    dueDate: goal.due_date ?? "",
    resolutionNotes: goal.resolution_notes ?? "",
    sourceReference: goal.source_reference ?? "",
    lastReviewedDate: goal.last_reviewed_date ?? "",
  };
}

/** Builds strategic goal settings payload. */
export function buildStrategicGoalSettingsPayload(
  goal: StrategicGoalEditorRecord,
  draft: StrategicGoalSettingsDraft,
): StrategicGoalPayloadResult {
  const thresholdNumber = draft.thresholdValue.trim()
    ? Number(draft.thresholdValue)
    : null;
  const thresholdCount =
    draft.completionRule === "threshold_count" &&
    draft.thresholdMode === "count"
      ? thresholdNumber
      : null;
  const thresholdPercentage =
    draft.completionRule === "threshold_count" &&
    draft.thresholdMode === "percentage"
      ? thresholdNumber
      : null;
  const manualStatus =
    draft.completionRule === "manual_status"
      ? draft.manualStatus || null
      : null;

  const parsed = StrategicGoalInputSchema.safeParse({
    priority_id: goal.priority_id,
    slug: goal.slug,
    name: goal.name,
    description: goal.description,
    completion_rule: draft.completionRule,
    threshold_count: thresholdCount,
    threshold_percentage: thresholdPercentage,
    manual_status: manualStatus,
    board_level_status: draft.boardStatus,
    display_order: goal.sort_order,
    effective_start_year: goal.plan_start_year,
    effective_end_year: goal.plan_end_year,
    configuration_status: draft.configurationStatus,
    unresolved_question: optionalText(draft.unresolvedQuestion),
    owner: optionalText(draft.owner),
    due_date: optionalText(draft.dueDate),
    resolution_notes: optionalText(draft.resolutionNotes),
    source_reference: optionalText(draft.sourceReference),
    last_reviewed_date: optionalText(draft.lastReviewedDate),
  });
  if (!parsed.success) {
    return { ok: false, errors: errorsFromIssues(parsed.error.issues) };
  }
  const value = parsed.data;
  return {
    ok: true,
    payload: {
      id: goal.id,
      completion_rule: value.completion_rule,
      threshold_count: value.threshold_count,
      threshold_percentage: value.threshold_percentage,
      manual_status: value.manual_status,
      board_level_status: value.board_level_status,
      configuration_status: value.configuration_status,
      unresolved_question: value.unresolved_question,
      owner: value.owner,
      due_date: value.due_date,
      resolution_notes: value.resolution_notes,
      source_reference: value.source_reference,
      last_reviewed_date: value.last_reviewed_date,
    },
  };
}

/** Builds strategic goal update mutation. */
export function buildStrategicGoalUpdateMutation(
  payload: Record<string, unknown>,
): StrategicGoalMutation {
  return {
    endpoint: STRATEGIC_GOALS_ENDPOINT,
    method: "PATCH",
    body: { action: "update", update: payload },
  };
}

/** Builds strategic goal successor mutation. */
export function buildStrategicGoalSuccessorMutation(
  predecessorId: number,
  effectiveStartYear: number,
  payload: Record<string, unknown>,
): StrategicGoalMutation {
  return {
    endpoint: STRATEGIC_GOALS_ENDPOINT,
    method: "PATCH",
    body: {
      action: "create_successor",
      predecessor_id: predecessorId,
      effective_start_year: effectiveStartYear,
      update: payload,
    },
  };
}

/** Builds strategic goal lifecycle mutation. */
export function buildStrategicGoalLifecycleMutation(
  id: number,
  action: "archive" | "restore",
): StrategicGoalMutation {
  return {
    endpoint: STRATEGIC_GOALS_ENDPOINT,
    method: "PATCH",
    body: { action, id },
  };
}

/** Implements the filter strategic goals operation. */
export function filterStrategicGoals(
  goals: StrategicGoalEditorRecord[],
  filters: StrategicGoalFilters,
): StrategicGoalEditorRecord[] {
  return goals.filter(
    (goal) =>
      (filters.priorityId === null || goal.priority_id === filters.priorityId) &&
      (filters.includeArchived || goal.archived_at === null),
  );
}

/** Implements the strategic goal priority options operation. */
export function strategicGoalPriorityOptions(
  goals: StrategicGoalEditorRecord[],
): Array<{ id: number; name: string }> {
  return Array.from(
    new Map(
      goals.map((goal) => [
        goal.priority_id,
        { id: goal.priority_id, name: goal.priority_name },
      ]),
    ).values(),
  ).sort((left, right) => left.name.localeCompare(right.name));
}

/** Formats strategic goal label. */
export function formatStrategicGoalLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (first) => first.toLocaleUpperCase());
}
