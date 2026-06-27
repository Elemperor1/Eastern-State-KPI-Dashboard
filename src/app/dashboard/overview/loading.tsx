"use client";

import { Skeleton, SkeletonCard } from "@/components/ui";

export default function Loading() {
  return (
    <div className="page-content page-content-wide">
      <div className="mb-8 page-enter">
        <Skeleton className="h-3 w-32 mb-3" />
        <Skeleton className="mb-3 h-9 w-72" />
        <Skeleton className="h-5 w-full max-w-md" />
      </div>
      <div className="mb-8 flex flex-wrap items-end gap-4 rounded-xl bg-ink-100 p-4">
        <Skeleton className="h-11 w-40 rounded-md" />
        <Skeleton className="h-11 w-40 rounded-md" />
        <Skeleton className="h-11 w-40 rounded-md" />
      </div>
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}