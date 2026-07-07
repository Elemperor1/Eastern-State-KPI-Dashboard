import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { GoalsManagerClient } from "./GoalsManagerClient";
import { listGoals, listKPIs } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function GoalsManagerPage() {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");
  if (user.role !== "admin") redirect("/dashboard/overview");

  // Show YTD pace through the current real-world month.
  const throughMonth = Math.min(new Date().getMonth() + 1, 12);

  return (
    <AppShell user={user}>
      <GoalsManagerClient goals={listGoals({ throughMonth })} kpis={listKPIs()} />
    </AppShell>
  );
}