"use client";

import { cn } from "@/lib/utils";

interface FilterToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/** Renders the filter toolbar interface. */
export function FilterToolbar({ children, className, ...props }: FilterToolbarProps) {
  return (
    <div className={cn("filter-toolbar no-print", className)} {...props}>
      {children}
    </div>
  );
}
