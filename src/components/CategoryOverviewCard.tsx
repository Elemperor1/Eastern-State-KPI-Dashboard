"use client";

import { ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import clsx from "clsx";
import { CardAction, Progress } from "@/components/ui";
import type { CategoryOverviewSummary } from "@/features/reporting/types";

interface Props {
  summary: CategoryOverviewSummary;
  accent: string;
}

export function CategoryOverviewCard({
  summary,
  accent,
}: Props) {
  const { category, improving, declining, flat, total, pctImproving, topMover } = summary;

  return (
    <CardAction as="a" href={`/dashboard/category/${category.slug}`} className="relative overflow-hidden p-5">
      <span
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ backgroundColor: accent }}
        aria-hidden
      />
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="mt-1 inline-block size-2 shrink-0 rounded-sm"
            style={{ backgroundColor: accent }}
            aria-hidden
          />
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold leading-tight text-ink-900">
              {category.name}
            </h3>
            <p className="mt-1 text-sm text-ink-500">{total} metrics</p>
          </div>
        </div>
        <ChevronRight className="mt-1 size-4 shrink-0 text-ink-400 transition-colors group-hover:text-ink-900" aria-hidden />
      </div>

      {category.description ? (
        <p className="mb-5 hidden min-h-12 text-sm leading-6 text-ink-600 text-pretty sm:line-clamp-2">
          {category.description}
        </p>
      ) : null}

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            Improving YoY
          </span>
          <span className="text-sm font-semibold tabular text-ink-900">{pctImproving}%</span>
        </div>
        <Progress value={pctImproving} color={accent} />
      </div>

      <div className="flex items-center gap-4 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-success-text)]" aria-label={`${improving} improving`}>
          <TrendingUp className="w-3.5 h-3.5" aria-hidden /> {improving}
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-danger-text)]" aria-label={`${declining} declining`}>
          <TrendingDown className="w-3.5 h-3.5" aria-hidden /> {declining}
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-ink-500" aria-label={`${flat} unchanged`}>
          <Minus className="w-3.5 h-3.5" aria-hidden /> {flat}
        </span>
      </div>

      {topMover && topMover.pct !== null ? (
        <div className="mt-5 hidden items-baseline gap-1 text-sm sm:flex">
          <span className="shrink-0 whitespace-nowrap text-ink-500">Top mover: </span>
          <span className="min-w-0 truncate font-medium text-ink-900">{topMover.kpi.name}</span>
          <span
            className={clsx(
              "tabular ml-auto shrink-0 font-medium",
              topMover.favorable ? "text-[var(--color-success-text)]" : "text-[var(--color-danger-text)]",
            )}
          >
            {topMover.kpi.unit_type === "percent"
              ? `${topMover.pct > 0 ? "+" : ""}${topMover.pct.toFixed(1)} pts`
              : `${topMover.pct > 0 ? "+" : ""}${topMover.pct.toFixed(1)}%`}
          </span>
        </div>
      ) : null}
    </CardAction>
  );
}
