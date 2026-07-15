"use client";

import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button, Card, FormField, Input, Select } from "@/components/ui";
import { runEventHandler } from "@/lib/async-event";
import {
  CATALOG_DIRECTIONS,
  formatCatalogDirection,
  STRATEGIC_MEASURE_FREQUENCIES,
  STRATEGIC_MEASURE_TYPES,
  type StrategicMeasureGoalOption,
} from "@/features/catalog/admin-catalog";

interface AdminKpiCreateFormProps {
  goals: StrategicMeasureGoalOption[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  isSubmitting?: boolean;
}

export function AdminKpiCreateForm({
  goals,
  onSubmit,
  isSubmitting = false,
}: AdminKpiCreateFormProps) {
  return (
    <Card className="p-5 lg:p-6">
      <form onSubmit={(event) => runEventHandler(onSubmit, event)}>
        <h2 className="mb-5 flex items-center gap-2 text-xl font-semibold text-ink-900">
          <Plus className="h-4 w-4" /> Add measure
        </h2>
        <fieldset disabled={isSubmitting || goals.length === 0} className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <FormField label="Name" htmlFor="create-measure-name" className="md:col-span-2">
            <Input id="create-measure-name" name="name" required placeholder="e.g. Virtual program attendees" />
          </FormField>
          <FormField label="Goal" htmlFor="create-measure-goal">
            <Select id="create-measure-goal" name="goal_id" required defaultValue={goals[0]?.id}>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>{goal.priorityName} — {goal.name}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Unit label" htmlFor="create-measure-unit">
            <Input id="create-measure-unit" name="unit" required placeholder="e.g. people" />
          </FormField>
          <FormField label="What will you enter?" htmlFor="create-measure-kind">
            <Select id="create-measure-kind" name="measurement_type" defaultValue="count">
              {STRATEGIC_MEASURE_TYPES.map((measurementType) => (
                <option key={measurementType} value={measurementType}>{measurementTypeLabel(measurementType)}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="How often will it be updated?" htmlFor="create-measure-frequency">
            <Select id="create-measure-frequency" name="reporting_frequency" defaultValue="monthly">
              {STRATEGIC_MEASURE_FREQUENCIES.map((frequency) => (
                <option key={frequency} value={frequency}>{frequencyLabel(frequency)}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Better when" htmlFor="create-measure-direction">
            <Select id="create-measure-direction" name="direction" defaultValue="higher">
              {CATALOG_DIRECTIONS.map((direction) => (
                <option key={direction} value={direction}>
                  {formatCatalogDirection(direction)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Description" htmlFor="create-measure-description" className="md:col-span-2 lg:col-span-3">
            <Input id="create-measure-description" name="description" placeholder="Optional" />
          </FormField>
        </fieldset>
        {goals.length === 0 ? (
          <p className="mt-4 text-sm text-ink-600">Add a goal before adding a measure.</p>
        ) : null}
        <div className="mt-4 flex justify-end">
          <Button type="submit" variant="primary" size="sm" icon={Plus} isLoading={isSubmitting} disabled={goals.length === 0}>Create measure</Button>
        </div>
      </form>
    </Card>
  );
}

function measurementTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    binary: "Yes or no",
    milestone: "Milestone progress",
    count: "Number",
    percentage: "Percentage",
    average: "Average",
    cumulative: "Running total",
    year_over_year: "Change from last year",
    distribution: "Groups or categories",
    currency: "Money",
    ratio: "Ratio",
    multi_component: "Several values combined",
  };
  return labels[value] ?? value;
}

function frequencyLabel(value: string): string {
  const labels: Record<string, string> = {
    monthly: "Every month",
    quarterly: "Every quarter",
    annual: "Once a year",
    cumulative: "Running total",
    one_time: "Once",
  };
  return labels[value] ?? value;
}
