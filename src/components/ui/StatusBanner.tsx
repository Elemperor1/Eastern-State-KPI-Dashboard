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
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  error: "bg-red-50 text-red-700 border-red-200",
  neutral: "bg-ink-50 text-ink-700 border-ink-200",
};

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  neutral: Info,
};

export function StatusBanner({ variant = "neutral", children, onDismiss, className }: StatusBannerProps) {
  const Icon = icons[variant];
  return (
    <div
      role="status"
      className={cn(
        "mb-6 flex items-start gap-2.5 text-sm border rounded-lg px-3 py-2.5",
        styles[variant],
        className,
      )}
    >
      <Icon className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
      <span className="flex-1">{children}</span>
      {onDismiss ? (
        <button
          onClick={onDismiss}
          className="shrink-0 p-1 -mr-1 rounded-md hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          aria-label="Dismiss message"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : null}
    </div>
  );
}
