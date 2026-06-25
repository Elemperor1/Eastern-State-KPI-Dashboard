"use client";

import { FileQuestion, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon = FileQuestion, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex-1 flex items-center justify-center", className)}>
      <div className="text-center max-w-sm px-6">
        <Avatar initials="" size="md" variant="neutral" className="mb-4 mx-auto">
          <Icon className="w-6 h-6" aria-hidden />
        </Avatar>
        <p className="text-sm font-semibold text-ink-900 mb-1">{title}</p>
        {description ? <p className="text-sm text-ink-500 text-pretty mb-4">{description}</p> : null}
        {action ? <div className="inline-flex">{action}</div> : null}
      </div>
    </div>
  );
}
