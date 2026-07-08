"use client";

import type { FormEvent } from "react";
import { Button, Dialog, FormField, Input, Select } from "@/components/ui";
import type { GoalType, KpiGoalWithMeta } from "@/lib/types";

interface AdminGoalEditDialogProps {
  goal: KpiGoalWithMeta | null;
  baselineYear: number;
  goalType: GoalType;
  targetValue: string;
  notes: string;
  onGoalTypeChange: (goalType: GoalType) => void;
  onBaselineYearChange: (year: number) => void;
  onTargetValueChange: (targetValue: string) => void;
  onNotesChange: (notes: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function AdminGoalEditDialog({
  goal,
  baselineYear,
  goalType,
  targetValue,
  notes,
  onGoalTypeChange,
  onBaselineYearChange,
  onTargetValueChange,
  onNotesChange,
  onClose,
  onSubmit,
}: AdminGoalEditDialogProps) {
  return (
    <Dialog
      open={goal !== null}
      title={goal ? `Edit goal — ${goal.kpi_name}` : ""}
      description={
        goal ? `${goal.category_name} · ${goal.target_year}` : undefined
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-goal-form"
            variant="primary"
            size="sm"
          >
            Save changes
          </Button>
        </>
      }
    >
      <form id="edit-goal-form" onSubmit={onSubmit} className="space-y-4">
        <FormField htmlFor="edit-goal-baseline-year" label="Baseline year">
          <Input
            id="edit-goal-baseline-year"
            type="number"
            min={1900}
            max={(goal?.target_year ?? 2100) - 1}
            value={baselineYear}
            onChange={(event) =>
              onBaselineYearChange(Number(event.target.value))
            }
            required
          />
        </FormField>
        <FormField htmlFor="edit-goal-type" label="Goal type">
          <Select
            id="edit-goal-type"
            value={goalType}
            onChange={(event) =>
              onGoalTypeChange(event.target.value as GoalType)
            }
          >
            <option value="pct">Percentage — e.g. 20% more or -10% less</option>
            <option value="number">Numeric — e.g. 3 more or -5 less</option>
          </Select>
        </FormField>
        <FormField
          htmlFor="edit-goal-target"
          label={goalType === "pct" ? "Percentage change" : "Numeric change"}
        >
          <Input
            id="edit-goal-target"
            type="number"
            step="any"
            value={targetValue}
            onChange={(event) => onTargetValueChange(event.target.value)}
            placeholder={goalType === "pct" ? "e.g. 20" : "e.g. 3"}
            required
          />
        </FormField>
        <FormField htmlFor="edit-goal-notes" label="Notes (optional)">
          <Input
            id="edit-goal-notes"
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="e.g. Based on 2025 growth trajectory"
          />
        </FormField>
      </form>
    </Dialog>
  );
}
