"use client";

import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  variant?: "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
}

export function IconButton({
  icon: Icon,
  label,
  variant = "secondary",
  size = "md",
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "relative inline-flex items-center justify-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 transition-[scale,background-color,border-color] duration-150 ease-out active:scale-[0.96]",
        // Visible size
        size === "sm" ? "w-8 h-8" : "w-9 h-9",
        // Minimum 40×40 px hit area per WCAG / polish skill
        "before:absolute before:-inset-1 before:content-[''] before:rounded-lg",
        variant === "secondary" && "bg-white border border-ink-200 text-ink-700 hover:bg-ink-50 hover:border-ink-300",
        variant === "danger" && "bg-red-50 border border-red-200 text-red-700 hover:bg-red-100",
        variant === "ghost" && "text-ink-500 hover:bg-ink-100 hover:text-ink-700",
        className,
      )}
      {...props}
    >
      <Icon className={cn("shrink-0", size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4")} aria-hidden />
    </button>
  );
}
