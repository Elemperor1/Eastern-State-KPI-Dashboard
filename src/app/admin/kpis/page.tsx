import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { KPIManagerClient } from "./KPIManagerClient";
import { listCategories, listKPIs } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function KPIManagerPage() {
  const session = await getSession();
  if (!session.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/dashboard/overview");

  return (
    <AppShell user={session.user}>
      <KPIManagerClient kpis={listKPIs()} categories={listCategories()} />
    </AppShell>
  );
}