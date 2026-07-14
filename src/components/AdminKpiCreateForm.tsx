"use client";

import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button, Card, FormField, Input, Select } from "@/components/ui";
import {
  CATALOG_DIRECTIONS,
  CATALOG_REPORTING_FREQUENCIES,
  CATALOG_UNIT_TYPES,
  formatCatalogDirection,
} from "@/features/catalog/admin-catalog";
import type { Category } from "@/lib/types";

interface AdminKpiCreateFormProps {
  categories: Category[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  isSubmitting?: boolean;
}

export function AdminKpiCreateForm({
  categories,
  onSubmit,
  isSubmitting = false,
}: AdminKpiCreateFormProps) {
  return (
    <Card className="p-5 lg:p-6">
      <form onSubmit={onSubmit}>
        <h2 className="mb-5 flex items-center gap-2 text-xl font-semibold text-ink-900">
          <Plus className="h-4 w-4" /> Add measure
        </h2>
        <fieldset disabled={isSubmitting} className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <FormField label="Name" htmlFor="create-measure-name" className="md:col-span-2">
            <Input id="create-measure-name" name="name" required placeholder="e.g. Virtual program attendees" />
          </FormField>
          <FormField label="Priority" htmlFor="create-measure-priority">
            <Select id="create-measure-priority" name="category_id" required defaultValue={categories[0]?.id}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Unit label" htmlFor="create-measure-unit">
            <Input id="create-measure-unit" name="unit" required placeholder="e.g. people" />
          </FormField>
          <FormField label="Kind of value" htmlFor="create-measure-kind">
            <Select id="create-measure-kind" name="unit_type" defaultValue="count">
              {CATALOG_UNIT_TYPES.map((unitType) => (
                <option key={unitType} value={unitType}>{unitType === "attendance" ? "Attendance" : unitType === "breakdown" ? "Groups" : unitType.replace(/^./, (first) => first.toUpperCase())}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="How often?" htmlFor="create-measure-frequency">
            <Select id="create-measure-frequency" name="reporting_frequency" defaultValue="monthly">
              {CATALOG_REPORTING_FREQUENCIES.map((frequency) => (
                <option key={frequency} value={frequency}>{frequency === "annual" ? "Yearly" : frequency.replace(/^./, (first) => first.toUpperCase())}</option>
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
        <div className="mt-4 flex justify-end">
          <Button type="submit" variant="primary" size="sm" icon={Plus} isLoading={isSubmitting}>Create measure</Button>
        </div>
      </form>
    </Card>
  );
}
