import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import type { StrategicKpiEditorData } from "@/components/strategic-kpi-editor-model";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import { getKPI } from "@/features/catalog/server";
import { STRATEGIC_PLAN_REPORTING_YEARS } from "@/features/strategy";
import {
  listComponentsForConfiguration,
  listEffectiveDistributionBands,
  listEffectiveMeasurementConfigs,
  listEffectiveTargetsForKpi,
  listStrategicGoals,
} from "@/features/strategy/server";
import { StrategicKpiEditorClient } from "./StrategicKpiEditorClient";

export const dynamic = "force-dynamic";

export default async function StrategicKpiEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");
  if (user.role !== "admin") redirect("/dashboard/overview");

  const { id: rawId } = await params;
  const kpiId = Number(rawId);
  if (!Number.isInteger(kpiId) || kpiId < 1) redirect("/admin/kpis");
  const catalogKpi = getKPI(kpiId);
  if (!catalogKpi) redirect("/admin/kpis");

  const requestedYear = Number((await searchParams).year);
  const defaultYear = Math.max(
    2025,
    Math.min(new Date().getFullYear(), 2029),
  );
  const reportingYear =
    STRATEGIC_PLAN_REPORTING_YEARS.find((year) => year === requestedYear) ??
    defaultYear;
  const goals = listStrategicGoals({
    year: reportingYear,
    includeArchived: true,
  });
  const memberships = goals.flatMap((goal) =>
    goal.members
      .filter((member) => member.kpi.id === kpiId)
      .map((member) => ({ goal, member })),
  );
  const member = memberships[0]?.member ?? null;
  const configuration =
    member?.configuration ??
    listEffectiveMeasurementConfigs(reportingYear, {
      includeArchived: true,
    }).find((candidate) => candidate.kpi_id === kpiId) ??
    null;
  const targets = listEffectiveTargetsForKpi(kpiId, reportingYear, {
    includeArchived: true,
  });
  const components = configuration
    ? listComponentsForConfiguration(configuration.id, reportingYear, {
        includeArchived: true,
      })
    : [];
  const distributionComponentIds = components
    .filter(
      (component) =>
        component.archived_at === null &&
        component.measurement_type === "distribution",
    )
    .map((component) => component.id);
  const distributionOwners: Array<number | null> =
    configuration?.measurement_type === "distribution" &&
    configuration.archived_at === null
      ? [null]
      : configuration?.measurement_type === "multi_component"
        ? distributionComponentIds
        : [];
  const bands = distributionOwners.flatMap((componentId) =>
    listEffectiveDistributionBands({
      kpi_id: kpiId,
      component_id: componentId,
      reporting_year: reportingYear,
      include_archived: true,
    }),
  );

  const data: StrategicKpiEditorData = {
    kpi: member?.kpi ?? {
      id: catalogKpi.id,
      slug: catalogKpi.slug,
      name: catalogKpi.name,
      unit: catalogKpi.unit,
      category_id: catalogKpi.category_id,
      category_slug: catalogKpi.category_slug,
      category_name: catalogKpi.category_name,
    },
    goalContexts: memberships.map(({ goal }) => ({
      id: goal.id,
      name: goal.name,
      priorityName: goal.priority_name,
    })),
    configuration,
    targets,
    components,
    distributionBands: bands.map((band) => ({
      id: band.id,
      kpiId: band.kpi_id,
      componentId: band.component_id,
      slug: band.slug,
      label: band.label,
      effectiveFromYear: band.effective_from_year,
      effectiveToYear: band.effective_to_year,
      displayOrder: band.display_order,
      isUnknown: band.is_unknown,
      isDeclined: band.is_declined,
      derivedGroup: band.derived_group,
      archivedAt: band.archived_at,
    })),
    reportingYear,
  };

  return (
    <AppShell user={user}>
      <StrategicKpiEditorClient data={data} />
    </AppShell>
  );
}
