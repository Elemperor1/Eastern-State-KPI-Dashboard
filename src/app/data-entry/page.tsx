import { redirect } from "next/navigation";
import { StrategicDataEntryClient } from "./_components/StrategicDataEntryClient";
import { AppShell } from "@/components/AppShell";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import { firstSearchParam } from "@/lib/search-params";
import {
  resolveStrategicReportingYear,
  type StrategicDataEntryPageData,
} from "@/features/strategy";
import {
  loadStrategicDataEntryPageData,
} from "@/features/strategy/data-entry-server";
import { getActiveInstallation } from "@/features/installation/server";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  year?: string | string[];
  period?: string | string[];
  kpi?: string | string[];
  saved?: string | string[];
}>;

/** Renders the unified data entry page interface. */
export default async function UnifiedDataEntryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");
  if (user.role !== "admin") redirect("/dashboard/overview");

  const params = await searchParams;
  const installation = getActiveInstallation();
  const reportingYear = resolveStrategicReportingYear(
    firstSearchParam(params.year),
    installation.years,
  );
  const reportingPeriod = firstSearchParam(params.period);
  const rawKpiId = Number(firstSearchParam(params.kpi));
  const requestedKpiId =
    Number.isInteger(rawKpiId) && rawKpiId > 0 ? rawKpiId : null;
  const data: StrategicDataEntryPageData = loadStrategicDataEntryPageData({
    reportingYear,
    reportingPeriod,
    requestedKpiId,
  });

  return (
    <AppShell user={user} organizationShortName={installation.organization.shortName} planName={installation.plan.name}>
      <StrategicDataEntryClient data={data} saved={firstSearchParam(params.saved) === "1"} />
    </AppShell>
  );
}
