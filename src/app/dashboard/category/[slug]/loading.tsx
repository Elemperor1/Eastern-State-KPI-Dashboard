"use client";

import { Card, Skeleton, SkeletonCard, SkeletonTable } from "@/components/ui";

/** Renders the loading interface. */
export default function Loading() {
  return (
    <div className="page-content page-content-wide">
      <div className="mb-6 flex items-center gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="mb-8 page-enter">
        <Skeleton className="h-3 w-32 mb-3" />
        <Skeleton className="mb-3 h-9 w-80" />
        <Skeleton className="h-5 w-full max-w-lg" />
      </div>
      <div className="mb-8 flex flex-wrap items-end gap-4 rounded-xl bg-ink-100 p-4">
        <Skeleton className="h-11 w-40 rounded-md" />
        <Skeleton className="h-11 w-40 rounded-md" />
        <Skeleton className="h-11 w-40 rounded-md" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="mt-10">
        <Card className="p-5 lg:p-6">
          <Skeleton className="mb-5 h-6 w-48" />
          <SkeletonTable rows={5} />
        </Card>
      </div>
    </div>
  );
}