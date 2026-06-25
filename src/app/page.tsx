import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ensureSeedAdmin } from "@/lib/auth";
import { AUTH_DISABLED } from "@/lib/auth-flag";

// Run once at module load to make sure an admin can always log in.
ensureSeedAdmin();

export default async function HomePage() {
  if (AUTH_DISABLED) {
    redirect("/dashboard/overview");
  }
  const session = await getSession();
  if (session.user) {
    redirect("/dashboard");
  }
  redirect("/login");
}