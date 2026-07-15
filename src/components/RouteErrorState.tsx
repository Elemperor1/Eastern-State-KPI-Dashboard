"use client";

import { useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { BrandMark, Button, Card, LinkButton } from "@/components/ui";
import { ROUTE_RECOVERY_FOCUS_KEY } from "@/lib/route-recovery-focus";

export interface RouteErrorStateProps {
  title: string;
  reset: () => void;
}

export function RouteErrorState({ title, reset }: RouteErrorStateProps) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [isRetrying, startRetry] = useTransition();

  function retry() {
    window.sessionStorage.setItem(ROUTE_RECOVERY_FOCUS_KEY, "main");
    startRetry(() => {
      reset();
      router.refresh();
    });
  }

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="min-h-[100dvh] bg-ink-50 text-ink-950">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex min-h-20 max-w-screen-xl flex-wrap items-center justify-between gap-4 px-6 py-3 lg:px-10">
          <Link
            href="/dashboard/overview"
            className="inline-flex items-center gap-3 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
          >
            <BrandMark size="sm" />
            <span className="font-semibold text-ink-950">Eastern State Strategic Plan</span>
          </Link>
          <nav aria-label="Recovery navigation" className="flex items-center gap-2">
            <LinkButton href="/dashboard/overview" size="sm" variant="ghost">
              Overview
            </LinkButton>
            <LinkButton href="/reports" size="sm" variant="ghost">
              Reports
            </LinkButton>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-screen-xl items-center px-6 py-12 lg:px-10">
        <Card as="section" variant="elevated" className="w-full max-w-2xl p-6 sm:p-8" aria-labelledby="route-error-heading">
          <div className="flex size-11 items-center justify-center rounded-lg bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]">
            <AlertTriangle className="size-5" aria-hidden />
          </div>
          <h1
            id="route-error-heading"
            ref={headingRef}
            tabIndex={-1}
            className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-ink-950 focus:outline-none"
          >
            {title}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-ink-600">
            We couldn&apos;t load this page. Your navigation is still available, and retrying is safe.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              type="button"
              variant="primary"
              icon={RotateCcw}
              isLoading={isRetrying}
              onClick={retry}
            >
              {isRetrying ? "Retrying" : "Try again"}
            </Button>
            <LinkButton href="/dashboard/overview">Go to Overview</LinkButton>
          </div>
          <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {isRetrying ? "Retrying this page." : ""}
          </span>
        </Card>
      </main>
    </div>
  );
}
