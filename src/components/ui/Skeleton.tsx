"use client";

import { cn } from "@/lib/utils";
import { Card } from "./Card";

interface SkeletonProps {
  className?: string;
  rounded?: "sm" | "md" | "lg" | "xl" | "full";
}

/** Renders the skeleton interface. */
export function Skeleton({ className, rounded = "md" }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse bg-ink-200/80",
        rounded === "sm" && "rounded",
        rounded === "md" && "rounded-md",
        rounded === "lg" && "rounded-lg",
        rounded === "xl" && "rounded-xl",
        rounded === "full" && "rounded-full",
        className,
      )}
      aria-hidden
      data-skeleton
    />
  );
}

/** Renders the skeleton card interface. */
export function SkeletonCard() {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-3/4" />
        </div>
        <Skeleton className="h-10 w-1 rounded-full" />
      </div>
      <Skeleton className="h-8 w-32 mb-1" />
      <Skeleton className="h-3 w-40 mb-5" />
      <div className="flex items-center justify-between pt-4">
      <Skeleton className="h-6 w-24 rounded" />
        <Skeleton className="h-4 w-20" />
      </div>
    </Card>
  );
}

/** Renders the skeleton table interface. */
export function SkeletonTable({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-4">
        <Skeleton className="h-3 flex-1" />
        <Skeleton className="h-3 flex-1" />
        <Skeleton className="h-3 flex-1" />
        <Skeleton className="h-3 w-16" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 items-center">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-8 w-8" rounded="lg" />
        </div>
      ))}
    </div>
  );
}
