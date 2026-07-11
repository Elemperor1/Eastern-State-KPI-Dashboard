"use client";

import { Card, Skeleton, SkeletonTable } from "@/components/ui";

export default function Loading() {
  return (
    <div className="page-content page-content-wide">
      <Skeleton className="mb-5 h-10 w-36" />
      <div className="mb-8">
        <Skeleton className="mb-3 h-3 w-28" />
        <Skeleton className="mb-3 h-9 w-full max-w-xl" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <Skeleton className="mb-6 h-12 w-full max-w-3xl" />
      <Card className="p-5 lg:p-6">
        <Skeleton className="mb-6 h-7 w-64" />
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 12 }).map((_, index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>
        <SkeletonTable rows={5} />
      </Card>
    </div>
  );
}
