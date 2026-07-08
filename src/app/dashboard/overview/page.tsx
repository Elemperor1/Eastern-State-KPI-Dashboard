import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import { AppShell } from "@/components/AppShell";
import { DashboardOverviewClient } from "./DashboardOverviewClient";
import { resolveDashboardCompareState } from "@/features/reporting/period";
import {
  listDashboardYears,
  loadOverviewPageData,
} from "@/features/reporting/server";

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

  const initialState = resolveDashboardCompareState(sp, listDashboardYears());
  const data = loadOverviewPageData({
    throughMonth: initialState.currentMonth,
    year: initialState.currentYear,
  });

  return (
    <AppShell user={user}>
      <DashboardOverviewClient data={data} initialState={initialState} />
    </AppShell>
  );
}
