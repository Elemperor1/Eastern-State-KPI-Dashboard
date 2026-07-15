"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type SetStateAction,
} from "react";
import { Archive, RotateCcw, Save } from "lucide-react";
import Link from "next/link";
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
import { runEventHandler } from "@/lib/async-event";
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
  targetDraftForScope,
  type StrategicKpiEditorData,
  type StrategyEditorMutation,
  type StrategyEditorMutationRunner,
} from "@/components/strategic-kpi-editor-model";
import { StrategicTargetEditorCard } from "@/components/StrategicTargetEditorCard";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  FormField,
  Input,
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

function completionRuleLabel(rule: GoalCompletionRuleName): string {
  if (rule === "all_required_kpis") return "Every required measure";
  if (rule === "weighted_average") return "Weighted progress";
  if (rule === "threshold_count") return "A set number of measures";
  return "Set manually";
}

function setupStatusLabel(status: ConfigurationStatus | null): string {
  if (status === "active" || status === "ready") return "Ready";
  if (status === "archived") return "Archived";
  return "Needs attention";
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
  targetData = [],
}: {
  initialGoals: StrategicGoalEditorRecord[];
  initialSelectedGoalId: number | null;
  reportingYear: number;
  targetData?: StrategicKpiEditorData[];
}) {
  const [goalState, setGoalState] = useState({
    source: initialGoals,
    values: initialGoals,
  });
  const [priorityId, setPriorityId] = useState<number | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const routeSelectedGoalId =
    initialSelectedGoalId === null
      ? null
      : resolveStrategicGoalSelection(initialGoals, initialSelectedGoalId);
  const [selectionOverride, setSelectionOverride] = useState<{
    source: StrategicGoalEditorRecord[];
    routeSelectedGoalId: number | null;
    selectedGoalId: null;
  } | null>(null);
  const goals = goalState.source === initialGoals ? goalState.values : initialGoals;
  const selectedGoalId =
    selectionOverride?.source === initialGoals &&
    selectionOverride.routeSelectedGoalId === routeSelectedGoalId
      ? selectionOverride.selectedGoalId
      : routeSelectedGoalId;
  const router = useRouter();
  const returnFocusGoalId = useRef<number | null>(null);

  useEffect(() => {
    setGoalState({ source: initialGoals, values: initialGoals });
  }, [initialGoals]);

  function updateGoals(update: SetStateAction<StrategicGoalEditorRecord[]>) {
    setGoalState((current) => {
      const currentGoals =
        current.source === initialGoals ? current.values : initialGoals;
      return {
        source: initialGoals,
        values: typeof update === "function" ? update(currentGoals) : update,
      };
    });
  }

  useEffect(() => {
    if (selectedGoalId !== null || returnFocusGoalId.current === null) return;
    const goalId = returnFocusGoalId.current;
    returnFocusGoalId.current = null;
    requestAnimationFrame(() => {
      document.getElementById(`goal-list-item-${goalId}`)?.focus();
    });
  }, [selectedGoalId]);

  useEffect(() => {
    const targetId = window.location.hash.slice(1);
    if (!targetId.startsWith("goal-target-measure-")) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [reportingYear, selectedGoalId]);

  const priorityOptions = useMemo(
    () => strategicGoalPriorityOptions(goals),
    [goals],
  );
  const visibleGoals = useMemo(() => {
    const filtered = filterStrategicGoals(goals, { priorityId, includeArchived });
    return attentionOnly
      ? filtered.filter((goal) => ["draft", "needs_definition", "needs_target"].includes(goal.configuration_status))
      : filtered;
  }, [attentionOnly, goals, includeArchived, priorityId]);
  const selectedGoal =
    visibleGoals.find((goal) => goal.id === selectedGoalId) ?? null;

  function selectGoal(goalId: number | null) {
    if (goalId === null) {
      setSelectionOverride({
        source: initialGoals,
        routeSelectedGoalId,
        selectedGoalId: null,
      });
    }
    router.replace(
      goalId === null
        ? `/setup?area=goals&year=${reportingYear}`
        : `/setup?area=goals&year=${reportingYear}&goal=${goalId}`,
      { scroll: false },
    );
  }

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
            : body.error ?? "The goal could not be saved.",
        };
      }
      if (body.goal) {
        updateGoals((current) =>
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
          setSelectionOverride({
            source: initialGoals,
            routeSelectedGoalId,
            selectedGoalId: null,
          });
          router.replace(
            nextGoal
              ? `/setup?area=goals&year=${reportingYear}&goal=${nextGoal.id}`
              : `/setup?area=goals&year=${reportingYear}`,
            { scroll: false },
          );
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
            : body.error ?? "The measure setting could not be saved.",
        };
      }
      if (body.membership) {
        const saved = body.membership;
        updateGoals((current) =>
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

  const runTargetMutation: StrategyEditorMutationRunner = async (
    mutation: StrategyEditorMutation,
  ) => {
    try {
      const response = await apiFetch(mutation.endpoint, {
        method: mutation.method,
        body: mutation.body,
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        issues?: unknown;
      };
      if (!response.ok) {
        const detail = issueMessage(body.issues);
        return {
          ok: false,
          error: detail
            ? `${body.error ?? "Invalid input"}: ${detail}`
            : body.error ?? "The target could not be saved.",
        };
      }
      router.refresh();
      return { ok: true, error: null };
    } catch {
      return { ok: false, error: "The request could not be completed. Check the connection and try again." };
    }
  };

  function choosePriority(nextPriorityId: number | null) {
    setPriorityId(nextPriorityId);
    const nextGoals = filterStrategicGoals(goals, {
      priorityId: nextPriorityId,
      includeArchived,
    });
    if (!nextGoals.some((goal) => goal.id === selectedGoalId)) {
      selectGoal(null);
    }
  }

  function toggleArchived(nextIncludeArchived: boolean) {
    setIncludeArchived(nextIncludeArchived);
    const nextGoals = filterStrategicGoals(goals, {
      priorityId,
      includeArchived: nextIncludeArchived,
    });
    if (!nextGoals.some((goal) => goal.id === selectedGoalId)) {
      selectGoal(null);
    }
  }

  return (
    <div className="min-w-0 page-enter">

      <div className="grid min-w-0 grid-cols-1 items-start gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className={selectedGoal ? "hidden min-w-0 lg:block" : "min-w-0"} aria-label="Goal list">
          <div className="space-y-4 border-b border-ink-200 pb-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink-950">Goals</h2>
              <span className="text-sm text-ink-600" aria-live="polite">{visibleGoals.length}</span>
            </div>
            <FormField label="Reporting year" htmlFor="strategic-goal-reporting-year">
              <Select
                id="strategic-goal-reporting-year"
                value={reportingYear}
                onChange={(event) => {
                  const goal = selectedGoalId === null ? "" : `&goal=${selectedGoalId}`;
                  router.push(`/setup?area=goals&year=${Number(event.target.value)}${goal}`);
                }}
              >
                {STRATEGIC_PLAN_REPORTING_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
              </Select>
            </FormField>
            <FormField label="Priority" htmlFor="strategic-goal-priority">
              <Select
                id="strategic-goal-priority"
                value={priorityId ?? ""}
                onChange={(event) => choosePriority(event.target.value ? Number(event.target.value) : null)}
              >
                <option value="">All priorities</option>
                {priorityOptions.map((priority) => <option key={priority.id} value={priority.id}>{priority.name}</option>)}
              </Select>
            </FormField>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={attentionOnly ? "secondary" : "primary"} aria-pressed={!attentionOnly} onClick={() => setAttentionOnly(false)}>All</Button>
              <Button type="button" size="sm" variant={attentionOnly ? "primary" : "secondary"} aria-pressed={attentionOnly} onClick={() => { setAttentionOnly(true); selectGoal(null); }}>Needs attention</Button>
            </div>
            <Checkbox
              id="include-archived-strategic-goals"
              checked={includeArchived}
              onChange={(event) => toggleArchived(event.target.checked)}
              label="Show archived goals"
            />
          </div>

          <ul className="divide-y divide-ink-100 border-b border-ink-200">
            {visibleGoals.length === 0 ? <li className="py-8 text-center text-sm text-ink-500">No goals match.</li> : null}
            {visibleGoals.map((goal) => {
              const ready = goal.configuration_status === "active" || goal.configuration_status === "ready";
              return (
                <li key={goal.id}>
                  <Link
                    id={`goal-list-item-${goal.id}`}
                    href={`/setup?area=goals&year=${reportingYear}&goal=${goal.id}`}
                    aria-current={selectedGoalId === goal.id ? "page" : undefined}
                    className={`block px-1 py-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)] ${selectedGoalId === goal.id ? "bg-brand-50" : "hover:bg-ink-50"}`}
                  >
                    <span className="block font-medium text-ink-950">{goal.name}</span>
                    <span className="mt-1 flex items-center justify-between gap-3 text-sm text-ink-600">
                      <span>{goal.priority_name}</span>
                      <Badge
                        variant={goal.archived_at ? "default" : ready ? "success" : "warning"}
                        label="Goal status"
                      >
                        {goal.archived_at ? "Archived" : ready ? "Ready" : "Needs attention"}
                      </Badge>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className={selectedGoal ? "min-w-0" : "hidden min-w-0 lg:block"} aria-label="Goal details">
          {selectedGoal ? (
            <>
              <div className="mb-5 lg:hidden">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    returnFocusGoalId.current = selectedGoal.id;
                    selectGoal(null);
                  }}
                >
                  Back to list
                </Button>
              </div>
              <StrategicGoalSettingsForm
                key={selectedGoal.id}
                goal={selectedGoal}
                reportingYear={reportingYear}
                runMutation={runMutation}
                runMembershipMutation={runMembershipMutation}
                targetData={targetData}
                runTargetMutation={runTargetMutation}
              />
            </>
          ) : (
            <EmptyState title="Choose a goal" description="Select a goal from the list to review or edit it." />
          )}
        </section>
      </div>
    </div>
  );
}

export function StrategicGoalSettingsForm({
  goal,
  reportingYear,
  runMutation,
  runMembershipMutation,
  targetData = [],
  runTargetMutation,
}: {
  goal: StrategicGoalEditorRecord;
  reportingYear: number;
  runMutation: StrategicGoalMutationRunner;
  runMembershipMutation: StrategicGoalMembershipMutationRunner;
  targetData?: StrategicKpiEditorData[];
  runTargetMutation?: StrategyEditorMutationRunner;
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
        message: "Choose a valid first year for this change.",
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
              ? "Future change saved. Select its first reporting year to review it."
              : "Goal settings saved.",
          }
        : {
            variant: "error",
            message: result.error ?? "The goal could not be saved.",
          },
    );
  }

  async function lifecycle(action: "archive" | "restore") {
    setFeedback(null);
    setBusy(true);
    const result = await runMutation(
      buildStrategicGoalLifecycleMutation(goal.id, action),
    );
    setBusy(false);
    setConfirmArchive(false);
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
    <div className="space-y-10">
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
          <Badge variant={statusVariant(goal.configuration_status)} label="Goal status">
            {setupStatusLabel(goal.configuration_status)}
          </Badge>
        </div>

        {archived ? (
          <StatusBanner variant="error">
            This goal is archived. Restore it before making changes.
          </StatusBanner>
        ) : null}
        {feedback ? (
          <StatusBanner variant={feedback.variant}>{feedback.message}</StatusBanner>
        ) : null}
        {successorMode ? (
          <StatusBanner variant="neutral">
            Choose the first year for this change. Earlier results will stay unchanged.
          </StatusBanner>
        ) : null}

        <form onSubmit={(event) => runEventHandler(submit, event)} noValidate>
          <fieldset disabled={busy || archived} className="space-y-8">
            {successorMode ? (
              <FormField
                label="First year for this change"
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
                When this goal is complete
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                <FormField label="Complete when" htmlFor="strategic-goal-completion-rule">
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
                        {completionRuleLabel(rule)}
                      </option>
                    ))}
                  </Select>
                </FormField>

                {draft.completionRule === "threshold_count" ? (
                  <>
                    <FormField label="Count by" htmlFor="strategic-goal-threshold-type">
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
                        <option value="count">Number of measures</option>
                        <option value="percentage">Percentage of measures</option>
                      </Select>
                    </FormField>
                    <FormField
                      label="Amount needed"
                      htmlFor="strategic-goal-threshold-value"
                      hint={
                        <FieldHint
                          error={
                            errors.threshold_count ?? errors.threshold_percentage
                          }
                          fallback={
                            draft.thresholdMode === "count"
                              ? "Enter a whole number of included measures."
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
                    label="Current progress"
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
                Current status
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField label="Progress" htmlFor="strategic-goal-board-status">
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
                  label="Setup status"
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
                label="What still needs an answer?"
                htmlFor="strategic-goal-unresolved-question"
                className="mt-4"
                hint={
                  <FieldHint
                    error={errors.unresolved_question}
                    fallback="Add this when the goal still needs information."
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
                <FormField label="Notes" htmlFor="strategic-goal-resolution-notes" hint={<FieldHint error={errors.resolution_notes} />}>
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
                <FormField label="Source" htmlFor="strategic-goal-source-reference" hint={<FieldHint error={errors.source_reference} />}>
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
                  {successorMode ? "Cancel future change" : "Plan future change"}
                </Button>
              ) : null}
              <Button
                type="submit"
                variant="primary"
                icon={Save}
                isLoading={busy}
                disabled={archived}
              >
                {successorMode ? "Save future change" : "Save goal"}
              </Button>
            </div>
          </div>
        </form>

        <ConfirmDialog
          open={confirmArchive}
          title={`Archive “${goal.name}”?`}
          description="The goal will no longer appear in current reporting. Its measures and history will stay available."
          confirmLabel="Archive goal"
          onConfirm={() => lifecycle("archive")}
          onClose={() => setConfirmArchive(false)}
        />
      </Card>

      <section className="border-y border-ink-200 py-6" aria-labelledby="goal-kpi-context-title">
        <h2 id="goal-kpi-context-title" className="text-xl font-semibold text-ink-950">
          Measures in this goal
        </h2>
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
      </section>

      {runTargetMutation && targetData.length > 0 ? (
        <GoalTargets
          data={targetData}
          reportingYear={reportingYear}
          runMutation={runTargetMutation}
        />
      ) : null}
    </div>
  );
}

function GoalTargets({
  data,
  reportingYear,
  runMutation,
}: {
  data: StrategicKpiEditorData[];
  reportingYear: number;
  runMutation: StrategyEditorMutationRunner;
}) {
  return (
    <section aria-labelledby="goal-targets-title">
      <h2 id="goal-targets-title" className="mb-6 text-xl font-semibold text-ink-950">Targets</h2>
      <div className="divide-y divide-ink-200 border-y border-ink-200">
        {data.map((measure) => {
          const measurementType = measure.configuration?.measurement_type;
          if (!measurementType) {
            return (
              <div
                key={measure.kpi.id}
                id={`goal-target-measure-${measure.kpi.id}`}
                tabIndex={-1}
                className="py-6 focus:outline-none"
              >
                <h3 className="font-semibold text-ink-950">{measure.kpi.name}</h3>
                <p className="mt-1 text-sm text-ink-600">Finish setting up this measure before adding targets.</p>
              </div>
            );
          }
          const components = measure.components.filter((component) => component.archived_at === null);
          return (
            <section key={measure.kpi.id} className="py-8" aria-labelledby={`goal-target-measure-${measure.kpi.id}`}>
              <h3
                id={`goal-target-measure-${measure.kpi.id}`}
                tabIndex={-1}
                className="mb-5 text-lg font-semibold text-ink-950 focus:outline-none"
              >
                {measure.kpi.name}
              </h3>
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <StrategicTargetEditorCard
                  title={`${reportingYear} target`}
                  description="The result expected this reporting year."
                  initialDraft={targetDraftForScope(measure.targets, "annual", reportingYear)}
                  kpiId={measure.kpi.id}
                  measurementType={measurementType}
                  runMutation={runMutation}
                  idPrefix={`goal-kpi-${measure.kpi.id}`}
                  lockedTargetYear={reportingYear}
                />
                <StrategicTargetEditorCard
                  title="Full plan target"
                  description="The result expected by the end of the plan."
                  initialDraft={targetDraftForScope(measure.targets, "full_plan", reportingYear)}
                  kpiId={measure.kpi.id}
                  measurementType={measurementType}
                  runMutation={runMutation}
                  idPrefix={`goal-kpi-${measure.kpi.id}`}
                />
              </div>

              {components.map((component) => (
                <div key={component.id} className="mt-7 border-t border-ink-100 pt-6">
                  <h4 className="mb-4 font-semibold text-ink-900">{component.label}</h4>
                  <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                    <StrategicTargetEditorCard
                      title={`${reportingYear} target`}
                      description="The result expected this reporting year."
                      initialDraft={targetDraftForScope(component.targets, "annual", reportingYear)}
                      kpiId={measure.kpi.id}
                      componentId={component.id}
                      measurementType={component.measurement_type ?? "count"}
                      runMutation={runMutation}
                      idPrefix={`goal-component-${component.id}`}
                      lockedTargetYear={reportingYear}
                    />
                    <StrategicTargetEditorCard
                      title="Full plan target"
                      description="The result expected by the end of the plan."
                      initialDraft={targetDraftForScope(component.targets, "full_plan", reportingYear)}
                      kpiId={measure.kpi.id}
                      componentId={component.id}
                      measurementType={component.measurement_type ?? "count"}
                      runMutation={runMutation}
                      idPrefix={`goal-component-${component.id}`}
                    />
                  </div>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </section>
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
              ? "Future measure setting saved."
              : "Measure setting saved.",
          }
        : {
            variant: "error",
            message: result.error ?? "The measure setting could not be saved.",
          },
    );
  }

  return (
    <form
      onSubmit={(event) => runEventHandler(submit, event)}
      className="space-y-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold leading-5 text-ink-900">
            {member.name}
          </p>
          <p className="mt-1 text-xs tabular-nums text-ink-500">
            Used from {member.effectiveFromYear}
            {member.effectiveToYear === null
              ? " onward"
              : `–${member.effectiveToYear}`}
          </p>
        </div>
        {member.configurationStatus ? (
          <Badge variant={statusVariant(member.configurationStatus)} label="Setup status">
            {setupStatusLabel(member.configurationStatus)}
          </Badge>
        ) : (
          <Badge variant="incomplete" label="Setup status">Not configured</Badge>
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
            label="First year for this change"
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
          label="How it counts"
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
                {role === "required" ? "Required" : "For information only"}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Importance"
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
            label="List order"
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
            {successorMode ? "Cancel future change" : "Plan future change"}
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
          {successorMode ? "Save future change" : "Save measure"}
        </Button>
      </div>
    </form>
  );
}
