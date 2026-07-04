import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { DashboardOverviewClient } from "./DashboardOverviewClient";
import { loadDashboardData } from "@/lib/dashboard-data";
import { defaultComparisonPair } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");

  const data = loadDashboardData();
  const fallbackPair = defaultComparisonPair(data.years);

  function parseThroughMonth(raw: string | string[] | undefined, fallbackYear: number): number {
    const parsed = Number(Array.isArray(raw) ? raw[0] : raw);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 12) return Math.round(parsed);
    const now = new Date();
    return fallbackYear === now.getFullYear() ? Math.min(now.getMonth() + 1, 12) : 12;
  }

  const initialState = {
    currentYear: Number(sp.currentYear) || fallbackPair.currentYear,
    compareYear: Number(sp.compareYear) || fallbackPair.compareYear,
    currentMonth: parseThroughMonth(sp.currentMonth, fallbackPair.currentYear),
  };

  return (
    <AppShell user={user}>
      <DashboardOverviewClient data={data} initialState={initialState} />
    </AppShell>
  );
}
