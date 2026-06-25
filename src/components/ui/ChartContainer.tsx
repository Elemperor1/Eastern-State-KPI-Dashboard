"use client";

import { Card } from "./Card";

interface ChartContainerProps {
  eyebrow?: string;
  title?: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function ChartContainer({
  eyebrow,
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: ChartContainerProps) {
  return (
    <Card as="section" className={className}>
      {(eyebrow || title || subtitle || action) ? (
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            {eyebrow ? <p className="section-eyebrow">{eyebrow}</p> : null}
            {title ? <h2 className="section-title">{title}</h2> : null}
            {subtitle ? <div className="text-sm text-ink-500 mt-1 text-pretty">{subtitle}</div> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}
