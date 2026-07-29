"use client";

import { useEffect, useRef } from "react";
import { MapPinOff } from "lucide-react";
import { BrandMark, Card, LinkButton } from "@/components/ui";

/** Renders a focused recovery surface for an unknown product URL. */
export function NotFoundState() {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="flex min-h-dvh items-center bg-ink-50 px-6 py-12 text-ink-950">
      <Card
        as="section"
        variant="elevated"
        className="mx-auto w-full max-w-2xl p-6 sm:p-8"
        aria-labelledby="not-found-heading"
      >
        <BrandMark size="sm" />
        <div className="mt-6 flex size-11 items-center justify-center rounded-lg bg-(--color-info-bg) text-brand-800">
          <MapPinOff className="size-5" aria-hidden />
        </div>
        <h1
          id="not-found-heading"
          ref={headingRef}
          tabIndex={-1}
          className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-ink-950 focus:outline-hidden"
        >
          Page not found
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-ink-600">
          This address does not match a current priority, measure, or product
          destination. Choose a safe destination to continue.
        </p>
        <nav className="mt-6 flex flex-wrap gap-3" aria-label="Page recovery">
          <LinkButton href="/dashboard/overview">Go to Overview</LinkButton>
          <LinkButton href="/reports" variant="secondary">
            Open Reports
          </LinkButton>
        </nav>
      </Card>
    </main>
  );
}
