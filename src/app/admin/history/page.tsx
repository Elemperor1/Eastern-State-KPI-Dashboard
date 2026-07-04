import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { listCategories, listEntryHistory, listKPIs } from "@/lib/repository";
import { HistoryClient } from "./HistoryClient";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ kpi_id?: string; category_id?: string; year?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");
  if (user.role !== "admin") redirect("/dashboard/overview");

  const params = await searchParams;
  const filter: Parameters<typeof listEntryHistory>[0] = {};
  if (params.kpi_id) filter.kpi_id = Number(params.kpi_id);
  if (params.category_id) filter.category_id = Number(params.category_id);
  if (params.year) filter.year = Number(params.year);

  return (
    <AppShell user={user}>
      <HistoryClient
        history={listEntryHistory(filter)}
        kpis={listKPIs()}
        categories={listCategories()}
        activeFilter={filter}
      />
    </AppShell>
  );
}