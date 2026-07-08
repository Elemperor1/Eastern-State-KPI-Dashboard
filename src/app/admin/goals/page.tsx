import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import { AppShell } from "@/components/AppShell";
import { GoalsManagerClient } from "./GoalsManagerClient";
import { listKPIs } from "@/features/catalog/server";
import { listGoals } from "@/features/goals";

export const dynamic = "force-dynamic";

export default async function GoalsManagerPage() {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");
  if (user.role !== "admin") redirect("/dashboard/overview");

  // Show YTD pace through the current real-world month.
  const throughMonth = Math.min(new Date().getMonth() + 1, 12);
  const asOfYear = new Date().getFullYear();

  return (
    <AppShell user={user}>
      <GoalsManagerClient
        goals={listGoals({ throughMonth, asOfYear })}
        kpis={listKPIs()}
      />
    </AppShell>
  );
}
