import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import { AppShell } from "@/components/AppShell";
import { listCategories, listKPIs } from "@/features/catalog/server";
import { KPIManagerClient } from "./KPIManagerClient";

export const dynamic = "force-dynamic";

export default async function KPIManagerPage() {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");
  if (user.role !== "admin") redirect("/dashboard/overview");

  return (
    <AppShell user={user}>
      <KPIManagerClient
        kpis={listKPIs({ includeInactive: true, includeArchived: true })}
        categories={listCategories({ includeArchived: true })}
      />
    </AppShell>
  );
}
