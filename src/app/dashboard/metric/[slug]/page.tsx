import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import { AppShell } from "@/components/AppShell";
import { MetricDetailClient, type GoalDisplayMode } from "./MetricDetailClient";
import { getKPIBySlug } from "@/features/catalog/server";
import { resolveDashboardCompareState } from "@/features/reporting/period";
import {
  listDashboardYears,
  loadDashboardData,
} from "@/features/reporting/server";

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

  const kpi = getKPIBySlug(slug);
  if (!kpi) redirect("/dashboard/overview");

  const initialState = resolveDashboardCompareState(sp, listDashboardYears());

  // Parse optional goal display mode. Default is "both".
  const rawGoalDisplay = Array.isArray(sp.goalDisplay) ? sp.goalDisplay[0] : sp.goalDisplay;
  const goalDisplay: GoalDisplayMode | undefined =
    rawGoalDisplay === "compare" || rawGoalDisplay === "goal" || rawGoalDisplay === "both"
      ? (rawGoalDisplay as GoalDisplayMode)
      : undefined;

  const data = loadDashboardData({
    throughMonth: initialState.currentMonth,
    year: initialState.currentYear,
  });

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
