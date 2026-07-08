"use client";

import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button, Card, FormField, Input, Select } from "@/components/ui";
import type { GoalType, KPIWithCategory } from "@/lib/types";

interface AdminGoalCreateFormProps {
  availableKpis: KPIWithCategory[];
  unavailableKpis: KPIWithCategory[];
  yearOptions: number[];
  kpiId: number;
  targetYear: number;
  baselineYear: number;
  goalType: GoalType;
  targetValue: string;
  notes: string;
  onKpiIdChange: (kpiId: number) => void;
  onTargetYearChange: (year: number) => void;
  onBaselineYearChange: (year: number) => void;
  onGoalTypeChange: (goalType: GoalType) => void;
  onTargetValueChange: (targetValue: string) => void;
  onNotesChange: (notes: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function AdminGoalCreateForm({
  availableKpis,
  unavailableKpis,
  yearOptions,
  kpiId,
  targetYear,
  baselineYear,
  goalType,
  targetValue,
  notes,
  onKpiIdChange,
  onTargetYearChange,
  onBaselineYearChange,
  onGoalTypeChange,
  onTargetValueChange,
  onNotesChange,
  onSubmit,
}: AdminGoalCreateFormProps) {
  return (
    <Card className="mb-8 p-5 lg:p-6">
      <form onSubmit={onSubmit}>
        <h2 className="mb-5 flex items-center gap-2 text-xl font-semibold text-ink-900">
          <Plus className="h-4 w-4" /> Add a new goal
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          <FormField htmlFor="create-goal-kpi" label="KPI">
            <Select
              id="create-goal-kpi"
              value={kpiId}
              onChange={(event) => onKpiIdChange(Number(event.target.value))}
              required
            >
              {availableKpis.length === 0 ? (
                <option value={0} disabled>
                  No KPIs available
                </option>
              ) : null}
              {availableKpis.map((kpi) => (
                <option key={kpi.id} value={kpi.id}>
                  {kpi.name} ({kpi.category_name})
                </option>
              ))}
              {unavailableKpis.map((kpi) => (
                <option key={kpi.id} value={kpi.id}>
                  {kpi.name} ({kpi.category_name}) — has goal
                </option>
              ))}
            </Select>
          </FormField>
          <FormField htmlFor="create-goal-baseline-year" label="Baseline year">
            <Input
              id="create-goal-baseline-year"
              type="number"
              min={1900}
              max={targetYear - 1}
              value={baselineYear}
              onChange={(event) =>
                onBaselineYearChange(Number(event.target.value))
              }
              required
            />
          </FormField>
          <FormField htmlFor="create-goal-year" label="Target year">
            <Select
              id="create-goal-year"
              value={targetYear}
              onChange={(event) =>
                onTargetYearChange(Number(event.target.value))
              }
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField htmlFor="create-goal-type" label="Goal type">
            <Select
              id="create-goal-type"
              value={goalType}
              onChange={(event) =>
                onGoalTypeChange(event.target.value as GoalType)
              }
            >
              <option value="pct">
                Percentage — e.g. 20% more or -10% less
              </option>
              <option value="number">Numeric — e.g. 3 more or -5 less</option>
            </Select>
          </FormField>
          <FormField
            htmlFor="create-goal-target"
            label={goalType === "pct" ? "Percentage change" : "Numeric change"}
          >
            <Input
              id="create-goal-target"
              type="number"
              step="any"
              value={targetValue}
              onChange={(event) => onTargetValueChange(event.target.value)}
              placeholder={goalType === "pct" ? "e.g. 20" : "e.g. 3"}
              required
            />
          </FormField>
          <FormField
            htmlFor="create-goal-notes"
            label="Notes (optional)"
            className="md:col-span-2 lg:col-span-5"
          >
            <Input
              id="create-goal-notes"
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
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
  );
}
