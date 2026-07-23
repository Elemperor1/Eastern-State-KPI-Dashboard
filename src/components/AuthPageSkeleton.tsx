"use client";

import { Skeleton } from "@/components/ui";

/** Renders the auth page skeleton interface. */
export function AuthPageSkeleton({ fieldCount = 2 }: { fieldCount?: number }) {
  return (
    <main
      className="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,1.08fr)_minmax(28rem,0.92fr)]"
      aria-busy="true"
    >
      <span className="sr-only" role="status" aria-live="polite">
        Checking account access.
      </span>
      <section
        className="relative hidden overflow-hidden bg-ink-900 px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between"
        style={{ backgroundImage: "url('/starfield.svg')", backgroundSize: "640px 640px" }}
        aria-hidden
      >
        <div className="relative z-10 flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-md bg-white/20" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-28 bg-white/30" />
            <Skeleton className="h-2 w-24 bg-white/20" />
          </div>
        </div>

        <div className="relative z-10 max-w-2xl py-16">
          <Skeleton className="mb-5 h-3 w-44 bg-white/30" />
          <Skeleton className="mb-3 h-14 w-4/5 bg-white/30" />
          <Skeleton className="mb-3 h-14 w-3/5 bg-white/30" />
          <Skeleton className="h-14 w-2/5 bg-white/30" />
          <div className="mt-8 max-w-md space-y-3">
            <Skeleton className="h-3 w-full bg-white/20" />
            <Skeleton className="h-3 w-5/6 bg-white/20" />
            <Skeleton className="h-3 w-4/6 bg-white/20" />
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-4">
          <Skeleton className="h-10 w-32 rounded-md bg-white/20" />
          <Skeleton className="h-3 w-40 bg-white/20" />
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-10" aria-hidden>
        <div className="w-full max-w-sm">
          <Skeleton className="mb-2 h-3 w-24" />
          <Skeleton className="mb-6 h-9 w-56" />
          <div className="space-y-5">
            {Array.from({ length: fieldCount }).map((_, index) => (
              <div key={index}>
                <Skeleton className="mb-2 h-3 w-20" />
                <Skeleton className="h-11 w-full rounded-md" />
              </div>
            ))}
            <Skeleton className="h-11 w-full rounded-md" />
          </div>
        </div>
      </section>
    </main>
  );
}
