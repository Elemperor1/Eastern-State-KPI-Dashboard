import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import {
  STRATEGIC_DATA_ENTRY_YEARS,
  type StrategicDataEntryBandOption,
  type StrategicDataEntryPageData,
  type StrategicDataEntryRecord,
  type StrategicDataEntrySelectedKpi,
} from "@/components/strategic-data-entry-model";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import type { MeasurementType } from "@/features/strategy";
import {
  listEffectiveDistributionBands,
  listStrategicGoals,
  listStrategyComponentEntries,
  listStrategyDistributions,
  listStrategyObservations,
} from "@/features/strategy/server";
import { StrategicDataEntryClient } from "./StrategicDataEntryClient";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  year?: string | string[];
  kpi?: string | string[];
}>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function selectedReportingYear(value: string | undefined): number {
  const parsed = Number(value);
  return STRATEGIC_DATA_ENTRY_YEARS.includes(
    parsed as (typeof STRATEGIC_DATA_ENTRY_YEARS)[number],
  )
    ? parsed
    : Math.max(2025, Math.min(new Date().getFullYear(), 2029));
}

function observationRecord(
  observation: ReturnType<typeof listStrategyObservations>[number],
): StrategicDataEntryRecord {
  return {
    id: observation.id,
    kind: "observation",
    kpiId: observation.kpi_id,
    componentId: null,
    componentLabel: null,
    measurementType: observation.measurement_type,
    reportingFrequency: observation.reporting_frequency,
    year: observation.year,
    periodType: observation.period_type,
    periodIndex: observation.period_index,
    scalarValue: observation.scalar_value,
    numerator: observation.numerator,
    denominator: observation.denominator,
    respondentCount: observation.respondent_count,
    averageMethod: observation.average_method,
    totalScore: observation.total_score,
    averageScore: observation.average_score,
    maxScorePerRespondent: observation.max_score_per_respondent,
    totalPossibleScore: observation.total_possible_score,
    positiveResponseCount: observation.positive_response_count,
    totalResponseCount: observation.total_response_count,
    booleanValue: observation.boolean_value,
    milestoneValue: observation.milestone_value,
    mutuallyExclusive: null,
    notes: observation.notes,
    sourceReference: observation.source_reference,
    bands: [],
  };
}

function componentEntryRecord(
  entry: ReturnType<typeof listStrategyComponentEntries>[number],
  componentLabel: string,
): StrategicDataEntryRecord {
  return {
    ...observationRecord({ ...entry, id: entry.id }),
    kind: "component_entry",
    componentId: entry.component_id,
    componentLabel,
  };
}

function distributionRecord(
  distribution: ReturnType<typeof listStrategyDistributions>[number],
  measurementType: MeasurementType,
  reportingFrequency: StrategicDataEntrySelectedKpi["reportingFrequency"],
  componentLabel: string | null,
): StrategicDataEntryRecord {
  return {
    id: distribution.id,
    kind: "distribution",
    kpiId: distribution.kpi_id,
    componentId: distribution.component_id,
    componentLabel,
    measurementType,
    reportingFrequency,
    year: distribution.year,
    periodType: distribution.period_type,
    periodIndex: distribution.period_index,
    scalarValue: null,
    numerator: null,
    denominator: null,
    respondentCount: distribution.respondent_count,
    averageMethod: null,
    totalScore: null,
    averageScore: null,
    maxScorePerRespondent: null,
    totalPossibleScore: null,
    positiveResponseCount: null,
    totalResponseCount: null,
    booleanValue: null,
    milestoneValue: null,
    mutuallyExclusive: distribution.mutually_exclusive,
    notes: distribution.notes,
    sourceReference: distribution.source_reference,
    bands: distribution.bands.map((band) => ({
      bandId: band.band_id,
      slug: band.slug,
      currentLabel: band.current_label,
      labelSnapshot: band.label_snapshot,
      count: band.count,
      displayOrder: band.display_order,
      isUnknown: band.is_unknown,
      isDeclined: band.is_declined,
      derivedGroup: band.derived_group,
    })),
  };
}

function emptyPageData(
  reportingYear: number,
  message: string,
): StrategicDataEntryPageData {
  return {
    reportingYear,
    years: [...STRATEGIC_DATA_ENTRY_YEARS],
    kpis: [],
    selectedKpiId: null,
    selectedKpi: null,
    records: [],
    loadError: message,
  };
}

function loadPageData(
  reportingYear: number,
  requestedKpiId: number | null,
): StrategicDataEntryPageData {
  const goals = listStrategicGoals({ year: reportingYear });
  const memberContexts = goals.flatMap((goal) =>
    goal.members.map((member) => ({ goal, member })),
  );
  const uniqueContexts = Array.from(
    new Map(
      memberContexts.map((context) => [context.member.kpi.id, context]),
    ).values(),
  ).sort((left, right) =>
    left.member.kpi.name.localeCompare(right.member.kpi.name),
  );
  const kpis = uniqueContexts.map(({ goal, member }) => ({
    id: member.kpi.id,
    name: member.kpi.name,
    priorityName: goal.priority_name,
    goalName: goal.name,
    measurementType: member.configuration?.measurement_type ?? null,
    reportingFrequency: member.configuration?.reporting_frequency ?? null,
    configurationStatus: member.configuration?.configuration_status ?? null,
  }));
  const requested = uniqueContexts.find(
    ({ member }) => member.kpi.id === requestedKpiId,
  );
  const fallback = uniqueContexts.find(
    ({ member }) =>
      member.configuration?.measurement_type !== null &&
      member.configuration?.reporting_frequency !== null,
  );
  const context = requested ?? fallback ?? uniqueContexts[0] ?? null;
  if (!context) {
    return {
      ...emptyPageData(
        reportingYear,
        "No strategic KPIs are available for the selected reporting year.",
      ),
      kpis,
    };
  }
  const { goal, member } = context;
  const configuration = member.configuration;
  if (
    configuration?.measurement_type === null ||
    configuration?.measurement_type === undefined ||
    configuration.reporting_frequency === null
  ) {
    return {
      reportingYear,
      years: [...STRATEGIC_DATA_ENTRY_YEARS],
      kpis,
      selectedKpiId: member.kpi.id,
      selectedKpi: null,
      records: [],
      loadError:
        "This KPI needs a measurement type and reporting frequency before values can be entered.",
    };
  }

  const components = member.components
    .filter(
      (component): component is typeof component & { measurement_type: MeasurementType } =>
        component.archived_at === null && component.measurement_type !== null,
    )
    .map((component) => ({
      id: component.id,
      label: component.label,
      measurementType: component.measurement_type,
      unit: component.unit,
      fixedDenominator: component.fixed_denominator,
    }));
  const bands: StrategicDataEntryBandOption[] = [];
  const distributionOwners =
    configuration.measurement_type === "distribution"
      ? [null]
      : components
          .filter((component) => component.measurementType === "distribution")
          .map((component) => component.id);
  for (const componentId of distributionOwners) {
    const definitions = listEffectiveDistributionBands({
      kpi_id: member.kpi.id,
      component_id: componentId,
      reporting_year: reportingYear,
    });
    bands.push(
      ...definitions.map((band) => ({
        id: band.id,
        componentId: band.component_id,
        slug: band.slug,
        label: band.label,
        displayOrder: band.display_order,
        isUnknown: band.is_unknown,
        isDeclined: band.is_declined,
        derivedGroup: band.derived_group,
      })),
    );
  }

  const selectedKpi: StrategicDataEntrySelectedKpi = {
    id: member.kpi.id,
    slug: member.kpi.slug,
    name: member.kpi.name,
    priorityName: goal.priority_name,
    goalName: goal.name,
    unit: configuration.unit ?? member.kpi.unit,
    measurementType: configuration.measurement_type,
    reportingFrequency: configuration.reporting_frequency,
    configurationStatus: configuration.configuration_status,
    calculationPrecision: configuration.calculation_precision,
    fixedDenominator: configuration.fixed_denominator,
    components,
    bands,
  };

  const records: StrategicDataEntryRecord[] = [];
  if (configuration.measurement_type === "multi_component") {
    for (const component of components) {
      if (component.measurementType === "distribution") {
        records.push(
          ...listStrategyDistributions({
            kpi_id: member.kpi.id,
            component_id: component.id,
            reporting_year: reportingYear,
          }).map((distribution) =>
            distributionRecord(
              distribution,
              component.measurementType,
              configuration.reporting_frequency!,
              component.label,
            ),
          ),
        );
      } else {
        records.push(
          ...listStrategyComponentEntries({
            component_id: component.id,
            reporting_year: reportingYear,
          }).map((entry) => componentEntryRecord(entry, component.label)),
        );
      }
    }
  } else if (configuration.measurement_type === "distribution") {
    records.push(
      ...listStrategyDistributions({
        kpi_id: member.kpi.id,
        component_id: null,
        reporting_year: reportingYear,
      }).map((distribution) =>
        distributionRecord(
          distribution,
          configuration.measurement_type!,
          configuration.reporting_frequency!,
          null,
        ),
      ),
    );
  } else {
    records.push(
      ...listStrategyObservations({
        kpi_id: member.kpi.id,
        reporting_year: reportingYear,
      }).map(observationRecord),
    );
  }
  records.sort(
    (left, right) =>
      left.periodIndex - right.periodIndex ||
      (left.componentLabel ?? "").localeCompare(right.componentLabel ?? "") ||
      left.id - right.id,
  );

  return {
    reportingYear,
    years: [...STRATEGIC_DATA_ENTRY_YEARS],
    kpis,
    selectedKpiId: selectedKpi.id,
    selectedKpi,
    records,
    loadError: null,
  };
}

export default async function StrategicDataEntryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");
  if (user.role !== "admin") redirect("/dashboard/overview");

  const params = await searchParams;
  const reportingYear = selectedReportingYear(firstParam(params.year));
  const rawKpiId = Number(firstParam(params.kpi));
  const requestedKpiId =
    Number.isInteger(rawKpiId) && rawKpiId > 0 ? rawKpiId : null;
  let data: StrategicDataEntryPageData;
  try {
    data = loadPageData(reportingYear, requestedKpiId);
  } catch (error) {
    console.error("[strategy-data] Failed to load the data-entry read model", error);
    data = emptyPageData(
      reportingYear,
      "Strategic data entry could not be loaded. No values were changed.",
    );
  }

  return (
    <AppShell user={user}>
      <StrategicDataEntryClient data={data} />
    </AppShell>
  );
}
