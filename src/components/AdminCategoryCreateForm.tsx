"use client";

import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button, Card, FormField, Input } from "@/components/ui";
import { CATALOG_SLUG_PATTERN } from "@/features/catalog/admin-catalog";

interface AdminCategoryCreateFormProps {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
}

export function AdminCategoryCreateForm({ onSubmit }: AdminCategoryCreateFormProps) {
  return (
    <Card className="p-5 lg:p-6">
      <form onSubmit={onSubmit}>
        <h2 className="mb-5 flex items-center gap-2 text-xl font-semibold text-ink-900">
          <Plus className="h-4 w-4" /> Add a new category
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FormField label="Name">
            <Input name="name" required placeholder="Education" />
          </FormField>
          <FormField label="Slug">
            <Input name="slug" required placeholder="education" pattern={CATALOG_SLUG_PATTERN} />
          </FormField>
          <FormField label="Description">
            <Input name="description" placeholder="Optional" />
          </FormField>
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="submit" variant="primary" size="sm" icon={Plus}>Create category</Button>
        </div>
      </form>
    </Card>
  );
}
