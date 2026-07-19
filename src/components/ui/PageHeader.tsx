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

/** Renders the page header interface. */
export function PageHeader({ eyebrow, title, subtitle, actions, className, children }: PageHeaderProps) {
  return (
    <header className={cn("mb-8 flex flex-wrap items-start justify-between gap-5", className)}>
      <div className="max-w-3xl">
        {eyebrow ? (
          <p className="section-eyebrow">{eyebrow}</p>
        ) : null}
        <h1 className="text-[30px] font-medium leading-[1.2] tracking-[-0.02em] text-ink-900 text-balance">
          {title}
        </h1>
        {subtitle ? (
          <div className="mt-2 max-w-2xl text-base leading-6 text-ink-600 text-pretty">{subtitle}</div>
        ) : null}
        {children}
      </div>
      {actions ? (
        <div className="no-print flex w-full min-w-0 flex-wrap items-center gap-3 sm:w-auto sm:shrink-0">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
