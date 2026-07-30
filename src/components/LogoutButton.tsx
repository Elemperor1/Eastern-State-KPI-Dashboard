"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui";
import { logoutRequest } from "./logout-model";

/** Renders the logout button interface. */
export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Implements the logout operation. */
  async function logout() {
    setBusy(true);
    setError(null);
    const outcome = await logoutRequest();
    setBusy(false);
    if (!outcome.ok) {
      // S073-C1: the session is still valid — stay put and say so
      // instead of navigating to /login as if sign-out succeeded.
      setError("Sign-out failed. Check your connection and try again.");
      return;
    }
    router.push("/login");
    router.refresh();
  }
  return (
    <div>
      <Button
        variant="darkGhost"
        fullWidth
        onClick={logout}
        isLoading={busy}
        className="justify-start"
        icon={busy ? Loader2 : LogOut}
      >
        Sign out
      </Button>
      {error ? (
        <div
          role="alert"
          className="mt-2 rounded-lg bg-(--color-danger-bg) px-3 py-2 text-xs normal-case leading-5 tracking-normal text-(--color-danger-text)"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
