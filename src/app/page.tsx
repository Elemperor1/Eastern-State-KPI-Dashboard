import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/lib/session";
import { ensureSeedAdmin } from "@/lib/auth";
import { AUTH_DISABLED } from "@/lib/auth-flag";

// Run once at module load to make sure an admin can always log in.
ensureSeedAdmin();

export default async function HomePage() {
  if (AUTH_DISABLED) {
    redirect("/dashboard/overview");
  }
  const user = await getCurrentUserReadOnly();
  if (user) {
    // A logged-in user whose credential is still a temporary bootstrap
    // / admin-issued password must rotate it before reaching the app.
    // getCurrentUser returns null for a session invalidated by a
    // security-sensitive account change (issuedAt <
    // sessions_valid_after) or by deletion/disablement, so a stale
    // cookie falls through to /login instead of /dashboard.
    if (user.must_change_password) redirect("/setup-password");
    redirect("/dashboard");
  }
  redirect("/login");
}