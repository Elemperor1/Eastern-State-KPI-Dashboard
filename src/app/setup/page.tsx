import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader } from "@/components/ui";
import { HistoryClient } from "./_components/HistoryClient";
import { KPIManagerClient } from "./_components/KPIManagerClient";
import { StrategicKpiEditorClient } from "./_components/StrategicKpiEditorClient";
import { StrategicGoalsEditorClient } from "./_components/StrategicGoalsEditorClient";
import { UserManagerClient } from "./_components/UserManagerClient";
import { PlanSettingsClient } from "./_components/PlanSettingsClient";
import type { StrategicGoalEditorRecord } from "@/components/strategic-goal-editor-model";
import type { StrategicKpiEditorData } from "@/components/strategic-kpi-editor-model";
import {
  listDeletedHistoryCategories,
  listDeletedHistoryKpis,
  listEntryHistory,
  listEntryHistoryYears,
  listSetupAuditEvents,
} from "@/features/audit/server";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import { getKPI, listCategories, listKPIs } from "@/features/catalog/server";
import { resolveStrategicReportingYear } from "@/features/strategy";
import { getActiveInstallation } from "@/features/installation/server";
import {
  listComponentsForConfiguration,
  listConfigurationGaps,
  listEffectiveDistributionBands,
  listEffectiveMeasurementConfigs,
  listEffectiveTargetsForKpi,
  listStrategicGoals,
} from "@/features/strategy/server";
import { listUsers } from "@/features/users/server";
import type { Category, KPIWithCategory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { firstSearchParam } from "@/lib/search-params";

export const dynamic = "force-dynamic";

type SetupArea = "measures" | "goals" | "people" | "activity";
type Params = Record<string, string | string[] | undefined>;

/** Implements the setup area operation. */
function setupArea(value: string | undefined): SetupArea {
  return value === "goals" || value === "people" || value === "activity"
    ? value
    : "measures";
}

const AREAS: Array<{ value: SetupArea; label: string }> = [
  { value: "measures", label: "Measures" },
  { value: "goals", label: "Goals" },
  { value: "people", label: "People" },
  { value: "activity", label: "Activity" },
];

/** Renders the setup page interface. */
export default async function SetupPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");
  if (user.role !== "admin") redirect("/dashboard/overview");

  const params = await searchParams;
  const area = setupArea(firstSearchParam(params.area));
  const installation = getActiveInstallation();
  const year = resolveStrategicReportingYear(
    firstSearchParam(params.year),
    installation.years,
  );

  return (
    <AppShell user={user} organizationShortName={installation.organization.shortName} planName={installation.plan.name}>
      <div className="page-content page-content-wide page-enter">
        <PageHeader title="Setup" />
        <nav aria-label="Setup areas" className="mb-8 flex gap-1 overflow-x-auto border-b border-ink-200">
          {AREAS.map((item) => (
            <Link
              key={item.value}
              href={`/setup?area=${item.value}`}
              aria-current={area === item.value ? "page" : undefined}
              className={cn(
                "min-h-11 shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]",
                area === item.value
                  ? "border-brand-600 text-brand-800"
                  : "border-transparent text-ink-600 hover:text-ink-950",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {area === "measures" ? <MeasuresArea params={params} year={year} /> : null}
        {area === "goals" ? <GoalsArea params={params} year={year} /> : null}
        {area === "people" ? (
          <UserManagerClient currentUserId={user.id} users={listUsers()} />
        ) : null}
        {area === "activity" ? <ActivityArea params={params} /> : null}
      </div>
    </AppShell>
  );
}

/** Renders the measures area interface. */
function MeasuresArea({ params, year }: { params: Params; year: number }) {
  const itemId = Number(firstSearchParam(params.item));
  const focusId = Number(firstSearchParam(params.focus));
  const editorData = Number.isInteger(itemId) && itemId > 0
    ? loadKpiEditorData(itemId, year)
    : null;
  const attentionOnly = firstSearchParam(params.filter) === "needs-attention";
  const allKpis = listKPIs({ includeInactive: true, includeArchived: true });
  const attentionIds = new Set(
    listConfigurationGaps({ year }).map((row) => row.kpi.id),
  );
  const visibleKpis = attentionOnly
    ? allKpis.filter((kpi) => attentionIds.has(kpi.id))
    : allKpis;
  const goalOptions = listStrategicGoals({ year }).map((goal) => ({
    id: goal.id,
    name: goal.name,
    priorityName: goal.priority_name,
  }));

  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className={editorData ? "hidden min-w-0 lg:block" : "min-w-0"} aria-label="Measure list">
        <div className="mb-4 flex gap-4 border-b border-ink-200">
          <Link
            href={`/setup?area=measures&year=${year}`}
            aria-current={!attentionOnly ? "page" : undefined}
            className={cn("min-h-11 border-b-2 py-3 text-sm font-semibold", !attentionOnly ? "border-brand-600 text-brand-800" : "border-transparent text-ink-600")}
          >
            All
          </Link>
          <Link
            href={`/setup?area=measures&filter=needs-attention&year=${year}`}
            aria-current={attentionOnly ? "page" : undefined}
            className={cn("min-h-11 border-b-2 py-3 text-sm font-semibold", attentionOnly ? "border-brand-600 text-brand-800" : "border-transparent text-ink-600")}
          >
            Needs attention ({attentionIds.size})
          </Link>
        </div>
        <KPIManagerClient
          kpis={visibleKpis}
          goals={goalOptions}
          selectedKpiId={editorData?.kpi.id ?? null}
          focusKpiId={Number.isInteger(focusId) && focusId > 0 ? focusId : null}
          reportingYear={year}
        />
      </aside>

      <section className={editorData ? "min-w-0" : "hidden min-w-0 lg:block"} aria-label="Measure details">
        {editorData ? (
          <StrategicKpiEditorClient data={editorData} />
        ) : (
          <EmptyState title="Choose a measure" description="Select a measure from the list to review or edit it." />
        )}
      </section>
    </div>
  );
}

/** Renders the goals area interface. */
function GoalsArea({ params, year }: { params: Params; year: number }) {
  const installation = getActiveInstallation();
  const goals = listStrategicGoals({ year, includeArchived: true });
  const initialGoals: StrategicGoalEditorRecord[] = goals.map((goal) => ({
    ...goal,
    members: goal.members.map((member) => ({
      id: member.id,
      name: member.kpi.name,
      role: member.role,
      weight: member.weight,
      displayOrder: member.display_order,
      effectiveFromYear: member.effective_from_year,
      effectiveToYear: member.effective_to_year,
      configurationStatus: member.configuration?.configuration_status ?? null,
    })),
  }));
  const requestedGoalId = Number(firstSearchParam(params.goal));
  const requestedGoal = goals.find((goal) => goal.id === requestedGoalId) ?? null;
  const targetData = requestedGoal
    ? requestedGoal.members
        .map((member) => loadKpiEditorData(member.kpi_id, year))
        .filter((item): item is StrategicKpiEditorData => item !== null)
    : [];
  return (
    <>
      <PlanSettingsClient installation={installation} />
      <StrategicGoalsEditorClient
        initialGoals={initialGoals}
        initialSelectedGoalId={initialGoals.some((goal) => goal.id === requestedGoalId) ? requestedGoalId : null}
        reportingYear={year}
        planYears={[...installation.years]}
        targetData={targetData}
      />
    </>
  );
}

/** Renders the activity area interface. */
function ActivityArea({ params }: { params: Params }) {
  const requestedPage = Number(firstSearchParam(params.page));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;
  const pageSize = 50;
  const offset = (page - 1) * pageSize;
  const filter: Parameters<typeof listEntryHistory>[0] = {};
  if (firstSearchParam(params.kpi_id)) filter.kpi_id = Number(firstSearchParam(params.kpi_id));
  if (firstSearchParam(params.category_id)) filter.category_id = Number(firstSearchParam(params.category_id));
  if (firstSearchParam(params.year)) filter.year = Number(firstSearchParam(params.year));
  const categories: Category[] = [
    ...listCategories(),
    ...listDeletedHistoryCategories(),
  ];
  const kpis: KPIWithCategory[] = [
    ...listKPIs({ includeInactive: true }),
    ...listDeletedHistoryKpis(),
  ];
  const historyPage = listEntryHistory({
    ...filter,
    limit: pageSize + 1,
    offset,
  });
  const setupPage = listSetupAuditEvents({
    limit: pageSize + 1,
    offset,
  });
  return (
    <HistoryClient
      history={historyPage.slice(0, pageSize)}
      categories={categories}
      kpis={kpis}
      activeFilter={filter}
      setupEvents={setupPage.slice(0, pageSize)}
      availableYears={listEntryHistoryYears()}
      page={page}
      hasOlder={historyPage.length > pageSize || setupPage.length > pageSize}
    />
  );
}

/** Retrieves kpi editor data. */
function loadKpiEditorData(kpiId: number, reportingYear: number): StrategicKpiEditorData | null {
  const catalogKpi = getKPI(kpiId, { includeArchived: true });
  if (!catalogKpi) return null;
  const goals = listStrategicGoals({ year: reportingYear, includeArchived: true });
  const memberships = goals.flatMap((goal) =>
    goal.members
      .filter((member) => member.kpi.id === kpiId)
      .map((member) => ({ goal, member })),
  );
  const member = memberships[0]?.member ?? null;
  const configuration = member?.configuration ??
    listEffectiveMeasurementConfigs(reportingYear, { includeArchived: true })
      .find((candidate) => candidate.kpi_id === kpiId) ?? null;
  const targets = listEffectiveTargetsForKpi(kpiId, reportingYear, { includeArchived: true });
  const components = configuration
    ? listComponentsForConfiguration(configuration.id, reportingYear, { includeArchived: true })
    : [];
  const distributionOwners: Array<number | null> =
    configuration?.measurement_type === "distribution" && configuration.archived_at === null
      ? [null]
      : configuration?.measurement_type === "multi_component"
        ? components
            .filter((component) => component.archived_at === null && component.measurement_type === "distribution")
            .map((component) => component.id)
        : [];
  const bands = distributionOwners.flatMap((componentId) =>
    listEffectiveDistributionBands({
      kpi_id: kpiId,
      component_id: componentId,
      reporting_year: reportingYear,
      include_archived: true,
    }),
  );
  return {
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
    planYears: [...getActiveInstallation().years],
  };
}
