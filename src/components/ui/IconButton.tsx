"use client";

import { cn } from "@/lib/utils";
import { runEventHandler } from "@/lib/async-event";
import { type LucideIcon } from "lucide-react";

interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  icon: LucideIcon;
  label: string;
  variant?: "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  onClick?: (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => void | Promise<void>;
}

/** Renders the icon button interface. */
export function IconButton({
  icon: Icon,
  label,
  variant = "secondary",
  size = "md",
  className,
  onClick,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick ? (event) => runEventHandler(onClick, event) : undefined}
      className={cn(
        "icon-button relative inline-flex items-center justify-center rounded-lg focus:outline-none transition-[scale,background-color,color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-out)] active:scale-[0.96]",
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
