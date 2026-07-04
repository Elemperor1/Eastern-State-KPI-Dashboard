import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { GoalsManagerClient } from "./GoalsManagerClient";
import { listGoals, listKPIs } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function GoalsManagerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");
  if (user.role !== "admin") redirect("/dashboard/overview");

  return (
    <AppShell user={user}>
      <GoalsManagerClient goals={listGoals()} kpis={listKPIs()} />
    </AppShell>
  );
}