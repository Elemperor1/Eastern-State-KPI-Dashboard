"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui";

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <Button variant="ghost" fullWidth onClick={logout} className="justify-start text-ink-700">
      <LogOut className="w-4 h-4" />
      Sign out
    </Button>
  );
}
