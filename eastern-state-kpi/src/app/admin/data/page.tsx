import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { AdminDataClient } from "./AdminDataClient";
import { listCategories, listEntries, listKPIs } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function AdminDataPage() {
  const session = await getSession();
  if (!session.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/dashboard/overview");

  return (
    <AppShell active="/admin/data">
      <AdminDataClient
        kpis={listKPIs()}
        categories={listCategories()}
        entries={listEntries()}
        years={Array.from(new Set(listEntries().map((e) => e.year))).sort()}
      />
    </AppShell>
  );
}