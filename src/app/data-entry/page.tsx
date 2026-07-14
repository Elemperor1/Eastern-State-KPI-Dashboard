import { redirect } from "next/navigation";
import { StrategicDataEntryClient } from "./_components/StrategicDataEntryClient";
import { AppShell } from "@/components/AppShell";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import { firstSearchParam } from "@/lib/search-params";
import {
  STRATEGIC_DATA_ENTRY_YEARS,
  type StrategicDataEntryPageData,
} from "@/features/strategy";
import {
  dataEntryLoadFailure,
  loadStrategicDataEntryPageData,
} from "@/features/strategy/data-entry-server";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  year?: string | string[];
  period?: string | string[];
  kpi?: string | string[];
  saved?: string | string[];
}>;

function selectedReportingYear(value: string | undefined): number {
  const parsed = Number(value);
  return STRATEGIC_DATA_ENTRY_YEARS.includes(
    parsed as (typeof STRATEGIC_DATA_ENTRY_YEARS)[number],
  )
    ? parsed
    : Math.max(2025, Math.min(new Date().getFullYear(), 2029));
}

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
  const reportingYear = selectedReportingYear(firstSearchParam(params.year));
  const reportingPeriod = firstSearchParam(params.period);
  const rawKpiId = Number(firstSearchParam(params.kpi));
  const requestedKpiId =
    Number.isInteger(rawKpiId) && rawKpiId > 0 ? rawKpiId : null;
  let data: StrategicDataEntryPageData;
  try {
    data = loadStrategicDataEntryPageData({
      reportingYear,
      reportingPeriod,
      requestedKpiId,
    });
  } catch (error) {
    console.error("[data-entry] Failed to load the reporting checklist", error);
    data = dataEntryLoadFailure(reportingYear, reportingPeriod);
  }

  return (
    <AppShell user={user}>
      <StrategicDataEntryClient data={data} saved={firstSearchParam(params.saved) === "1"} />
    </AppShell>
  );
}
