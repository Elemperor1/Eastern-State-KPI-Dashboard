"use client";

import { Card, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="page-content page-content-wide">
      <div className="mb-8 page-enter">
        <Skeleton className="mb-3 h-3 w-32" />
        <Skeleton className="mb-3 h-9 w-72" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <Skeleton className="mb-6 h-14 w-full rounded-lg" />
      <Card className="mb-6 p-5 lg:p-6">
        <Skeleton className="mb-4 h-5 w-48" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <Card className="p-5 lg:p-6">
          <Skeleton className="mb-2 h-3 w-36" />
          <Skeleton className="mb-3 h-7 w-3/5" />
          <Skeleton className="mb-8 h-4 w-full max-w-2xl" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <Skeleton key={index} className="h-11 w-full" />
            ))}
          </div>
        </Card>
        <Card variant="quiet" className="p-5">
          <Skeleton className="mb-4 h-5 w-32" />
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="mb-3 h-14 w-full" />
          ))}
        </Card>
      </div>
    </div>
  );
}
