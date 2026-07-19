"use client";

import { RouteErrorState } from "@/components/RouteErrorState";

/** Renders the setup error interface. */
export default function SetupError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorState title="Setup couldn’t load" reset={reset} />;
}
