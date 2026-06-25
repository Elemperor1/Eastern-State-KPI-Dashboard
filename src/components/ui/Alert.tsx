"use client";

import { cn } from "@/lib/utils";

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "error" | "neutral";
}

const variants = {
  error: "text-sm leading-6 text-[var(--color-danger-text)] bg-[var(--color-danger-bg)] rounded-lg px-4 py-3 shadow-[inset_0_0_0_1px_rgba(139,36,73,0.15)]",
  neutral: "text-sm leading-6 text-brand-800 bg-brand-50 rounded-lg px-4 py-3 shadow-[inset_0_0_0_1px_rgba(66,32,130,0.1)]",
};

export function Alert({ children, className, variant = "neutral", ...props }: AlertProps) {
  return (
    <div role="alert" aria-live="polite" className={cn(variants[variant], className)} {...props}>
      {children}
    </div>
  );
}
