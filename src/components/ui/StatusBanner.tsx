"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusBannerProps {
  variant?: "success" | "error" | "neutral";
  children: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const styles = {
  success: "bg-(--color-success-bg) text-(--color-success-text)",
  error: "bg-(--color-danger-bg) text-(--color-danger-text)",
  neutral: "bg-brand-50 text-brand-800",
};

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  neutral: Info,
};

/** Renders the status banner interface. */
export function StatusBanner({ variant = "neutral", children, onDismiss, className }: StatusBannerProps) {
  const Icon = icons[variant];
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      className={cn(
        "mb-6 flex items-start gap-3 rounded-lg px-4 py-3 text-sm leading-6 shadow-[inset_0_0_0_1px_rgba(31,22,51,0.08)]",
        styles[variant],
        className,
      )}
    >
      <Icon className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
      <span className="flex-1">{children}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="icon-button -my-2 -mr-2 grid size-10 shrink-0 place-items-center rounded-lg hover:bg-black/5 focus:outline-hidden"
          aria-label="Dismiss message"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : null}
    </div>
  );
}
