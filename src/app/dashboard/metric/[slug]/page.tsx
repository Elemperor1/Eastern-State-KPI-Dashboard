import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { MetricDetailClient } from "./MetricDetailClient";
import { loadDashboardData } from "@/lib/dashboard-data";
import { getKPIBySlug } from "@/lib/repository";
import { defaultComparisonPair } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export default async function MetricDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");

  const data = loadDashboardData();
  const kpi = getKPIBySlug(slug);
  if (!kpi) redirect("/dashboard/overview");

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
      <MetricDetailClient data={data} kpiSlug={slug} initialState={initialState} />
    </AppShell>
  );
}
