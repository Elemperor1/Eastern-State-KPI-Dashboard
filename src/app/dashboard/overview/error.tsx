"use client";

import { RouteErrorState } from "@/components/RouteErrorState";

export default function OverviewError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorState title="Overview couldn’t load" reset={reset} />;
}
