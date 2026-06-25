"use client";

import { Card, Skeleton, SkeletonTable } from "@/components/ui";

export default function Loading() {
  return (
    <div className="page-content">
      <div className="mb-8">
        <Skeleton className="h-3 w-32 mb-3" />
        <Skeleton className="mb-3 h-9 w-80" />
        <Skeleton className="h-5 w-full max-w-lg" />
      </div>
      <div className="mb-8 flex flex-wrap items-end gap-4 rounded-xl bg-ink-100 p-4">
        <Skeleton className="h-11 w-40 rounded-md" />
        <Skeleton className="h-11 w-56 rounded-md" />
        <Skeleton className="h-11 w-32 rounded-md" />
      </div>
      <Card className="p-5 lg:p-6">
        <Skeleton className="mb-5 h-6 w-48" />
        <SkeletonTable rows={8} />
      </Card>
    </div>
  );
}
