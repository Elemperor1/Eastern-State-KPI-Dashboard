"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { Badge, Card, IconButton } from "@/components/ui";
import type { Category } from "@/lib/types";

interface AdminCategoriesListProps {
  categories: Category[];
  onDelete: (id: number, name: string) => void;
  onRestore: (id: number, name: string) => void;
}

export function AdminCategoriesList({
  categories,
  onDelete,
  onRestore,
}: AdminCategoriesListProps) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-ink-100 p-5">
        <h2 className="text-xl font-semibold text-ink-900">Existing categories</h2>
        <p className="mt-1 text-sm text-ink-500">{categories.length} reporting areas</p>
      </div>
      <div className="space-y-2">
        {categories.map((category) => (
          <div
            key={category.id}
            className="flex items-start justify-between border-b border-ink-100 p-4 transition-colors last:border-b-0 hover:bg-ink-50/70"
          >
            <div className="min-w-0">
              <span className="font-medium text-ink-900">{category.name}</span>
              {category.archived_at ? (
                <Badge variant="warning" className="ml-2">Archived</Badge>
              ) : null}
              <span className="ml-2 text-xs text-ink-400">{category.slug}</span>
              {category.description ? (
                <p className="mt-0.5 text-pretty text-xs text-ink-500">{category.description}</p>
              ) : null}
            </div>
            {category.archived_at ? (
              <IconButton
                icon={RotateCcw}
                label={`Restore category ${category.name}`}
                size="sm"
                onClick={() => onRestore(category.id, category.name)}
                className="ml-3 shrink-0"
              />
            ) : (
              <IconButton
                icon={Trash2}
                label={`Archive or delete category ${category.name}`}
                variant="danger"
                size="sm"
                onClick={() => onDelete(category.id, category.name)}
                className="ml-3 shrink-0"
              />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
