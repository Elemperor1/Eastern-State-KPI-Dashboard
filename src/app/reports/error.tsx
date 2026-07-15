"use client";

import { RouteErrorState } from "@/components/RouteErrorState";

export default function ReportsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorState title="Reports couldn’t load" reset={reset} />;
}
