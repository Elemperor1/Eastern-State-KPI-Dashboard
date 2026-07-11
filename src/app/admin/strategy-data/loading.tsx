"use client";

import { Card, Skeleton, SkeletonTable } from "@/components/ui";

export default function Loading() {
  return (
    <div className="page-content page-content-wide">
      <div className="mb-8 page-enter">
        <Skeleton className="mb-3 h-3 w-32" />
        <Skeleton className="mb-3 h-9 w-80 max-w-full" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>

      <Card className="mb-5 p-5">
        <div className="flex flex-col gap-4 sm:flex-row">
          <Skeleton className="h-11 min-w-0 flex-1 rounded-md" />
          <Skeleton className="h-11 w-full rounded-md sm:w-44" />
        </div>
      </Card>

      <Card variant="quiet" className="mb-5 grid grid-cols-2 gap-4 p-5 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-2 border-l-2 border-ink-200 pl-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-full max-w-40" />
          </div>
        ))}
      </Card>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.45fr)]">
        <Card className="p-5 lg:p-6">
          <Skeleton className="mb-2 h-6 w-40" />
          <Skeleton className="mb-6 h-4 w-full max-w-sm" />
          <div className="space-y-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-11 w-full rounded-md" />
              </div>
            ))}
          </div>
          <Skeleton className="mt-6 h-10 w-32 rounded-md" />
        </Card>

        <Card className="p-5 lg:p-6">
          <Skeleton className="mb-2 h-6 w-36" />
          <Skeleton className="mb-6 h-4 w-52" />
          <SkeletonTable rows={6} />
        </Card>
      </div>
    </div>
  );
}
