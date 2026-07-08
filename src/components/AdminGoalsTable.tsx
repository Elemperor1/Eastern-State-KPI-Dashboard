"use client";

import { Pencil, Search, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { Badge, Card, Chip, IconButton, Input, Progress, Table } from "@/components/ui";
import {
  type AdminGoalCategorySummary,
  formatAdminGoalChangeLabel,
  formatAdminGoalTarget,
} from "@/features/goals/admin-goals";
import { isAnnualReportingFrequency } from "@/features/metrics";
import type { KpiGoalWithMeta } from "@/lib/types";

interface AdminGoalsTableProps {
  goals: KpiGoalWithMeta[];
  totalGoals: number;
  enabledGoalCount: number;
  categories: AdminGoalCategorySummary[];
  query: string;
  categoryFilter: number | null;
  onQueryChange: (query: string) => void;
  onCategoryFilterChange: (categoryId: number | null) => void;
  onToggle: (id: number, enabled: boolean) => void;
  onEdit: (goal: KpiGoalWithMeta) => void;
  onDelete: (id: number, kpiName: string) => void;
}

export function AdminGoalsTable({
  goals,
  totalGoals,
  enabledGoalCount,
  categories,
  query,
  categoryFilter,
  onQueryChange,
  onCategoryFilterChange,
  onToggle,
  onEdit,
  onDelete,
}: AdminGoalsTableProps) {
  return (
    <Card className="overflow-hidden">
      <div className="space-y-4 border-b border-ink-100 p-5">
        <div>
          <h2 className="text-xl font-semibold text-ink-900">Existing goals</h2>
          <p className="mt-1 text-sm text-ink-500">
            Showing {goals.length} of {totalGoals} goals
            {enabledGoalCount !== totalGoals ? ` (${enabledGoalCount} enabled)` : ""}
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
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search by KPI name or slug…"
              aria-label="Search goals"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip
              type="button"
              active={categoryFilter === null}
              onClick={() => onCategoryFilterChange(null)}
            >
              All ({totalGoals})
            </Chip>
            {categories.map((category) => (
              <Chip
                key={category.id}
                type="button"
                active={categoryFilter === category.id}
                onClick={() =>
                  onCategoryFilterChange(categoryFilter === category.id ? null : category.id)
                }
              >
                {category.name} ({category.goalCount})
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
          {goals.length === 0 ? (
            <tr>
              <td colSpan={9} className="py-8 text-center text-sm text-ink-500">
                No goals match the current filters.
              </td>
            </tr>
          ) : null}
          {goals.map((goal) => {
            const ytdPct = goal.ytd_progress_pct;
            const fyPct = goal.full_year_progress_pct;
            const isAnnual = isAnnualReportingFrequency(goal.reporting_frequency);
            return (
              <tr key={goal.id} className="transition-colors hover:bg-ink-50/70">
                <td className="py-3 pr-4">
                  <span className="font-medium text-ink-900">{goal.kpi_name}</span>
                  <span className="block text-xs text-ink-400">{goal.kpi_slug} · {goal.kpi_unit}</span>
                </td>
                <td className="text-ink-700">{goal.category_name}</td>
                <td className="text-right tabular text-ink-700">{goal.target_year}</td>
                <td className="text-ink-700">
                  <Badge variant="default" className="tabular">
                    {formatAdminGoalChangeLabel(goal)}
                  </Badge>
                </td>
                <td className="text-right tabular text-ink-700">
                  {formatAdminGoalTarget(goal.full_year_target)}
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
                      <span className="min-w-[3ch] text-right text-xs tabular text-ink-600">
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
                    <span className="min-w-[3ch] text-right text-xs tabular text-ink-600">
                      {fyPct !== null ? `${Math.round(fyPct)}%` : "—"}
                    </span>
                  </div>
                </td>
                <td className="text-center">
                  <IconButton
                    icon={goal.enabled ? ToggleRight : ToggleLeft}
                    label={goal.enabled ? "Disable goal" : "Enable goal"}
                    variant={goal.enabled ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => onToggle(goal.id, !goal.enabled)}
                  />
                </td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <IconButton
                      icon={Pencil}
                      label={`Edit goal for ${goal.kpi_name}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(goal)}
                    />
                    <IconButton
                      icon={Trash2}
                      label={`Delete goal for ${goal.kpi_name}`}
                      variant="danger"
                      size="sm"
                      onClick={() => onDelete(goal.id, goal.kpi_name)}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}
