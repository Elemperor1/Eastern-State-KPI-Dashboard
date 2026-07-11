"use client";

import { cn } from "@/lib/utils";
import { normalizeProgressValue } from "./progress-values";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  color?: string;
}

export function Progress({ value, max = 100, color, className, ...props }: ProgressProps) {
  const normalized = normalizeProgressValue(value, max);
  return (
    <div
      className={cn("h-1.5 overflow-hidden rounded-full bg-ink-100", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={normalized.max}
      aria-valuenow={Math.round(normalized.value)}
      {...props}
    >
      <div
        className="h-full rounded-full bg-brand-500 transition-[width] duration-500"
        style={{ width: `${normalized.percentage}%`, backgroundColor: color }}
      />
    </div>
  );
}
