import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { listCategories, listEntryHistory, listKPIs } from "@/lib/repository";
import { HistoryClient } from "./HistoryClient";
import type { Category, KPIWithCategory } from "@/lib/types";

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
  const allHistory = listEntryHistory({ limit: 1000 });

  const liveCategories = listCategories();
  const liveKpis = listKPIs({ includeInactive: true });

  // Build tombstone category entries from history rows whose snapshot
  // category_id is not in the live categories list.
  const liveCategoryIds = new Set(liveCategories.map((c) => c.id));
  const tombstoneCategories: Category[] = [];
  for (const row of allHistory) {
    if (
      row.category_id != null &&
      !liveCategoryIds.has(row.category_id) &&
      !tombstoneCategories.some((c) => c.id === row.category_id)
    ) {
      tombstoneCategories.push({
        id: row.category_id,
        name: row.category_name ?? `Deleted category ${row.category_id}`,
        slug: row.category_slug ?? `deleted-${row.category_id}`,
        sort_order: 9999,
        description: null,
      });
    }
  }
  const mergedCategories = [...liveCategories, ...tombstoneCategories];

  // Build tombstone KPI entries from history rows whose kpi_id is not
  // in the live KPIs list.
  const liveKpiIds = new Set(liveKpis.map((k) => k.id));
  const tombstoneKpis: KPIWithCategory[] = [];
  for (const row of allHistory) {
    if (
      !liveKpiIds.has(row.kpi_id) &&
      !tombstoneKpis.some((k) => k.id === row.kpi_id)
    ) {
      tombstoneKpis.push({
        id: row.kpi_id,
        category_id: row.category_id ?? 0,
        parent_id: null,
        slug: row.kpi_slug ?? `deleted-${row.kpi_id}`,
        name: row.kpi_name ?? `Deleted KPI ${row.kpi_id}`,
        unit: row.kpi_unit ?? "",
        unit_type: "count",
        reporting_frequency: "monthly",
        direction: "higher",
        description: null,
        sort_order: 9999,
        is_active: 0,
        created_at: "",
        category_name: row.category_name ?? "Deleted category",
        category_slug: row.category_slug ?? "deleted",
      });
    }
  }
  const mergedKpis = [...liveKpis, ...tombstoneKpis];

  return (
    <AppShell user={user}>
      <HistoryClient
        history={history}
        kpis={mergedKpis}
        categories={mergedCategories}
        activeFilter={filter}
      />
    </AppShell>
  );
}