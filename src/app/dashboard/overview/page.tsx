import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import { AppShell } from "@/components/AppShell";
import { ExecutiveOverview } from "./ExecutiveOverview";
import { loadExecutiveOverviewPageData } from "@/features/reporting/server";
import { resolveStrategicReportingYear } from "@/features/strategy";

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

  const year = resolveStrategicReportingYear(
    Array.isArray(sp.year) ? sp.year[0] : sp.year,
  );
  const data = loadExecutiveOverviewPageData({ year });

  return (
    <AppShell user={user}>
      <ExecutiveOverview data={data} />
    </AppShell>
  );
}
