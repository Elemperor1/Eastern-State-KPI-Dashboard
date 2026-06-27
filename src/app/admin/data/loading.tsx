"use client";

import { Card, Skeleton, SkeletonTable } from "@/components/ui";

export default function Loading() {
  return (
    <div className="page-content">
      <div className="mb-8 page-enter">
        <Skeleton className="h-3 w-32 mb-3" />
        <Skeleton className="mb-3 h-9 w-80" />
        <Skeleton className="h-5 w-full max-w-xl" />
      </div>
      <div className="mb-8 flex flex-wrap items-end gap-4 rounded-xl bg-ink-100 p-4">
        <Skeleton className="h-11 w-56 rounded-md" />
        <Skeleton className="h-11 w-56 rounded-md" />
        <Skeleton className="h-11 w-32 rounded-md" />
      </div>
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <Card className="p-5 lg:p-6">
        <Skeleton className="mb-5 h-6 w-48" />
        <SkeletonTable rows={8} />
      </Card>
    </div>
  );
}