"use client";

import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "error" | "warning" | "info" | "brand";
  icon?: LucideIcon;
}

const variants = {
  default: "bg-ink-100 text-ink-700",
  success: "bg-[var(--color-success-bg)] text-[var(--color-success-text)]",
  error: "bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]",
  warning: "bg-accent-300 text-ink-950",
  info: "bg-brand-50 text-brand-800",
  brand: "bg-ink-950 text-white",
};

export function Badge({ children, variant = "default", icon: Icon, className, ...props }: BadgeProps) {
  return (
    <span
      className={cn("pill", variants[variant], className)}
      {...props}
    >
      {Icon ? <Icon className="w-3.5 h-3.5" aria-hidden /> : null}
      {children}
    </span>
  );
}
