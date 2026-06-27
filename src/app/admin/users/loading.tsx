"use client";

import { Card, Skeleton, SkeletonTable } from "@/components/ui";

export default function Loading() {
  return (
    <div className="page-content">
      <div className="mb-8 page-enter">
        <Skeleton className="h-3 w-32 mb-3" />
        <Skeleton className="mb-3 h-9 w-72" />
        <Skeleton className="h-5 w-full max-w-md" />
      </div>
      <Card className="mb-8 p-5 lg:p-6">
        <Skeleton className="mb-5 h-6 w-48" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-md" />
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
      </Card>
      <Card className="p-5 lg:p-6">
        <Skeleton className="mb-5 h-6 w-48" />
        <SkeletonTable rows={6} />
      </Card>
    </div>
  );
}