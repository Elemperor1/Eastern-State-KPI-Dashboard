import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import { AppShell } from "@/components/AppShell";
import { ExecutiveOverview } from "./ExecutiveOverview";
import { loadExecutiveOverviewPageData } from "@/features/reporting/server";
import { resolveStrategicReportingYear } from "@/features/strategy";
import { getActiveInstallation } from "@/features/installation/server";
import { getBoardReportingScope } from "@/features/board-reporting";

export const dynamic = "force-dynamic";

/** Renders the dashboard overview page interface. */
export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");

  const installation = getActiveInstallation();
  const year = resolveStrategicReportingYear(
    Array.isArray(sp.year) ? sp.year[0] : sp.year,
    installation.years,
  );
  const boardAudience = user.role === "board";
  const data = loadExecutiveOverviewPageData({
    year,
    audience: boardAudience ? "board" : "staff",
  });

  return (
    <AppShell user={user} organizationShortName={installation.organization.shortName} planName={installation.plan.name}>
      <ExecutiveOverview
        data={data}
        boardFocus={boardAudience ? getBoardReportingScope().priorities : undefined}
      />
    </AppShell>
  );
}
