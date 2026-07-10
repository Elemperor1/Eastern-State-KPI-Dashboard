import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import { AppShell } from "@/components/AppShell";
import {
  listDeletedHistoryCategories,
  listDeletedHistoryKpis,
  listEntryHistory,
} from "@/features/audit/server";
import { listCategories, listKPIs } from "@/features/catalog/server";
import { HistoryClient } from "./HistoryClient";
import type { Category, KPIWithCategory } from "@/lib/types";
import { listStrategicAuditEvents } from "@/features/strategy/server";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ kpi_id?: string; category_id?: string; year?: string }>;
}) {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");
  if (user.role !== "admin") redirect("/dashboard/overview");

  const params = await searchParams;
  const filter: Parameters<typeof listEntryHistory>[0] = {};
  if (params.kpi_id) filter.kpi_id = Number(params.kpi_id);
  if (params.category_id) filter.category_id = Number(params.category_id);
  if (params.year) filter.year = Number(params.year);

  // Load the filtered history plus the full unfiltered history so we can
  // surface tombstone entries (KPIs/categories that have been deleted but
  // still appear in the audit trail) as filter options. Without this, once
  // a category or KPI is deleted the filter dropdowns — which are populated
  // from the live tables — can no longer show it, making the history of
  // deleted items unreachable through the UI.
  const history = listEntryHistory(filter);

  const liveCategories = listCategories();
  const liveKpis = listKPIs({ includeInactive: true });
  const mergedCategories: Category[] = [...liveCategories, ...listDeletedHistoryCategories()];
  const mergedKpis: KPIWithCategory[] = [...liveKpis, ...listDeletedHistoryKpis()];

  return (
    <AppShell user={user}>
      <HistoryClient
        history={history}
        kpis={mergedKpis}
        categories={mergedCategories}
        activeFilter={filter}
        strategicEvents={listStrategicAuditEvents({ limit: 500 })}
      />
    </AppShell>
  );
}
