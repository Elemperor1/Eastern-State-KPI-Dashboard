import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { KPIManagerClient } from "./KPIManagerClient";
import { listCategories, listKPIs } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function KPIManagerPage() {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");
  if (user.role !== "admin") redirect("/dashboard/overview");

  return (
    <AppShell user={user}>
      <KPIManagerClient kpis={listKPIs()} categories={listCategories()} />
    </AppShell>
  );
}