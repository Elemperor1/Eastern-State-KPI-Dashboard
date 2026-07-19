"use client";

import { FileQuestion, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/** Renders the empty state interface. */
export function EmptyState({ icon: Icon = FileQuestion, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex-1 flex items-center justify-center", className)}>
      <div className="max-w-sm px-6 text-center">
        <div className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-800">
          <Icon className="w-6 h-6" aria-hidden />
        </div>
        <p className="mb-1 text-base font-semibold text-ink-900">{title}</p>
        {description ? <p className="mb-4 text-sm leading-6 text-ink-600 text-pretty">{description}</p> : null}
        {action ? <div className="inline-flex">{action}</div> : null}
      </div>
    </div>
  );
}
