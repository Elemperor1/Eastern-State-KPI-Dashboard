"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui";

/** Renders the logout button interface. */
export function LogoutButton() {
  const router = useRouter();
  /** Implements the logout operation. */
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <Button variant="darkGhost" fullWidth onClick={logout} className="justify-start" icon={LogOut}>
      Sign out
    </Button>
  );
}
