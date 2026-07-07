"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Search, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Chip,
  ConfirmDialog,
  Dialog,
  FormField,
  IconButton,
  Input,
  PageHeader,
  Progress,
  Select,
  StatusBanner,
  Table,
} from "@/components/ui";
import { isAnnualReportingFrequency } from "@/features/metrics";
import type { KPIWithCategory, KpiGoalWithMeta } from "@/lib/types";
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
  const [editGoalType, setEditGoalType] = useState<"pct" | "number">("pct");
  const [editTargetValue, setEditTargetValue] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Create goal form state
  const [createKpiId, setCreateKpiId] = useState(kpis[0]?.id ?? 0);
  const [createYear, setCreateYear] = useState(new Date().getFullYear());
  const [createGoalType, setCreateGoalType] = useState<"pct" | "number">("pct");
  const [createTargetValue, setCreateTargetValue] = useState("");
  const [createNotes, setCreateNotes] = useState("");

  const categories = useMemo(() => {
    const map = new Map<number, string>();
    for (const k of kpis) map.set(k.category_id, k.category_name);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [kpis]);

  const filteredGoals = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return goals.filter((g) => {
      if (categoryFilter !== null && g.category_id !== categoryFilter) return false;
      if (!needle) return true;
      return (
        g.kpi_name.toLowerCase().includes(needle) ||
        g.kpi_slug.toLowerCase().includes(needle)
      );
    });
  }, [goals, query, categoryFilter]);

  const goalCountByCategory = useMemo(() => {
    const counts = new Map<number, number>();
    for (const g of goals) counts.set(g.category_id, (counts.get(g.category_id) ?? 0) + 1);
    return counts;
  }, [goals]);

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

  async function handleCreate(e: React.FormEvent) {
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

  async function handleUpdate(e: React.FormEvent) {
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

  // Build a quick-lookup set: which KPIs already have a goal this year?
  const existingGoalKpiIds = useMemo(() => {
    return new Set(goals.map((g) => `${g.kpi_id}-${g.target_year}`));
  }, [goals]);

  // Exclude KPIs that already have a goal in the selected year
  const availableKpis = useMemo(() => {
    return kpis.filter((k) => !existingGoalKpiIds.has(`${k.id}-${createYear}`));
  }, [kpis, createYear, existingGoalKpiIds]);

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

      {/* Create goal form */}
      <Card className="mb-8 p-5 lg:p-6">
        <form onSubmit={handleCreate}>
          <h2 className="mb-5 flex items-center gap-2 text-xl font-semibold text-ink-900">
            <Plus className="w-4 h-4" /> Add a new goal
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <FormField label="KPI">
              <Select
                value={createKpiId}
                onChange={(e) => setCreateKpiId(Number(e.target.value))}
                required
              >
                {availableKpis.length === 0 ? (
                  <option value={0} disabled>No KPIs available</option>
                ) : null}
                {availableKpis.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({k.category_name})
                  </option>
                ))}
                {/* Also allow selecting KPIs that already have a goal (to update it) */}
                {kpis.filter((k) => !availableKpis.includes(k)).map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({k.category_name}) — has goal
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Target year">
              <Select
                value={createYear}
                onChange={(e) => setCreateYear(Number(e.target.value))}
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map(
                  (y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ),
                )}
              </Select>
            </FormField>
            <FormField label="Goal type">
              <Select
                value={createGoalType}
                onChange={(e) => setCreateGoalType(e.target.value as "pct" | "number")}
              >
                <option value="pct">Percentage — e.g. 20% more or -10% less</option>
                <option value="number">Numeric — e.g. 3 more or -5 less</option>
              </Select>
            </FormField>
            <FormField label={createGoalType === "pct" ? "Percentage change" : "Numeric change"}>
              <Input
                type="number"
                step="any"
                value={createTargetValue}
                onChange={(e) => setCreateTargetValue(e.target.value)}
                placeholder={createGoalType === "pct" ? "e.g. 20" : "e.g. 3"}
                required
              />
            </FormField>
            <FormField label="Notes (optional)" className="md:col-span-2 lg:col-span-4">
              <Input
                value={createNotes}
                onChange={(e) => setCreateNotes(e.target.value)}
                placeholder="e.g. Based on 2025 growth trajectory"
              />
            </FormField>
          </div>
          <div className="mt-4 flex justify-end">
            <Button type="submit" variant="primary" size="sm" icon={Plus}>
              Create goal
            </Button>
          </div>
        </form>
      </Card>

      {/* Goals list */}
      <Card className="overflow-hidden">
        <div className="space-y-4 border-b border-ink-100 p-5">
          <div>
            <h2 className="text-xl font-semibold text-ink-900">Existing goals</h2>
            <p className="mt-1 text-sm text-ink-500">
              Showing {filteredGoals.length} of {goals.length} goals
              {goals.filter((g) => g.enabled).length !== goals.length
                ? ` (${goals.filter((g) => g.enabled).length} enabled)`
                : ""}
            </p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative max-w-sm flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by KPI name or slug…"
                aria-label="Search goals"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Chip
                type="button"
                active={categoryFilter === null}
                onClick={() => setCategoryFilter(null)}
              >
                All ({goals.length})
              </Chip>
              {categories.map((c) => (
                <Chip
                  key={c.id}
                  type="button"
                  active={categoryFilter === c.id}
                  onClick={() =>
                    setCategoryFilter((prev) => (prev === c.id ? null : c.id))
                  }
                >
                  {c.name} ({goalCountByCategory.get(c.id) ?? 0})
                </Chip>
              ))}
            </div>
          </div>
        </div>
        <Table minWidth="900px">
          <thead>
            <tr>
              <th className="text-left" scope="col">KPI</th>
              <th className="text-left" scope="col">Category</th>
              <th className="text-right" scope="col">Year</th>
              <th className="text-left" scope="col">Type</th>
              <th className="text-right" scope="col">Target</th>
              <th className="text-center" scope="col">YTD pace</th>
              <th className="text-center" scope="col">Full year</th>
              <th className="text-center" scope="col">Enabled</th>
              <th className="text-right" scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {filteredGoals.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-sm text-ink-500">
                  No goals match the current filters.
                </td>
              </tr>
            ) : null}
            {filteredGoals.map((g) => {
              const ytdPct = g.ytd_progress_pct;
              const fyPct = g.full_year_progress_pct;
              const isAnnual = isAnnualReportingFrequency(g.reporting_frequency);
              return (
                <tr key={g.id} className="transition-colors hover:bg-ink-50/70">
                  <td className="py-3 pr-4">
                    <span className="font-medium text-ink-900">{g.kpi_name}</span>
                    <span className="block text-xs text-ink-400">{g.kpi_slug} · {g.kpi_unit}</span>
                  </td>
                  <td className="text-ink-700">{g.category_name}</td>
                  <td className="text-right tabular text-ink-700">{g.target_year}</td>
                  <td className="text-ink-700">
                    <Badge variant="default" className="tabular">
                      {g.goal_type === "pct" ? `${g.target_value > 0 ? "+" : ""}${g.target_value}%` : `${g.target_value > 0 ? "+" : ""}${g.target_value}`}
                    </Badge>
                  </td>
                  <td className="text-right tabular text-ink-700">
                    {g.full_year_target !== null ? g.full_year_target.toLocaleString(undefined, { maximumFractionDigits: 1 }) : "—"}
                  </td>
                  <td className="min-w-[120px] text-center">
                    {isAnnual ? (
                      <span className="text-xs text-ink-400">annual</span>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <Progress
                          value={ytdPct ?? 0}
                          color={ytdPct !== null && ytdPct >= 100 ? "var(--color-success-text)" : undefined}
                        />
                        <span className="text-xs tabular text-ink-600 min-w-[3ch] text-right">
                          {ytdPct !== null ? `${Math.round(ytdPct)}%` : "—"}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="min-w-[120px] text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Progress
                        value={fyPct ?? 0}
                        color={fyPct !== null && fyPct >= 100 ? "var(--color-success-text)" : undefined}
                      />
                      <span className="text-xs tabular text-ink-600 min-w-[3ch] text-right">
                        {fyPct !== null ? `${Math.round(fyPct)}%` : "—"}
                      </span>
                    </div>
                  </td>
                  <td className="text-center">
                    <IconButton
                      icon={g.enabled ? ToggleRight : ToggleLeft}
                      label={g.enabled ? "Disable goal" : "Enable goal"}
                      variant={g.enabled ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => handleToggle(g.id, !g.enabled)}
                    />
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        icon={Pencil}
                        label={`Edit goal for ${g.kpi_name}`}
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(g)}
                      />
                      <IconButton
                        icon={Trash2}
                        label={`Delete goal for ${g.kpi_name}`}
                        variant="danger"
                        size="sm"
                        onClick={() => requestDelete(g.id, g.kpi_name)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

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

      <Dialog
        open={editing !== null}
        title={editing ? `Edit goal — ${editing.kpi_name}` : ""}
        description={editing ? `${editing.category_name} · ${editing.target_year}` : undefined}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" form="edit-goal-form" variant="primary" size="sm">Save changes</Button>
          </>
        }
      >
        <form id="edit-goal-form" onSubmit={handleUpdate} className="space-y-4">
          <FormField label="Goal type">
            <Select
              value={editGoalType}
              onChange={(e) => setEditGoalType(e.target.value as "pct" | "number")}
            >
              <option value="pct">Percentage — e.g. 20% more or -10% less</option>
              <option value="number">Numeric — e.g. 3 more or -5 less</option>
            </Select>
          </FormField>
          <FormField label={editGoalType === "pct" ? "Percentage change" : "Numeric change"}>
            <Input
              type="number"
              step="any"
              value={editTargetValue}
              onChange={(e) => setEditTargetValue(e.target.value)}
              placeholder={editGoalType === "pct" ? "e.g. 20" : "e.g. 3"}
              required
            />
          </FormField>
          <FormField label="Notes (optional)">
            <Input
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="e.g. Based on 2025 growth trajectory"
            />
          </FormField>
        </form>
      </Dialog>
    </div>
  );
}
