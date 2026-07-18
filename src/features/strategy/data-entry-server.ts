import type { MeasurementType, StrategyReportingFrequency } from "./types";
import {
  type StrategicDataEntryBandOption,
  type StrategicDataEntryPageData,
  type StrategicDataEntryRecord,
  type StrategicDataEntrySelectedKpi,
} from "./data-entry-model";
import {
  buildReportingCycleOptions,
  isReportingItemComplete,
  reportingCycleForSelection,
  reportingCycleMatchesFrequency,
  reportingRecordMatchesCycle,
  type ReportingCycleOption,
} from "./reporting-cycle";
import {
  listEffectiveDistributionBands,
  listStrategicGoals,
  listStrategyComponentEntries,
  listStrategyDistributions,
  listStrategyObservations,
} from "./server";
import { getActiveInstallation } from "@/features/installation/server";

type Goal = ReturnType<typeof listStrategicGoals>[number];
type Member = Goal["members"][number];
type Context = { goal: Goal; member: Member };

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
  reportingFrequency: StrategyReportingFrequency,
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

function activeComponents(member: Member) {
  return member.components.filter(
    (component): component is typeof component & { measurement_type: MeasurementType } =>
      component.archived_at === null && component.measurement_type !== null,
  );
}

function needsAttention(member: Member): boolean {
  const configuration = member.configuration;
  return !configuration?.measurement_type ||
    !configuration.reporting_frequency ||
    (configuration.configuration_status !== "active" &&
      configuration.configuration_status !== "ready") ||
    (configuration.measurement_type === "multi_component" &&
      activeComponents(member).length === 0);
}

function loadContextRecords(context: Context, reportingYear: number) {
  const configuration = context.member.configuration;
  if (!configuration?.measurement_type || !configuration.reporting_frequency) {
    return [];
  }
  const measurementType = configuration.measurement_type;
  const reportingFrequency = configuration.reporting_frequency;
  const records: StrategicDataEntryRecord[] = [];
  const components = activeComponents(context.member);
  if (measurementType === "multi_component") {
    for (const component of components) {
      if (component.measurement_type === "distribution") {
        records.push(
          ...listStrategyDistributions({
            kpi_id: context.member.kpi.id,
            component_id: component.id,
            reporting_year: reportingYear,
          }).map((distribution) =>
            distributionRecord(
              distribution,
              component.measurement_type,
              reportingFrequency,
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
  } else if (measurementType === "distribution") {
    records.push(
      ...listStrategyDistributions({
        kpi_id: context.member.kpi.id,
        component_id: null,
        reporting_year: reportingYear,
      }).map((distribution) =>
        distributionRecord(
          distribution,
          measurementType,
          reportingFrequency,
          null,
        ),
      ),
    );
  } else {
    records.push(
      ...listStrategyObservations({
        kpi_id: context.member.kpi.id,
        reporting_year: reportingYear,
      }).map(observationRecord),
    );
  }
  return records;
}

function emptyPageData(
  reportingYear: number,
  years: number[],
  reportingPeriod: ReportingCycleOption,
  reportingPeriods: ReportingCycleOption[],
  message: string,
): StrategicDataEntryPageData {
  return {
    reportingYear,
    years,
    reportingPeriod,
    reportingPeriods,
    showSelectedKpi: false,
    kpis: [],
    selectedKpiId: null,
    selectedKpi: null,
    records: [],
    loadError: message,
  };
}

/** Route-scoped server view model for one Reporting Year and Reporting Period. */
export function loadStrategicDataEntryPageData({
  reportingYear,
  reportingPeriod: requestedPeriod,
  requestedKpiId,
}: {
  reportingYear: number;
  reportingPeriod?: string | null;
  requestedKpiId: number | null;
}): StrategicDataEntryPageData {
  const years = [...getActiveInstallation().years];
  const goals = listStrategicGoals({ year: reportingYear });
  const allContexts = Array.from(
    new Map(
      goals.flatMap((goal) =>
        goal.members.map((member) => [member.kpi.id, { goal, member }] as const),
      ),
    ).values(),
  ).sort((left, right) =>
    left.member.kpi.name.localeCompare(right.member.kpi.name),
  );
  const reportingPeriods = buildReportingCycleOptions(
    allContexts.map(({ member }) => member.configuration?.reporting_frequency ?? null),
    reportingYear,
  );
  const reportingPeriod = reportingCycleForSelection(
    requestedPeriod,
    reportingPeriods,
  );
  const contexts = allContexts.filter(({ member }) =>
    reportingCycleMatchesFrequency(
      member.configuration?.reporting_frequency ?? null,
      reportingPeriod.periodType,
    ),
  );
  const recordCache = new Map<number, StrategicDataEntryRecord[]>();
  const recordsFor = (context: Context) => {
    const cached = recordCache.get(context.member.kpi.id);
    if (cached) return cached;
    const records = loadContextRecords(context, reportingYear);
    recordCache.set(context.member.kpi.id, records);
    return records;
  };

  const kpis = contexts.map(({ goal, member }) => {
    const configuration = member.configuration;
    const attention = needsAttention(member);
    const records = attention ? [] : recordsFor({ goal, member });
    const complete = !attention && configuration?.measurement_type
      ? isReportingItemComplete({
          measurementType: configuration.measurement_type,
          cycle: reportingPeriod,
          records: records.map((record) => ({
            period_type: record.periodType,
            period_index: record.periodIndex,
          })),
          components: activeComponents(member).map((component) => ({
            id: component.id,
            records: records
              .filter((record) => record.componentId === component.id)
              .map((record) => ({
                period_type: record.periodType,
                period_index: record.periodIndex,
              })),
          })),
        })
      : false;
    return {
      id: member.kpi.id,
      name: member.kpi.name,
      priorityName: goal.priority_name,
      goalName: goal.name,
      measurementType: configuration?.measurement_type ?? null,
      reportingFrequency: configuration?.reporting_frequency ?? null,
      configurationStatus: configuration?.configuration_status ?? null,
      checklistStatus: attention
        ? "needs_attention" as const
        : complete
          ? "complete" as const
          : "not_started" as const,
    };
  });

  const requested = contexts.find(({ member }) => member.kpi.id === requestedKpiId);
  const fallback = contexts.find(({ member }) => !needsAttention(member));
  const context = requested ?? fallback ?? contexts[0] ?? null;
  if (!context) {
    return {
      ...emptyPageData(
        reportingYear,
        years,
        reportingPeriod,
        reportingPeriods,
        "No measures are due for this reporting period.",
      ),
      kpis,
    };
  }

  const { goal, member } = context;
  const configuration = member.configuration;
  if (!configuration?.measurement_type || !configuration.reporting_frequency) {
    return {
      reportingYear,
      years,
      reportingPeriod,
      reportingPeriods,
      showSelectedKpi: requested !== undefined,
      kpis,
      selectedKpiId: member.kpi.id,
      selectedKpi: null,
      records: [],
      loadError: "Finish this measure's setup before entering results.",
    };
  }

  const components = activeComponents(member).map((component) => ({
    id: component.id,
    label: component.label,
    measurementType: component.measurement_type,
    unit: component.unit,
    numeratorLabel: component.numerator_label,
    denominatorLabel: component.denominator_label,
    fixedDenominator: component.fixed_denominator,
  }));
  const bands: StrategicDataEntryBandOption[] = [];
  const distributionOwners = configuration.measurement_type === "distribution"
    ? [null]
    : components
        .filter((component) => component.measurementType === "distribution")
        .map((component) => component.id);
  for (const componentId of distributionOwners) {
    bands.push(
      ...listEffectiveDistributionBands({
        kpi_id: member.kpi.id,
        component_id: componentId,
        reporting_year: reportingYear,
      }).map((band) => ({
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
    numeratorLabel: configuration.numerator_label,
    denominatorLabel: configuration.denominator_label,
    measurementType: configuration.measurement_type,
    reportingFrequency: configuration.reporting_frequency,
    configurationStatus: configuration.configuration_status,
    calculationPrecision: configuration.calculation_precision,
    fixedDenominator: configuration.fixed_denominator,
    components,
    bands,
  };
  const records = recordsFor(context)
    .filter((record) =>
      reportingRecordMatchesCycle(
        { period_type: record.periodType, period_index: record.periodIndex },
        reportingPeriod,
      ),
    )
    .sort(
      (left, right) =>
        (left.componentLabel ?? "").localeCompare(right.componentLabel ?? "") ||
        left.id - right.id,
    );

  return {
    reportingYear,
    years,
    reportingPeriod,
    reportingPeriods,
    showSelectedKpi: requested !== undefined,
    kpis,
    selectedKpiId: selectedKpi.id,
    selectedKpi,
    records,
    loadError: null,
  };
}
