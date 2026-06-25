"use client";

import { Card, Skeleton, SkeletonCard, SkeletonTable } from "@/components/ui";

export default function Loading() {
  return (
    <div className="px-6 py-6 lg:px-8 lg:py-8 max-w-[1400px] mx-auto">
      <div className="mb-8">
        <Skeleton className="h-3 w-32 mb-3" />
        <Skeleton className="h-8 w-72 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="flex flex-wrap items-end gap-4 mb-8">
        <Skeleton className="h-10 w-40 rounded-lg" />
        <Skeleton className="h-10 w-40 rounded-lg" />
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-10">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <Card className="p-5 lg:p-6">
        <Skeleton className="h-5 w-48 mb-5" />
        <SkeletonTable rows={4} />
      </Card>
    </div>
  );
}
