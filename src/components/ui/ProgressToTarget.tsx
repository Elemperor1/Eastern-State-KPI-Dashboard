"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleDashed,
  Clock3,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, type BadgeProps } from "./Badge";
import { Card } from "./Card";
import { Progress } from "./Progress";
import {
  normalizeProgressToTargetViewModel,
  type ProgressToTargetStatus,
  type ProgressToTargetViewModel,
} from "./progress-to-target-model";

export interface ProgressToTargetProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  model: ProgressToTargetViewModel;
  eyebrow?: string;
}

const STATUS_PRESENTATION: Record<
  ProgressToTargetStatus,
  { icon: LucideIcon; variant: BadgeProps["variant"] }
> = {
  not_started: { icon: Circle, variant: "default" },
  in_progress: { icon: Clock3, variant: "info" },
  complete: { icon: CheckCircle2, variant: "success" },
  exceeded: { icon: TrendingUp, variant: "success" },
  target_not_finalized: { icon: AlertTriangle, variant: "incomplete" },
  needs_definition: { icon: CircleDashed, variant: "warning" },
};

/**
 * Export-safe progress-to-target presentation.
 *
 * Callers provide a calculated view model; this component performs no business
 * formulas. It keeps over-performance in text while capping only the visual
 * fill, and it exposes the uncapped result through aria-valuetext.
 */
export function ProgressToTarget({
  model,
  eyebrow = "Progress to target",
  className,
  ...props
}: ProgressToTargetProps) {
  const normalized = normalizeProgressToTargetViewModel(model);
  const statusPresentation = STATUS_PRESENTATION[normalized.status];

  return (
    <Card
      as="section"
      className={cn("overflow-hidden p-5 lg:p-6", className)}
      data-pdf-keep-together
      data-raster-export-text
      aria-label={normalized.accessibleLabel}
      {...props}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="section-eyebrow">{eyebrow}</p>
          <p className="text-sm font-medium text-ink-600">
            {normalized.targetYearLabel}
          </p>
        </div>
        <Badge
          variant={statusPresentation.variant}
          icon={statusPresentation.icon}
          label="Progress status"
          aria-label={`Progress status: ${normalized.stateLabel}`}
        >
          {normalized.stateLabel}
        </Badge>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Amount
          label="Current amount"
          value={normalized.currentAmountLabel}
        />
        <Amount
          label="Target amount"
          value={normalized.targetAmountLabel}
        />
      </dl>

      <div className="mt-5">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              Actual progress
            </p>
            <p className="mt-1 text-xl font-semibold tabular text-ink-900">
              {normalized.actualPercentageLabel}
            </p>
          </div>
          <p className="text-sm font-medium text-ink-600">
            {normalized.stateLabel}
          </p>
        </div>

        {normalized.hasCalculatedProgress ? (
          <Progress
            value={normalized.displayProgressPercentage}
            className="h-2.5"
            aria-label={normalized.accessibleLabel}
            aria-valuetext={normalized.ariaValueText}
          />
        ) : (
          <div
            className="h-2.5 overflow-hidden rounded-full bg-ink-100"
            role="status"
            aria-label={normalized.accessibleLabel}
            aria-live="polite"
          >
            <span className="sr-only">{normalized.ariaValueText}</span>
          </div>
        )}
      </div>

      <div className="mt-5 rounded-lg bg-ink-50 px-4 py-3 shadow-[inset_0_0_0_1px_var(--color-hairline-light)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
          Target description
        </p>
        <p className="mt-1 text-base font-semibold leading-6 text-ink-900 text-pretty">
          {normalized.targetDescription}
        </p>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-4 border-t border-ink-100 pt-4 sm:grid-cols-2">
        <StatusDetail label="Pacing status" value={normalized.pacingStatus} />
        <StatusDetail label="Board status" value={normalized.boardStatus} />
      </dl>
    </Card>
  );
}

function Amount({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-2xl font-semibold leading-tight tabular text-ink-900">
        {value}
      </dd>
    </div>
  );
}

function StatusDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold leading-5 text-ink-900">
        {value}
      </dd>
    </div>
  );
}
