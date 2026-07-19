"use client";

import { RouteErrorState } from "@/components/RouteErrorState";

/** Renders the data entry error interface. */
export default function DataEntryError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorState title="Data Entry couldn’t load" reset={reset} />;
}
