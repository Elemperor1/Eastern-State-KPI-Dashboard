"use client";

import { cn } from "@/lib/utils";

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "error" | "neutral";
}

const variants = {
  error: "text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5",
  neutral: "text-sm text-ink-700 bg-ink-50 border border-ink-200 rounded-lg px-3 py-2.5",
};

export function Alert({ children, className, variant = "neutral", ...props }: AlertProps) {
  return (
    <div role="alert" aria-live="polite" className={cn(variants[variant], className)} {...props}>
      {children}
    </div>
  );
}
