"use client";

import { Card, Skeleton, SkeletonCard, SkeletonTable } from "@/components/ui";

export default function Loading() {
  return (
    <div className="page-content page-content-wide">
      <div className="mb-6 flex items-center gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="mb-8 page-enter">
        <Skeleton className="h-3 w-32 mb-3" />
        <Skeleton className="mb-3 h-9 w-96" />
        <Skeleton className="h-5 w-full max-w-xl" />
      </div>
      <div className="mb-8 flex flex-wrap items-end gap-4 rounded-xl bg-ink-100 p-4">
        <Skeleton className="h-11 w-40 rounded-md" />
        <Skeleton className="h-11 w-40 rounded-md" />
        <Skeleton className="h-11 w-40 rounded-md" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
        </div>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5 lg:p-6">
          <Skeleton className="mb-5 h-5 w-44" />
          <Skeleton className="h-64 w-full rounded-md" />
        </Card>
        <Card className="p-5 lg:p-6">
          <Skeleton className="mb-5 h-5 w-44" />
          <Skeleton className="h-64 w-full rounded-md" />
        </Card>
      </div>
      <Card className="p-5 lg:p-6">
        <Skeleton className="mb-5 h-5 w-40" />
        <SkeletonTable rows={10} />
      </Card>
    </div>
  );
}