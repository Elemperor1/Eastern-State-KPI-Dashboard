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
      title={label}
      className={cn(
        "icon-button relative inline-flex items-center justify-center rounded-lg focus:outline-none transition-[scale,background-color,color,box-shadow] duration-150 ease-out active:scale-[0.96]",
        size === "sm" ? "size-10" : "size-11",
        variant === "secondary" && "bg-white text-ink-700 shadow-[0_0_0_1px_rgba(31,22,51,0.13)] hover:bg-ink-50",
        variant === "danger" && "bg-[var(--color-danger-bg)] text-[var(--color-danger-text)] shadow-[inset_0_0_0_1px_rgba(139,36,73,0.15)] hover:bg-[var(--color-danger-hover)]",
        variant === "ghost" && "text-ink-500 hover:bg-ink-100 hover:text-ink-700",
        className,
      )}
      {...props}
    >
      <Icon className={cn("shrink-0", size === "sm" ? "size-4" : "size-[18px]")} aria-hidden />
    </button>
  );
}
