"use client";

import { cn } from "@/lib/utils";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

/** Renders the select interface. */
export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select className={cn("input", className)} {...props}>
      {children}
    </select>
  );
}
