"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Archive, RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  BOARD_STATUSES,
  CONFIGURATION_STATUSES,
  GOAL_COMPLETION_RULES,
  GOAL_MANUAL_STATUSES,
  GOAL_MEMBERSHIP_ROLES,
  STRATEGIC_PLAN_REPORTING_YEARS,
  type BoardStatus,
  type ConfigurationStatus,
  type GoalCompletionRuleName,
  type GoalManualStatus,
} from "@/features/strategy";
import { apiFetch } from "@/lib/api-client";
import {
  buildStrategicGoalLifecycleMutation,
  buildStrategicGoalMembershipMutation,
  buildStrategicGoalMembershipSuccessorMutation,
  buildStrategicGoalSettingsPayload,
  buildStrategicGoalUpdateMutation,
  buildStrategicGoalSuccessorMutation,
  canCreateGoalMembershipSuccessor,
  canCreateStrategicGoalSuccessor,
  filterStrategicGoals,
  formatStrategicGoalLabel,
  resolveStrategicGoalSelection,
  strategicGoalSuccessorPath,
  strategicGoalDraftFromData,
  strategicGoalMembershipDraftFromData,
  strategicGoalPriorityOptions,
  type EditableGoalConfigurationStatus,
  type StrategicGoalEditorRecord,
  type StrategicGoalFormErrors,
  type StrategicGoalMutation,
  type StrategicGoalMutationRunner,
  type StrategicGoalMembershipDraft,
  type StrategicGoalMembershipMutation,
  type StrategicGoalMembershipMutationRunner,
  type StrategicGoalSettingsDraft,
} from "@/components/strategic-goal-editor-model";
import {
  Badge,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  Select,
  StatusBanner,
  Textarea,
} from "@/components/ui";

type Feedback = { variant: "success" | "error"; message: string } | null;

const EDITABLE_CONFIGURATION_STATUSES = CONFIGURATION_STATUSES.filter(
  (status): status is EditableGoalConfigurationStatus => status !== "archived",
);

function issueMessage(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = issueMessage(item);
      if (nested) return nested;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.message === "string") return record.message;
  for (const nested of Object.values(record)) {
    const message = issueMessage(nested);
    if (message) return message;
  }
  return null;
}

function statusVariant(status: ConfigurationStatus) {
  if (status === "active" || status === "ready") return "success" as const;
  if (status === "needs_definition") return "error" as const;
  if (status === "needs_target") return "warning" as const;
  if (status === "archived") return "default" as const;
  return "info" as const;
}

function FieldHint({ error, fallback }: { error?: string; fallback?: string }) {
  return error ? (
    <span className="font-medium text-[var(--color-danger-text)]">{error}</span>
  ) : (
    fallback ?? null
  );
}

export function StrategicGoalsEditorClient({
  initialGoals,
  initialSelectedGoalId,
  reportingYear,
}: {
  initialGoals: StrategicGoalEditorRecord[];
  initialSelectedGoalId: number | null;
  reportingYear: number;
}) {
  const [goals, setGoals] = useState(initialGoals);
  const [priorityId, setPriorityId] = useState<number | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<number | null>(
    resolveStrategicGoalSelection(initialGoals, initialSelectedGoalId),
  );
  const router = useRouter();

  useEffect(() => {
    setGoals(initialGoals);
    setSelectedGoalId((current) =>
      resolveStrategicGoalSelection(
        initialGoals,
        initialSelectedGoalId ?? current,
      ),
    );
  }, [initialGoals, initialSelectedGoalId]);

  const priorityOptions = useMemo(
    () => strategicGoalPriorityOptions(goals),
    [goals],
  );
  const visibleGoals = useMemo(
    () => filterStrategicGoals(goals, { priorityId, includeArchived }),
    [goals, includeArchived, priorityId],
  );
  const selectedGoal =
    goals.find((goal) => goal.id === selectedGoalId) ?? visibleGoals[0] ?? null;

  const runMutation: StrategicGoalMutationRunner = async (
    mutation: StrategicGoalMutation,
  ) => {
    try {
      const response = await apiFetch(mutation.endpoint, {
        method: mutation.method,
        body: mutation.body,
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        issues?: unknown;
        goal?: Partial<StrategicGoalEditorRecord>;
        successor?: Partial<StrategicGoalEditorRecord> & {
          id: number;
          plan_start_year: number;
        };
      };
      if (!response.ok) {
        const detail = issueMessage(body.issues);
        return {
          ok: false,
          error: detail
            ? `${body.error ?? "Invalid input"}: ${detail}`
            : body.error ?? "The strategic goal could not be saved.",
        };
      }
      if (body.goal) {
        setGoals((current) =>
          current.map((goal) =>
            goal.id === body.goal?.id ? { ...goal, ...body.goal } : goal,
          ),
        );
        if (
          body.goal.archived_at &&
          !includeArchived &&
          body.goal.id === selectedGoalId
        ) {
          const nextGoal = goals.find(
            (goal) =>
              goal.id !== body.goal?.id &&
              goal.archived_at === null &&
              (priorityId === null || goal.priority_id === priorityId),
          );
          setSelectedGoalId(nextGoal?.id ?? null);
        }
      }
      if (body.successor) {
        router.push(strategicGoalSuccessorPath(body.successor));
        return { ok: true, error: null, goal: body.successor };
      }
      router.refresh();
      return { ok: true, error: null, goal: body.goal };
    } catch {
      return {
        ok: false,
        error: "The request could not be completed. Check the connection and try again.",
      };
    }
  };

  const runMembershipMutation: StrategicGoalMembershipMutationRunner = async (
    mutation: StrategicGoalMembershipMutation,
  ) => {
    try {
      const response = await apiFetch(mutation.endpoint, {
        method: mutation.method,
        body: mutation.body,
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        issues?: unknown;
        membership?: {
          id: number;
          role: "required" | "informational";
          weight: number;
          display_order: number;
        };
      };
      if (!response.ok) {
        const detail = issueMessage(body.issues);
        return {
          ok: false,
          error: detail
            ? `${body.error ?? "Invalid input"}: ${detail}`
            : body.error ?? "The KPI membership could not be saved.",
        };
      }
      if (body.membership) {
        const saved = body.membership;
        setGoals((current) =>
          current.map((goal) => ({
            ...goal,
            members: goal.members
              .map((member) =>
                member.id === saved.id
                  ? {
                      ...member,
                      role: saved.role,
                      weight: saved.weight,
                      displayOrder: saved.display_order,
                    }
                  : member,
              )
              .sort(
                (left, right) =>
                  left.displayOrder - right.displayOrder || left.id - right.id,
              ),
          })),
        );
      }
      router.refresh();
      return { ok: true, error: null, membership: body.membership };
    } catch {
      return {
        ok: false,
        error: "The request could not be completed. Check the connection and try again.",
      };
    }
  };

  function choosePriority(nextPriorityId: number | null) {
    setPriorityId(nextPriorityId);
    const nextGoals = filterStrategicGoals(goals, {
      priorityId: nextPriorityId,
      includeArchived,
    });
    if (!nextGoals.some((goal) => goal.id === selectedGoalId)) {
      setSelectedGoalId(nextGoals[0]?.id ?? null);
    }
  }

  function toggleArchived(nextIncludeArchived: boolean) {
    setIncludeArchived(nextIncludeArchived);
    const nextGoals = filterStrategicGoals(goals, {
      priorityId,
      includeArchived: nextIncludeArchived,
    });
    if (!nextGoals.some((goal) => goal.id === selectedGoalId)) {
      setSelectedGoalId(nextGoals[0]?.id ?? null);
    }
  }

  return (
    <div className="page-content page-content-wide page-enter">
      <Breadcrumb href="/admin" label="Back to administration" />
      <PageHeader
        eyebrow="Admin · Strategy"
        title="Strategic goals"
        subtitle={`Configure how the 2025–2029 plan's goals are evaluated for ${reportingYear}. The legacy annual KPI goals manager remains available separately.`}
        actions={<Badge variant="info">{goals.length} goals</Badge>}
      />

      <StatusBanner variant="neutral">
        Goal rules determine completion at the strategic-goal level. KPI measurements and targets are edited from the strategic KPI editor.
      </StatusBanner>

      <Card as="section" className="mb-6 p-5 lg:p-6" aria-labelledby="goal-selector-title">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="goal-selector-title" className="text-base font-semibold text-ink-900">
              Choose a strategic goal
            </h2>
            <p className="mt-1 text-sm leading-6 text-ink-500">
              Narrow by priority, then select the goal definition to edit.
            </p>
          </div>
          <p className="text-xs tabular-nums text-ink-500" aria-live="polite">
            {visibleGoals.length} visible
          </p>
        </div>
        <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,0.7fr)_minmax(0,1.4fr)_minmax(0,0.6fr)_minmax(13rem,0.7fr)]">
          <FormField label="Strategic priority" htmlFor="strategic-goal-priority">
            <Select
              id="strategic-goal-priority"
              value={priorityId ?? ""}
              onChange={(event) =>
                choosePriority(event.target.value ? Number(event.target.value) : null)
              }
            >
              <option value="">All priorities</option>
              {priorityOptions.map((priority) => (
                <option key={priority.id} value={priority.id}>
                  {priority.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Strategic goal" htmlFor="strategic-goal-selection">
            <Select
              id="strategic-goal-selection"
              value={selectedGoal?.id ?? ""}
              onChange={(event) => setSelectedGoalId(Number(event.target.value))}
              disabled={visibleGoals.length === 0}
            >
              {visibleGoals.length === 0 ? (
                <option value="">No matching goals</option>
              ) : null}
              {visibleGoals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.name}
                  {goal.archived_at ? " (Archived)" : ""}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Reporting year" htmlFor="strategic-goal-reporting-year">
            <Select
              id="strategic-goal-reporting-year"
              value={reportingYear}
              onChange={(event) =>
                router.push(
                  `/admin/strategic-goals?year=${Number(event.target.value)}`,
                )
              }
            >
              {STRATEGIC_PLAN_REPORTING_YEARS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Select>
          </FormField>
          <Checkbox
            id="include-archived-strategic-goals"
            checked={includeArchived}
            onChange={(event) => toggleArchived(event.target.checked)}
            label="Include archived goals"
            description="Archived records remain read-only until restored."
          />
        </div>
      </Card>

      {selectedGoal ? (
        <StrategicGoalSettingsForm
          key={selectedGoal.id}
          goal={selectedGoal}
          reportingYear={reportingYear}
          runMutation={runMutation}
          runMembershipMutation={runMembershipMutation}
        />
      ) : (
        <EmptyState
          title="No strategic goals match"
          description="Change the priority filter or include archived goals."
        />
      )}
    </div>
  );
}

export function StrategicGoalSettingsForm({
  goal,
  reportingYear,
  runMutation,
  runMembershipMutation,
}: {
  goal: StrategicGoalEditorRecord;
  reportingYear: number;
  runMutation: StrategicGoalMutationRunner;
  runMembershipMutation: StrategicGoalMembershipMutationRunner;
}) {
  const [draft, setDraft] = useState(() => strategicGoalDraftFromData(goal));
  const [errors, setErrors] = useState<StrategicGoalFormErrors>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [successorMode, setSuccessorMode] = useState(false);
  const [successorStartYear, setSuccessorStartYear] = useState(
    String(Math.max(goal.plan_start_year + 1, reportingYear + 1)),
  );
  const archived = goal.archived_at !== null;
  const successorAvailable = canCreateStrategicGoalSuccessor(
    goal,
    reportingYear,
  );

  useEffect(() => {
    setDraft(strategicGoalDraftFromData(goal));
    setErrors({});
    setFeedback(null);
    setSuccessorMode(false);
    setSuccessorStartYear(
      String(Math.max(goal.plan_start_year + 1, reportingYear + 1)),
    );
  }, [goal, reportingYear]);

  function update<K extends keyof StrategicGoalSettingsDraft>(
    key: K,
    value: StrategicGoalSettingsDraft[K],
    ...errorKeys: string[]
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      for (const errorKey of errorKeys) delete next[errorKey];
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const built = buildStrategicGoalSettingsPayload(goal, draft);
    if (!built.ok) {
      setErrors(built.errors);
      setFeedback({
        variant: "error",
        message:
          Object.values(built.errors)[0] ?? "Review the highlighted fields.",
      });
      return;
    }
    setErrors({});
    const effectiveStartYear = Number(successorStartYear);
    if (
      successorMode &&
      (!Number.isInteger(effectiveStartYear) ||
        effectiveStartYear <= goal.plan_start_year ||
        effectiveStartYear > goal.plan_end_year)
    ) {
      setErrors({
        effective_start_year: `Choose a whole year after ${goal.plan_start_year} and no later than ${goal.plan_end_year}.`,
      });
      setFeedback({
        variant: "error",
        message: "Choose a valid successor start year.",
      });
      return;
    }
    setBusy(true);
    const result = await runMutation(
      successorMode
        ? buildStrategicGoalSuccessorMutation(
            goal.id,
            effectiveStartYear,
            built.payload,
          )
        : buildStrategicGoalUpdateMutation(built.payload),
    );
    setBusy(false);
    setFeedback(
      result.ok
        ? {
            variant: "success",
            message: successorMode
              ? "Successor goal version saved. Select its first reporting year to review it."
              : "Strategic goal settings saved.",
          }
        : {
            variant: "error",
            message: result.error ?? "The strategic goal could not be saved.",
          },
    );
  }

  async function lifecycle(action: "archive" | "restore") {
    setConfirmArchive(false);
    setFeedback(null);
    setBusy(true);
    const result = await runMutation(
      buildStrategicGoalLifecycleMutation(goal.id, action),
    );
    setBusy(false);
    setFeedback(
      result.ok
        ? {
            variant: "success",
            message:
              action === "archive"
                ? "Strategic goal archived."
                : "Strategic goal restored.",
          }
        : {
            variant: "error",
            message: result.error ?? `The goal could not be ${action}d.`,
          },
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <Card as="section" className="p-5 lg:p-6" aria-labelledby="strategic-goal-settings-title">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-brand-700">
              {goal.priority_name}
            </p>
            <h2 id="strategic-goal-settings-title" className="mt-1 text-xl font-semibold text-ink-900">
              {goal.name}
            </h2>
            {goal.description ? (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-600">
                {goal.description}
              </p>
            ) : null}
          </div>
          <Badge variant={statusVariant(goal.configuration_status)}>
            {formatStrategicGoalLabel(goal.configuration_status)}
          </Badge>
        </div>

        {archived ? (
          <StatusBanner variant="error">
            This strategic goal is archived. Restore it before changing completion or governance settings.
          </StatusBanner>
        ) : null}
        {feedback ? (
          <StatusBanner variant={feedback.variant}>{feedback.message}</StatusBanner>
        ) : null}
        {successorMode ? (
          <StatusBanner variant="neutral">
            The current goal and its memberships will end one year before the successor starts. Historical rule results remain attached to this version.
          </StatusBanner>
        ) : null}

        <form onSubmit={submit} noValidate>
          <fieldset disabled={busy || archived} className="space-y-8">
            {successorMode ? (
              <FormField
                label="Successor start year"
                htmlFor="strategic-goal-successor-start"
                hint={<FieldHint error={errors.effective_start_year} />}
                className="max-w-xs"
              >
                <Input
                  id="strategic-goal-successor-start"
                  type="number"
                  min={goal.plan_start_year + 1}
                  max={goal.plan_end_year}
                  value={successorStartYear}
                  aria-invalid={Boolean(errors.effective_start_year)}
                  onChange={(event) => {
                    setSuccessorStartYear(event.target.value);
                    setErrors((current) => {
                      const next = { ...current };
                      delete next.effective_start_year;
                      return next;
                    });
                  }}
                />
              </FormField>
            ) : null}
            <section aria-labelledby="goal-completion-fields-title">
              <h3 id="goal-completion-fields-title" className="mb-4 text-base font-semibold text-ink-900">
                Completion logic
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                <FormField label="Completion rule" htmlFor="strategic-goal-completion-rule">
                  <Select
                    id="strategic-goal-completion-rule"
                    value={draft.completionRule}
                    onChange={(event) =>
                      update(
                        "completionRule",
                        event.target.value as GoalCompletionRuleName,
                        "completion_rule",
                        "threshold_count",
                        "threshold_percentage",
                        "manual_status",
                      )
                    }
                  >
                    {GOAL_COMPLETION_RULES.map((rule) => (
                      <option key={rule} value={rule}>
                        {formatStrategicGoalLabel(rule)}
                      </option>
                    ))}
                  </Select>
                </FormField>

                {draft.completionRule === "threshold_count" ? (
                  <>
                    <FormField label="Threshold type" htmlFor="strategic-goal-threshold-type">
                      <Select
                        id="strategic-goal-threshold-type"
                        value={draft.thresholdMode}
                        onChange={(event) =>
                          update(
                            "thresholdMode",
                            event.target.value as "count" | "percentage",
                            "threshold_count",
                            "threshold_percentage",
                          )
                        }
                      >
                        <option value="count">KPI count</option>
                        <option value="percentage">Percentage of KPIs</option>
                      </Select>
                    </FormField>
                    <FormField
                      label="Threshold value"
                      htmlFor="strategic-goal-threshold-value"
                      hint={
                        <FieldHint
                          error={
                            errors.threshold_count ?? errors.threshold_percentage
                          }
                          fallback={
                            draft.thresholdMode === "count"
                              ? "Positive whole number of eligible KPIs."
                              : "Percentage from greater than 0 through 100."
                          }
                        />
                      }
                    >
                      <Input
                        id="strategic-goal-threshold-value"
                        type="number"
                        min={draft.thresholdMode === "count" ? 1 : 0.01}
                        max={draft.thresholdMode === "percentage" ? 100 : undefined}
                        step={draft.thresholdMode === "count" ? 1 : 0.1}
                        value={draft.thresholdValue}
                        aria-invalid={Boolean(
                          errors.threshold_count || errors.threshold_percentage,
                        )}
                        onChange={(event) =>
                          update(
                            "thresholdValue",
                            event.target.value,
                            "threshold_count",
                            "threshold_percentage",
                          )
                        }
                      />
                    </FormField>
                  </>
                ) : null}

                {draft.completionRule === "manual_status" ? (
                  <FormField
                    label="Manual completion status"
                    htmlFor="strategic-goal-manual-status"
                    hint={<FieldHint error={errors.manual_status} />}
                  >
                    <Select
                      id="strategic-goal-manual-status"
                      value={draft.manualStatus}
                      aria-invalid={Boolean(errors.manual_status)}
                      onChange={(event) =>
                        update(
                          "manualStatus",
                          event.target.value as GoalManualStatus | "",
                          "manual_status",
                        )
                      }
                    >
                      <option value="">Choose a manual status</option>
                      {GOAL_MANUAL_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {formatStrategicGoalLabel(status)}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                ) : null}
              </div>
            </section>

            <section aria-labelledby="goal-status-fields-title">
              <h3 id="goal-status-fields-title" className="mb-4 text-base font-semibold text-ink-900">
                Reporting and configuration status
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField label="Board status" htmlFor="strategic-goal-board-status">
                  <Select
                    id="strategic-goal-board-status"
                    value={draft.boardStatus}
                    onChange={(event) =>
                      update(
                        "boardStatus",
                        event.target.value as BoardStatus,
                        "board_level_status",
                      )
                    }
                  >
                    {BOARD_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {formatStrategicGoalLabel(status)}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField
                  label="Configuration status"
                  htmlFor="strategic-goal-configuration-status"
                >
                  <Select
                    id="strategic-goal-configuration-status"
                    value={draft.configurationStatus}
                    onChange={(event) =>
                      update(
                        "configurationStatus",
                        event.target.value as EditableGoalConfigurationStatus,
                        "configuration_status",
                        "unresolved_question",
                      )
                    }
                  >
                    {EDITABLE_CONFIGURATION_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {formatStrategicGoalLabel(status)}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <FormField
                label="Unresolved question"
                htmlFor="strategic-goal-unresolved-question"
                className="mt-4"
                hint={
                  <FieldHint
                    error={errors.unresolved_question}
                    fallback="Required when the goal needs a definition or target."
                  />
                }
              >
                <Textarea
                  id="strategic-goal-unresolved-question"
                  value={draft.unresolvedQuestion}
                  aria-invalid={Boolean(errors.unresolved_question)}
                  onChange={(event) =>
                    update(
                      "unresolvedQuestion",
                      event.target.value,
                      "unresolved_question",
                    )
                  }
                />
              </FormField>
            </section>

            <section aria-labelledby="goal-governance-fields-title">
              <h3 id="goal-governance-fields-title" className="mb-4 text-base font-semibold text-ink-900">
                Ownership and review
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                <FormField label="Owner" htmlFor="strategic-goal-owner" hint={<FieldHint error={errors.owner} />}>
                  <Input
                    id="strategic-goal-owner"
                    value={draft.owner}
                    onChange={(event) => update("owner", event.target.value, "owner")}
                  />
                </FormField>
                <FormField label="Due date" htmlFor="strategic-goal-due-date" hint={<FieldHint error={errors.due_date} />}>
                  <Input
                    id="strategic-goal-due-date"
                    type="date"
                    value={draft.dueDate}
                    aria-invalid={Boolean(errors.due_date)}
                    onChange={(event) => update("dueDate", event.target.value, "due_date")}
                  />
                </FormField>
                <FormField label="Last reviewed" htmlFor="strategic-goal-last-reviewed" hint={<FieldHint error={errors.last_reviewed_date} />}>
                  <Input
                    id="strategic-goal-last-reviewed"
                    type="date"
                    value={draft.lastReviewedDate}
                    aria-invalid={Boolean(errors.last_reviewed_date)}
                    onChange={(event) =>
                      update(
                        "lastReviewedDate",
                        event.target.value,
                        "last_reviewed_date",
                      )
                    }
                  />
                </FormField>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <FormField label="Resolution notes" htmlFor="strategic-goal-resolution-notes" hint={<FieldHint error={errors.resolution_notes} />}>
                  <Textarea
                    id="strategic-goal-resolution-notes"
                    value={draft.resolutionNotes}
                    onChange={(event) =>
                      update(
                        "resolutionNotes",
                        event.target.value,
                        "resolution_notes",
                      )
                    }
                  />
                </FormField>
                <FormField label="Source reference" htmlFor="strategic-goal-source-reference" hint={<FieldHint error={errors.source_reference} />}>
                  <Textarea
                    id="strategic-goal-source-reference"
                    value={draft.sourceReference}
                    onChange={(event) =>
                      update(
                        "sourceReference",
                        event.target.value,
                        "source_reference",
                      )
                    }
                  />
                </FormField>
              </div>
            </section>

          </fieldset>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 pt-5">
            <Button
              type="button"
              variant={archived ? "secondary" : "danger"}
              icon={archived ? RotateCcw : Archive}
              disabled={busy}
              onClick={() =>
                archived ? void lifecycle("restore") : setConfirmArchive(true)
              }
            >
              {archived ? "Restore goal" : "Archive goal"}
            </Button>
            <div className="flex flex-wrap gap-3">
              {!archived && successorAvailable ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setSuccessorMode((current) => !current);
                    setFeedback(null);
                    setErrors({});
                  }}
                >
                  {successorMode ? "Cancel successor" : "Create successor version"}
                </Button>
              ) : null}
              <Button
                type="submit"
                variant="primary"
                icon={Save}
                isLoading={busy}
                disabled={archived}
              >
                {successorMode ? "Save successor version" : "Save goal settings"}
              </Button>
            </div>
          </div>
        </form>

        <ConfirmDialog
          open={confirmArchive}
          title={`Archive “${goal.name}”?`}
          description="The goal will be excluded from active strategic-plan editing and reporting. Its memberships, history, and configuration will be preserved."
          confirmLabel="Archive goal"
          onConfirm={() => lifecycle("archive")}
          onClose={() => setConfirmArchive(false)}
        />
      </Card>

      <Card as="section" variant="quiet" className="p-5" aria-labelledby="goal-kpi-context-title">
        <h2 id="goal-kpi-context-title" className="text-base font-semibold text-ink-900">
          KPI membership
        </h2>
        <p className="mt-1 text-xs leading-5 text-ink-500">
          Informational KPIs do not block completion. Unresolved KPIs are excluded from the denominator.
        </p>
        <ul className="mt-4 space-y-4">
          {goal.members.map((member) => (
            <li
              key={member.id}
              className="border-t border-ink-200 pt-4 first:border-t-0 first:pt-0"
            >
              <StrategicGoalMembershipForm
                member={member}
                reportingYear={reportingYear}
                disabled={archived}
                runMutation={runMembershipMutation}
              />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function StrategicGoalMembershipForm({
  member,
  reportingYear,
  disabled,
  runMutation,
}: {
  member: StrategicGoalEditorRecord["members"][number];
  reportingYear: number;
  disabled: boolean;
  runMutation: StrategicGoalMembershipMutationRunner;
}) {
  const [draft, setDraft] = useState<StrategicGoalMembershipDraft>(() =>
    strategicGoalMembershipDraftFromData(member),
  );
  const [errors, setErrors] = useState<StrategicGoalFormErrors>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [successorMode, setSuccessorMode] = useState(false);
  const [successorStartYear, setSuccessorStartYear] = useState(
    String(Math.max(member.effectiveFromYear + 1, reportingYear + 1)),
  );
  const successorAvailable = canCreateGoalMembershipSuccessor(
    member,
    reportingYear,
  );

  useEffect(() => {
    setDraft(strategicGoalMembershipDraftFromData(member));
    setErrors({});
    setSuccessorMode(false);
    setSuccessorStartYear(
      String(Math.max(member.effectiveFromYear + 1, reportingYear + 1)),
    );
  }, [member, reportingYear]);

  function update<K extends keyof StrategicGoalMembershipDraft>(
    key: K,
    value: StrategicGoalMembershipDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key === "displayOrder" ? "display_order" : key];
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const built = successorMode
      ? buildStrategicGoalMembershipSuccessorMutation(
          member.id,
          Number(successorStartYear),
          draft,
        )
      : buildStrategicGoalMembershipMutation(member.id, draft);
    if (!built.ok) {
      setErrors(built.errors);
      setFeedback({
        variant: "error",
        message:
          Object.values(built.errors)[0] ?? "Review the membership fields.",
      });
      return;
    }
    setErrors({});
    setBusy(true);
    const result = await runMutation(built.mutation);
    setBusy(false);
    setFeedback(
      result.ok
        ? {
            variant: "success",
            message: successorMode
              ? "Successor membership saved."
              : "KPI membership saved.",
          }
        : {
            variant: "error",
            message: result.error ?? "The KPI membership could not be saved.",
          },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold leading-5 text-ink-900">
            {member.name}
          </p>
          <p className="mt-1 text-xs tabular-nums text-ink-500">
            Effective {member.effectiveFromYear}
            {member.effectiveToYear === null
              ? " onward"
              : `–${member.effectiveToYear}`}
          </p>
        </div>
        {member.configurationStatus ? (
          <Badge variant={statusVariant(member.configurationStatus)}>
            {formatStrategicGoalLabel(member.configurationStatus)}
          </Badge>
        ) : (
          <Badge variant="warning">Not configured</Badge>
        )}
      </div>
      {feedback ? (
        <StatusBanner variant={feedback.variant} className="mb-0">
          {feedback.message}
        </StatusBanner>
      ) : null}
      <fieldset disabled={disabled || busy} className="space-y-3">
        {successorMode ? (
          <FormField
            label="Successor start year"
            htmlFor={`goal-membership-successor-${member.id}`}
            hint={<FieldHint error={errors.effective_start_year} />}
          >
            <Input
              id={`goal-membership-successor-${member.id}`}
              type="number"
              min={member.effectiveFromYear + 1}
              max={Math.min(member.effectiveToYear ?? 2029, 2029)}
              value={successorStartYear}
              aria-invalid={Boolean(errors.effective_start_year)}
              onChange={(event) => setSuccessorStartYear(event.target.value)}
            />
          </FormField>
        ) : null}
        <FormField
          label="Completion role"
          htmlFor={`goal-membership-role-${member.id}`}
          hint={<FieldHint error={errors.role} />}
        >
          <Select
            id={`goal-membership-role-${member.id}`}
            value={draft.role}
            aria-invalid={Boolean(errors.role)}
            onChange={(event) =>
              update(
                "role",
                event.target.value as StrategicGoalMembershipDraft["role"],
              )
            }
          >
            {GOAL_MEMBERSHIP_ROLES.map((role) => (
              <option key={role} value={role}>
                {formatStrategicGoalLabel(role)}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Weight"
            htmlFor={`goal-membership-weight-${member.id}`}
            hint={<FieldHint error={errors.weight} fallback="Must be greater than zero." />}
          >
            <Input
              id={`goal-membership-weight-${member.id}`}
              type="number"
              min="0.01"
              step="any"
              value={draft.weight}
              aria-invalid={Boolean(errors.weight)}
              onChange={(event) => update("weight", event.target.value)}
            />
          </FormField>
          <FormField
            label="Display order"
            htmlFor={`goal-membership-order-${member.id}`}
            hint={<FieldHint error={errors.display_order} />}
          >
            <Input
              id={`goal-membership-order-${member.id}`}
              type="number"
              min={0}
              step={1}
              value={draft.displayOrder}
              aria-invalid={Boolean(errors.display_order)}
              onChange={(event) => update("displayOrder", event.target.value)}
            />
          </FormField>
        </div>
      </fieldset>
      <div className="grid grid-cols-1 gap-2">
        {successorAvailable ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || busy}
            onClick={() => {
              setSuccessorMode((current) => !current);
              setFeedback(null);
              setErrors({});
            }}
            className="w-full"
          >
            {successorMode ? "Cancel successor" : "Create successor membership"}
          </Button>
        ) : null}
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          icon={Save}
          isLoading={busy}
          disabled={disabled}
          className="w-full"
        >
          {successorMode ? "Save successor membership" : "Save membership"}
        </Button>
      </div>
    </form>
  );
}
