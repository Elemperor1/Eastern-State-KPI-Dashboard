import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { MetricDetailClient, type GoalDisplayMode } from "./MetricDetailClient";
import { loadDashboardData } from "@/lib/dashboard-data";
import { getKPIBySlug, listEntries, listBreakdowns } from "@/lib/repository";
import { defaultComparisonPair } from "@/lib/analytics";

export const dynamic = "force-dynamic";

function parseThroughMonth(raw: string | string[] | undefined, fallbackYear: number): number {
  const parsed = Number(Array.isArray(raw) ? raw[0] : raw);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 12) return Math.round(parsed);
  const now = new Date();
  return fallbackYear === now.getFullYear() ? Math.min(now.getMonth() + 1, 12) : 12;
}

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

  const kpi = getKPIBySlug(slug);
  if (!kpi) redirect("/dashboard/overview");

  const urlYear = Number(sp.currentYear);
  const hasUrlYear = Number.isFinite(urlYear) && urlYear > 0;
  const years = Array.from(
    new Set([
      ...listEntries().map((e) => e.year),
      ...listBreakdowns().map((b) => b.year),
    ]),
  ).sort((a, b) => a - b);
  const fallbackPair = defaultComparisonPair(years);

  const currentYear = hasUrlYear ? urlYear : fallbackPair.currentYear;
  const compareYear = Number(sp.compareYear) || fallbackPair.compareYear;
  const currentMonth = parseThroughMonth(sp.currentMonth, currentYear);

  // Parse optional goal display mode. Default is "both".
  const rawGoalDisplay = Array.isArray(sp.goalDisplay) ? sp.goalDisplay[0] : sp.goalDisplay;
  const goalDisplay: GoalDisplayMode | undefined =
    rawGoalDisplay === "compare" || rawGoalDisplay === "goal" || rawGoalDisplay === "both"
      ? (rawGoalDisplay as GoalDisplayMode)
      : undefined;

  const data = loadDashboardData({ throughMonth: currentMonth, year: currentYear });

  const initialState = {
    currentYear,
    compareYear,
    currentMonth,
  };

  return (
    <AppShell user={user}>
      <MetricDetailClient
        data={data}
        kpiSlug={slug}
        initialState={initialState}
        initialGoalDisplay={goalDisplay}
      />
    </AppShell>
  );
}