"use client";

import { Card, Skeleton, SkeletonTable } from "@/components/ui";

export default function Loading() {
  return (
    <div className="page-content page-content-wide">
      <div className="mb-8 page-enter">
        <Skeleton className="mb-3 h-3 w-28" />
        <Skeleton className="mb-3 h-9 w-72" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Card key={index} className="p-5">
            <Skeleton className="mb-5 h-3 w-28" />
            <Skeleton className="mb-2 h-9 w-14" />
            <Skeleton className="h-3 w-32" />
          </Card>
        ))}
      </div>

      <Card className="mb-6 p-5 lg:p-6">
        <Skeleton className="mb-5 h-5 w-32" />
        <div className="flex flex-wrap gap-4">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="h-11 min-w-36 flex-1" />
          ))}
        </div>
      </Card>

      <Card className="p-5 lg:p-6">
        <Skeleton className="mb-5 h-6 w-48" />
        <SkeletonTable rows={8} />
      </Card>
    </div>
  );
}
