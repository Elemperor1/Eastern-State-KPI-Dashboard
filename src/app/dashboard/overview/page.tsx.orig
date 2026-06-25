import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { DashboardOverviewClient } from "./DashboardOverviewClient";
import { listCategories, listEntries, listKPIs } from "@/lib/repository";
import { defaultComparisonPair } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getSession();
  if (!session.user) redirect("/login");

  const kpis = listKPIs();
  const categories = listCategories();
  const allEntries = listEntries();

  const availableYears = Array.from(new Set(allEntries.map((e) => e.year))).sort((a, b) => b - a);
  const fallbackPair = defaultComparisonPair(availableYears);

  const initialState = {
    kpiSlug: typeof searchParams.kpi === "string" ? searchParams.kpi : "all",
    categorySlug: typeof searchParams.category === "string" ? searchParams.category : "all",
    currentYear: Number(searchParams.currentYear) || fallbackPair.currentYear,
    compareYear: Number(searchParams.compareYear) || fallbackPair.compareYear,
    currentMonth: Number(searchParams.currentMonth) || fallbackPair.currentYear === new Date().getFullYear() ? Math.min(new Date().getMonth() + 1, 12) : 12,
    comparisonMode: (typeof searchParams.mode === "string" ? searchParams.mode : "monthly") as "monthly" | "ytd" | "trend",
  };

  return (
    <AppShell active="/dashboard">
      <DashboardOverviewClient
        kpis={kpis}
        categories={categories}
        entries={allEntries}
        availableYears={availableYears}
        initialState={initialState}
      />
    </AppShell>
  );
}