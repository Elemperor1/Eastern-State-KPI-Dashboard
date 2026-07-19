"use client";

import { RouteErrorState } from "@/components/RouteErrorState";

/** Renders the overview error interface. */
export default function OverviewError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorState title="Overview couldn’t load" reset={reset} />;
}
