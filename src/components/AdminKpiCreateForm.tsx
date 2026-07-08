"use client";

import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button, Card, FormField, Input, Select } from "@/components/ui";
import {
  CATALOG_DIRECTIONS,
  CATALOG_REPORTING_FREQUENCIES,
  CATALOG_SLUG_PATTERN,
  CATALOG_UNIT_TYPES,
  formatCatalogDirection,
} from "@/features/catalog/admin-catalog";
import type { Category } from "@/lib/types";

interface AdminKpiCreateFormProps {
  categories: Category[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
}

export function AdminKpiCreateForm({ categories, onSubmit }: AdminKpiCreateFormProps) {
  return (
    <Card className="p-5 lg:p-6">
      <form onSubmit={onSubmit}>
        <h2 className="mb-5 flex items-center gap-2 text-xl font-semibold text-ink-900">
          <Plus className="h-4 w-4" /> Add a new KPI
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <FormField label="Name" className="md:col-span-2">
            <Input name="name" required placeholder="e.g. Virtual program attendees" />
          </FormField>
          <FormField label="Slug">
            <Input name="slug" required placeholder="virtual-attendees" pattern={CATALOG_SLUG_PATTERN} />
          </FormField>
          <FormField label="Category">
            <Select name="category_id" required defaultValue={categories[0]?.id}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Unit label">
            <Input name="unit" required placeholder="e.g. people" />
          </FormField>
          <FormField label="Unit type">
            <Select name="unit_type" defaultValue="count">
              {CATALOG_UNIT_TYPES.map((unitType) => (
                <option key={unitType} value={unitType}>{unitType}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Frequency">
            <Select name="reporting_frequency" defaultValue="monthly">
              {CATALOG_REPORTING_FREQUENCIES.map((frequency) => (
                <option key={frequency} value={frequency}>{frequency}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Direction">
            <Select name="direction" defaultValue="higher">
              {CATALOG_DIRECTIONS.map((direction) => (
                <option key={direction} value={direction}>
                  {formatCatalogDirection(direction)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Description" className="md:col-span-2 lg:col-span-3">
            <Input name="description" placeholder="Optional" />
          </FormField>
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="submit" variant="primary" size="sm" icon={Plus}>Create KPI</Button>
        </div>
      </form>
    </Card>
  );
}
