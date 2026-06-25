"use client";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function PageHeader({ eyebrow, title, subtitle, actions, className, children }: PageHeaderProps) {
  return (
    <header className={cn("mb-6 lg:mb-8 flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="section-eyebrow">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl lg:text-3xl font-semibold text-ink-900 text-balance">{title}</h1>
        {subtitle ? (
          <div className="text-sm text-ink-500 mt-2 text-pretty">{subtitle}</div>
        ) : null}
        {children}
      </div>
      {actions ? (
        <div className="flex items-center gap-3 no-print shrink-0">{actions}</div>
      ) : null}
    </header>
  );
}
