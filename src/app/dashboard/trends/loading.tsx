"use client";

import { Card, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="page-content page-content-wide">
      <div className="mb-8 page-enter">
        <Skeleton className="h-3 w-32 mb-3" />
        <Skeleton className="mb-3 h-9 w-72" />
        <Skeleton className="h-5 w-full max-w-md" />
      </div>
      <div className="mb-6 flex gap-2 rounded-md bg-ink-100 p-1">
        <Skeleton className="h-9 w-32 rounded" />
        <Skeleton className="h-9 w-32 rounded" />
        <Skeleton className="h-9 w-32 rounded" />
      </div>
      <div className="mb-8 flex flex-wrap items-end gap-4 rounded-xl bg-ink-100 p-4">
        <Skeleton className="h-11 w-56 rounded-md" />
        <Skeleton className="h-11 w-40 rounded-md" />
        <Skeleton className="h-11 w-40 rounded-md" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-10 w-10 rounded-md" />
          <Skeleton className="h-10 w-10 rounded-md" />
        </div>
      </div>
      <div className="mb-6">
        <Skeleton className="mb-3 h-4 w-48" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-32 rounded-full" />
          ))}
        </div>
      </div>
      <Card className="p-5 lg:p-6">
        <Skeleton className="mb-5 h-6 w-56" />
        <Skeleton className="h-80 w-full rounded-md" />
      </Card>
    </div>
  );
}