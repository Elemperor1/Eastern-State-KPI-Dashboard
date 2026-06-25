import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ensureSeedAdmin } from "@/lib/auth";

// Run once at module load to make sure an admin can always log in.
ensureSeedAdmin();

export default async function HomePage() {
  const session = await getSession();
  if (session.user) {
    redirect("/dashboard");
  }
  redirect("/login");
}