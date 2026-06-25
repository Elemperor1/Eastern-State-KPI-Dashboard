"use client";

import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "error" | "warning" | "info" | "brand";
  icon?: LucideIcon;
}

const variants = {
  default: "bg-ink-100 text-ink-700",
  success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  error: "bg-red-50 text-red-700 border border-red-200",
  warning: "bg-amber-50 text-amber-700 border border-amber-200",
  info: "bg-brand-50 text-brand-800 border border-brand-200",
  brand: "bg-brand-700 text-white border border-brand-700",
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
