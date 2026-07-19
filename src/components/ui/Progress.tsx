"use client";

import { cn } from "@/lib/utils";
import { normalizeProgressValue } from "./progress-values";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  color?: string;
}

/** Renders the progress interface. */
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
        className="progress-indicator h-full w-full rounded-full bg-brand-500"
        style={{
          transform: `scaleX(${normalized.percentage / 100})`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}
