"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminGoalCreateForm } from "@/components/AdminGoalCreateForm";
import { AdminGoalEditDialog } from "@/components/AdminGoalEditDialog";
import { AdminGoalsTable } from "@/components/AdminGoalsTable";
import {
  buildAdminGoalCategorySummaries,
  buildAdminGoalKpiOptions,
  buildAdminGoalYearOptions,
  countEnabledAdminGoals,
  filterAdminGoals,
} from "@/features/goals/admin-goals";
import {
  ConfirmDialog,
  PageHeader,
  StatusBanner,
} from "@/components/ui";
import type { GoalType, KPIWithCategory, KpiGoalWithMeta } from "@/lib/types";
import { apiFetch } from "@/lib/api-client";

export function GoalsManagerClient({
  goals: initialGoals,
  kpis,
}: {
  goals: KpiGoalWithMeta[];
  kpis: KPIWithCategory[];
}) {
  const [goals, setGoals] = useState(initialGoals);
  const [feedback, setFeedback] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    action: () => void | Promise<void>;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const router = useRouter();

  // Edit dialog state
  const [editing, setEditing] = useState<KpiGoalWithMeta | null>(null);
  const [editGoalType, setEditGoalType] = useState<GoalType>("pct");
  const [editTargetValue, setEditTargetValue] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Create goal form state
  const [createKpiId, setCreateKpiId] = useState(kpis[0]?.id ?? 0);
  const [createYear, setCreateYear] = useState(new Date().getFullYear());
  const [createGoalType, setCreateGoalType] = useState<GoalType>("pct");
  const [createTargetValue, setCreateTargetValue] = useState("");
  const [createNotes, setCreateNotes] = useState("");

  const categories = useMemo(
    () => buildAdminGoalCategorySummaries(kpis, goals),
    [kpis, goals],
  );

  const filteredGoals = useMemo(() => {
    return filterAdminGoals(goals, { query, categoryId: categoryFilter });
  }, [goals, query, categoryFilter]);

  const enabledGoalCount = useMemo(() => countEnabledAdminGoals(goals), [goals]);

  const goalYearOptions = useMemo(() => buildAdminGoalYearOptions(), []);

  const goalKpiOptions = useMemo(() => {
    return buildAdminGoalKpiOptions(kpis, goals, createYear);
  }, [kpis, goals, createYear]);

  const { availableKpis, unavailableKpis } = goalKpiOptions;

  function goalsEndpoint() {
    const throughMonth = Math.min(new Date().getMonth() + 1, 12);
    return `/api/goals?throughMonth=${throughMonth}`;
  }

  async function applyGoalsMutationResponse(
    res: Response,
    fallbackError: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const data = await res.json().catch(() => ({})) as {
      error?: string;
      goals?: KpiGoalWithMeta[];
    };
    if (!res.ok) {
      return { ok: false, error: data.error ?? fallbackError };
    }
    if (Array.isArray(data.goals)) {
      setGoals(data.goals);
    }
    // Re-render server-rendered dashboard pages so progress bars update.
    router.refresh();
    return { ok: true };
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!createKpiId || !createTargetValue) return;
    const payload = {
      kpi_id: createKpiId,
      target_year: createYear,
      goal_type: createGoalType,
      target_value: Number(createTargetValue),
      enabled: true,
      notes: createNotes || null,
    };
    const res = await apiFetch(goalsEndpoint(), {
      method: "POST",
      body: payload,
    });
    const result = await applyGoalsMutationResponse(res, "Unknown error");
    if (!result.ok) {
      setFeedback({ message: `Could not create goal: ${result.error}`, variant: "error" });
      return;
    }
    setFeedback({ message: "Goal created.", variant: "success" });
    setCreateTargetValue("");
    setCreateNotes("");
  }

  async function handleToggle(id: number, enabled: boolean) {
    const res = await apiFetch(goalsEndpoint(), {
      method: "PATCH",
      body: { id, enabled },
    });
    const result = await applyGoalsMutationResponse(res, "Unknown error");
    if (!result.ok) {
      setFeedback({ message: `Could not toggle: ${result.error}`, variant: "error" });
      return;
    }
    setFeedback({ message: enabled ? "Goal enabled." : "Goal disabled.", variant: "success" });
  }

  async function handleDelete(id: number, kpiName: string) {
    const res = await apiFetch(goalsEndpoint(), {
      method: "DELETE",
      body: { id },
    });
    const result = await applyGoalsMutationResponse(res, "Unknown error");
    if (!result.ok) {
      setFeedback({ message: `Could not delete: ${result.error}`, variant: "error" });
      return;
    }
    setFeedback({ message: `Goal deleted for “${kpiName}”.`, variant: "success" });
  }

  function requestDelete(id: number, kpiName: string) {
    setConfirmation({
      title: `Delete goal for “${kpiName}”?`,
      description: "This removes the goal permanently. The KPI data is unaffected.",
      confirmLabel: "Delete goal",
      action: () => handleDelete(id, kpiName),
    });
  }

  function openEditDialog(goal: KpiGoalWithMeta) {
    setEditing(goal);
    setEditGoalType(goal.goal_type);
    setEditTargetValue(String(goal.target_value));
    setEditNotes(goal.notes ?? "");
  }

  async function handleUpdate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing || !editTargetValue) return;
    const res = await apiFetch(goalsEndpoint(), {
      method: "PATCH",
      body: {
        id: editing.id,
        enabled: editing.enabled,
        goal_type: editGoalType,
        target_value: Number(editTargetValue),
        notes: editNotes || null,
      },
    });
    const result = await applyGoalsMutationResponse(res, "Unknown error");
    if (!result.ok) {
      setFeedback({ message: `Could not update goal: ${result.error}`, variant: "error" });
      return;
    }
    setFeedback({ message: "Goal updated.", variant: "success" });
    setEditing(null);
  }

  return (
    <div className="page-content page-enter">
      <PageHeader
        eyebrow="Admin · Goals"
        title="Set KPI targets"
        subtitle="Define percentage or numeric goals per KPI per year. Goals drive dashboard progress indicators."
      />

      {feedback ? (
        <StatusBanner variant={feedback.variant} onDismiss={() => setFeedback(null)}>
          {feedback.message}
        </StatusBanner>
      ) : null}

      <AdminGoalCreateForm
        availableKpis={availableKpis}
        unavailableKpis={unavailableKpis}
        yearOptions={goalYearOptions}
        kpiId={createKpiId}
        targetYear={createYear}
        goalType={createGoalType}
        targetValue={createTargetValue}
        notes={createNotes}
        onKpiIdChange={setCreateKpiId}
        onTargetYearChange={setCreateYear}
        onGoalTypeChange={setCreateGoalType}
        onTargetValueChange={setCreateTargetValue}
        onNotesChange={setCreateNotes}
        onSubmit={handleCreate}
      />

      <AdminGoalsTable
        goals={filteredGoals}
        totalGoals={goals.length}
        enabledGoalCount={enabledGoalCount}
        categories={categories}
        query={query}
        categoryFilter={categoryFilter}
        onQueryChange={setQuery}
        onCategoryFilterChange={setCategoryFilter}
        onToggle={handleToggle}
        onEdit={openEditDialog}
        onDelete={requestDelete}
      />

      <ConfirmDialog
        open={Boolean(confirmation)}
        title={confirmation?.title ?? ""}
        description={confirmation?.description ?? ""}
        confirmLabel={confirmation?.confirmLabel}
        onClose={() => setConfirmation(null)}
        onConfirm={async () => {
          const action = confirmation?.action;
          setConfirmation(null);
          await action?.();
        }}
      />

      <AdminGoalEditDialog
        goal={editing}
        goalType={editGoalType}
        targetValue={editTargetValue}
        notes={editNotes}
        onGoalTypeChange={setEditGoalType}
        onTargetValueChange={setEditTargetValue}
        onNotesChange={setEditNotes}
        onClose={() => setEditing(null)}
        onSubmit={handleUpdate}
      />
    </div>
  );
}
