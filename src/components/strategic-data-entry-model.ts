import {
  strategyPeriods,
  type AverageInputMethod,
  type MeasurementType,
  type ReportingCycleOption,
  type StrategyReportingFrequency,
} from "@/features/strategy";
import type {
  StrategicDataEntryBandOption,
  StrategicDataEntryComponentOption,
  StrategicDataEntryRecord,
  StrategicDataEntrySelectedKpi,
} from "@/features/strategy/data-entry-model";

export {
  type StrategicDataEntryBandOption,
  type StrategicDataEntryComponentOption,
  type StrategicDataEntryPageData,
  type StrategicDataEntryRecord,
  type StrategicDataEntrySelectedKpi,
} from "@/features/strategy/data-entry-model";

export interface StrategicDataEntryDraft {
  componentId: string;
  flexibleMode: "monthly" | "annual";
  periodIndex: string;
  value: string;
  binaryValue: "" | "0" | "1";
  numerator: string;
  denominator: string;
  averageMethod: AverageInputMethod;
  respondentCount: string;
  totalScore: string;
  averageScore: string;
  maxScorePerRespondent: string;
  totalPossibleScore: string;
  positiveResponseCount: string;
  totalResponseCount: string;
  mutuallyExclusive: boolean;
  bandCounts: Record<string, string>;
  notes: string;
  sourceReference: string;
}

export type StrategicDataEntryDrafts = Record<string, StrategicDataEntryDraft>;

export const PRIMARY_DATA_ENTRY_DRAFT = "primary";

export type StrategicDataEntryErrors = Record<string, string>;

export interface StrategicDataEntryMutation {
  endpoint:
    | "/api/strategy/observations"
    | "/api/strategy/component-entries"
    | "/api/strategy/distributions";
  body: Record<string, unknown>;
}

export interface StrategicDataEntryRequest {
  endpoint: StrategicDataEntryMutation["endpoint"];
  body: Record<string, unknown>;
}

export type StrategicDataEntryBuildResult =
  | {
      ok: true;
      mutation: StrategicDataEntryMutation;
      errors: Record<string, never>;
    }
  | { ok: false; mutation: null; errors: StrategicDataEntryErrors };

/**
 * Multi-component measures must cross the HTTP boundary as one request so the
 * server can commit every related input in a single transaction.
 */
export function buildStrategicDataEntryRequests(
  mutations: StrategicDataEntryMutation[],
): StrategicDataEntryRequest[] {
  if (
    mutations.length > 1 &&
    mutations.every(
      (mutation) =>
        mutation.endpoint === "/api/strategy/component-entries" ||
        mutation.endpoint === "/api/strategy/distributions",
    )
  ) {
    return [
      {
        endpoint: "/api/strategy/observations",
        body: {
          submission_type: "multi_input",
          writes: mutations.map((mutation) => ({
            kind:
              mutation.endpoint === "/api/strategy/distributions"
                ? "distribution"
                : "component_entry",
            input: mutation.body,
          })),
        },
      },
    ];
  }
  return mutations;
}

export function displayStrategyLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (first) => first.toLocaleUpperCase());
}

function configuredFrequency(
  selectedKpi: StrategicDataEntrySelectedKpi,
  draft: StrategicDataEntryDraft,
): Exclude<StrategyReportingFrequency, "flexible"> {
  return selectedKpi.reportingFrequency === "flexible"
    ? draft.flexibleMode
    : selectedKpi.reportingFrequency;
}

export function selectedEntryComponent(
  selectedKpi: StrategicDataEntrySelectedKpi,
  draft: StrategicDataEntryDraft,
): StrategicDataEntryComponentOption | null {
  if (selectedKpi.measurementType !== "multi_component") return null;
  const id = Number(draft.componentId);
  return selectedKpi.components.find((component) => component.id === id) ?? null;
}

export function selectedEntryMeasurementType(
  selectedKpi: StrategicDataEntrySelectedKpi,
  draft: StrategicDataEntryDraft,
): MeasurementType {
  return selectedEntryComponent(selectedKpi, draft)?.measurementType ??
    selectedKpi.measurementType;
}

export function selectedEntryUnit(
  selectedKpi: StrategicDataEntrySelectedKpi,
  draft: StrategicDataEntryDraft,
): string | null {
  return selectedEntryComponent(selectedKpi, draft)?.unit ?? selectedKpi.unit;
}

export function activeBandsForDraft(
  selectedKpi: StrategicDataEntrySelectedKpi,
  draft: StrategicDataEntryDraft,
): StrategicDataEntryBandOption[] {
  const component = selectedEntryComponent(selectedKpi, draft);
  return selectedKpi.bands
    .filter((band) => band.componentId === (component?.id ?? null))
    .sort((left, right) => left.displayOrder - right.displayOrder || left.id - right.id);
}

export function entryPeriodOptions(
  selectedKpi: StrategicDataEntrySelectedKpi,
  draft: StrategicDataEntryDraft,
  reportingYear: number,
) {
  const definition =
    selectedKpi.reportingFrequency === "flexible"
      ? {
          reportingFrequency: "flexible" as const,
          flexibleMode: draft.flexibleMode,
        }
      : { reportingFrequency: selectedKpi.reportingFrequency };
  return strategyPeriods.allowedReportingPeriodOptions(definition, reportingYear);
}

export function emptyStrategicDataEntryDraft(
  selectedKpi: StrategicDataEntrySelectedKpi,
  reportingYear: number,
  now: Date = new Date(),
): StrategicDataEntryDraft {
  const flexibleMode: "monthly" | "annual" = "monthly";
  const period = strategyPeriods.defaultReportingPeriod(
    selectedKpi.reportingFrequency === "flexible"
      ? {
          reportingFrequency: "flexible",
          flexibleMode,
          reportingYear,
        }
      : {
          reportingFrequency: selectedKpi.reportingFrequency,
          reportingYear,
        },
    now,
  );
  const componentId = selectedKpi.components[0]?.id ?? null;
  return {
    componentId: componentId === null ? "" : String(componentId),
    flexibleMode,
    periodIndex: String(period.periodIndex),
    value: "",
    binaryValue: "",
    numerator: "",
    denominator: "",
    averageMethod: "total_score",
    respondentCount: "",
    totalScore: "",
    averageScore: "",
    maxScorePerRespondent: "",
    totalPossibleScore: "",
    positiveResponseCount: "",
    totalResponseCount: "",
    mutuallyExclusive: true,
    bandCounts: Object.fromEntries(
      selectedKpi.bands.map((band) => [String(band.id), ""]),
    ),
    notes: "",
    sourceReference: "",
  };
}

function draftForReportingCycle(
  selectedKpi: StrategicDataEntrySelectedKpi,
  reportingYear: number,
  reportingPeriod: ReportingCycleOption,
  componentId: number | null,
  record?: StrategicDataEntryRecord,
): StrategicDataEntryDraft {
  const draft = record
    ? draftFromStrategicDataEntryRecord(selectedKpi, record)
    : emptyStrategicDataEntryDraft(selectedKpi, reportingYear);
  return {
    ...draft,
    componentId: componentId === null ? "" : String(componentId),
    flexibleMode:
      selectedKpi.reportingFrequency === "flexible" &&
      reportingPeriod.periodType === "annual"
        ? "annual"
        : "monthly",
    periodIndex: String(reportingPeriod.periodIndex),
  };
}

/** Build the complete editable draft set for one checklist item and period. */
export function initialStrategicDataEntryDrafts(
  selectedKpi: StrategicDataEntrySelectedKpi,
  reportingYear: number,
  reportingPeriod: ReportingCycleOption,
  records: StrategicDataEntryRecord[],
): StrategicDataEntryDrafts {
  if (selectedKpi.measurementType !== "multi_component") {
    return {
      [PRIMARY_DATA_ENTRY_DRAFT]: draftForReportingCycle(
        selectedKpi,
        reportingYear,
        reportingPeriod,
        null,
        records.find((record) => record.componentId === null),
      ),
    };
  }

  return Object.fromEntries(
    selectedKpi.components.map((component) => {
      const key = String(component.id);
      return [
        key,
        draftForReportingCycle(
          selectedKpi,
          reportingYear,
          reportingPeriod,
          component.id,
          records.find((record) => record.componentId === component.id),
        ),
      ];
    }),
  );
}

function readNumber(
  value: string,
  field: string,
  errors: StrategicDataEntryErrors,
  options: { integer?: boolean; nonnegative?: boolean; positive?: boolean } = {},
): number | null {
  if (value.trim() === "") {
    errors[field] = "This value is required.";
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    errors[field] = "Enter a finite number.";
    return null;
  }
  if (options.integer && !Number.isInteger(parsed)) {
    errors[field] = "Enter a whole number.";
    return null;
  }
  if (options.positive && parsed <= 0) {
    errors[field] = "Enter a number greater than zero.";
    return null;
  }
  if (options.nonnegative && parsed < 0) {
    errors[field] = "Enter zero or a positive number.";
    return null;
  }
  return parsed;
}

function optionalNumber(
  value: string,
  field: string,
  errors: StrategicDataEntryErrors,
  options: { integer?: boolean; nonnegative?: boolean; positive?: boolean } = {},
): number | null {
  if (value.trim() === "") return null;
  return readNumber(value, field, errors, options);
}

function periodPayload(
  selectedKpi: StrategicDataEntrySelectedKpi,
  draft: StrategicDataEntryDraft,
  reportingYear: number,
  errors: StrategicDataEntryErrors,
): Record<string, unknown> {
  const frequency = configuredFrequency(selectedKpi, draft);
  const periodIndex = Number(draft.periodIndex);
  const payload: Record<string, unknown> = { reporting_year: reportingYear };
  if (selectedKpi.reportingFrequency === "flexible") {
    payload.flexible_mode = draft.flexibleMode;
  }
  if (frequency === "monthly") {
    if (!Number.isInteger(periodIndex) || periodIndex < 1 || periodIndex > 12) {
      errors.periodIndex = "Choose a calendar month.";
    } else {
      payload.reporting_month = periodIndex;
    }
  } else if (frequency === "quarterly") {
    if (!Number.isInteger(periodIndex) || periodIndex < 1 || periodIndex > 4) {
      errors.periodIndex = "Choose a quarter.";
    } else {
      payload.reporting_quarter = periodIndex;
    }
  }
  return payload;
}

function commonPayload(draft: StrategicDataEntryDraft) {
  return {
    notes: draft.notes.trim() || null,
    source_reference: draft.sourceReference.trim() || null,
  };
}

export function buildStrategicDataEntryMutation(
  selectedKpi: StrategicDataEntrySelectedKpi,
  reportingYear: number,
  draft: StrategicDataEntryDraft,
): StrategicDataEntryBuildResult {
  const errors: StrategicDataEntryErrors = {};
  const component = selectedEntryComponent(selectedKpi, draft);
  if (selectedKpi.measurementType === "multi_component" && component === null) {
    errors.componentId = "Choose a configured component.";
  }
  const measurementType = component?.measurementType ?? selectedKpi.measurementType;
  if (measurementType === "multi_component") {
    errors.componentId = "Choose an atomic component measurement.";
  }
  const base = {
    ...periodPayload(selectedKpi, draft, reportingYear, errors),
    ...commonPayload(draft),
  };
  const owner = component
    ? { component_id: component.id }
    : { kpi_id: selectedKpi.id };
  const distributionOwner = component
    ? { kpi_id: selectedKpi.id, component_id: component.id }
    : { kpi_id: selectedKpi.id };

  if (measurementType === "distribution") {
    const respondentCount = readNumber(
      draft.respondentCount,
      "respondentCount",
      errors,
      { integer: true, nonnegative: true },
    );
    const bands = activeBandsForDraft(selectedKpi, draft);
    if (bands.length === 0) {
      errors.bands = "Configure at least one effective distribution band first.";
    }
    const bandPayload = bands.map((band) => ({
      band_id: band.id,
      slug: band.slug,
      label: band.label,
      count: readNumber(
        draft.bandCounts[String(band.id)] ?? "",
        `band.${band.id}`,
        errors,
        { integer: true, nonnegative: true },
      ),
      display_order: band.displayOrder,
      is_unknown: band.isUnknown,
      is_declined: band.isDeclined,
      derived_group: band.derivedGroup,
    }));
    const counts = bandPayload.map((band) => band.count);
    if (
      respondentCount !== null &&
      counts.every((count): count is number => count !== null)
    ) {
      if (
        draft.mutuallyExclusive &&
        counts.reduce((sum, count) => sum + count, 0) !== respondentCount
      ) {
        errors.bands = "Mutually exclusive band counts must equal the respondent total.";
      }
      if (
        !draft.mutuallyExclusive &&
        counts.some((count) => count > respondentCount)
      ) {
        errors.bands = "A band count cannot exceed the respondent total.";
      }
    }
    if (Object.keys(errors).length > 0) {
      return { ok: false, mutation: null, errors };
    }
    return {
      ok: true,
      errors: {},
      mutation: {
        endpoint: "/api/strategy/distributions",
        body: {
          ...distributionOwner,
          ...base,
          respondent_count: respondentCount,
          mutually_exclusive: draft.mutuallyExclusive,
          bands: bandPayload,
        },
      },
    };
  }

  const body: Record<string, unknown> = { ...owner, ...base };
  if (
    measurementType === "count" ||
    measurementType === "currency" ||
    measurementType === "cumulative" ||
    measurementType === "year_over_year"
  ) {
    body.value = readNumber(draft.value, "value", errors);
  } else if (measurementType === "binary") {
    if (draft.binaryValue !== "0" && draft.binaryValue !== "1") {
      errors.binaryValue = "Choose complete or not complete.";
    } else {
      body.value = Number(draft.binaryValue);
    }
  } else if (measurementType === "milestone") {
    const value = readNumber(draft.value, "value", errors);
    if (value !== null && (value < 0 || value > 100)) {
      errors.value = "Milestone progress must be between 0 and 100.";
    }
    body.value = value;
  } else if (measurementType === "percentage" || measurementType === "ratio") {
    body.numerator = readNumber(draft.numerator, "numerator", errors, {
      nonnegative: true,
    });
    const fixedDenominator = component?.fixedDenominator ?? selectedKpi.fixedDenominator;
    body.denominator =
      fixedDenominator === null
        ? readNumber(draft.denominator, "denominator", errors, {
            nonnegative: true,
          })
        : null;
  } else if (measurementType === "average") {
    const averageInputs: Record<string, unknown> = {
      method: draft.averageMethod,
    };
    if (draft.averageMethod === "percent_positive") {
      const positive = readNumber(
        draft.positiveResponseCount,
        "positiveResponseCount",
        errors,
        { integer: true, nonnegative: true },
      );
      const total = readNumber(
        draft.totalResponseCount,
        "totalResponseCount",
        errors,
        { integer: true, nonnegative: true },
      );
      if (positive !== null && total !== null && positive > total) {
        errors.positiveResponseCount =
          "Positive responses cannot exceed total responses.";
      }
      averageInputs.positive_response_count = positive;
      averageInputs.total_response_count = total;
    } else {
      averageInputs.respondent_count = readNumber(
        draft.respondentCount,
        "respondentCount",
        errors,
        { integer: true, positive: true },
      );
      if (draft.averageMethod === "average_score") {
        averageInputs.average_score = readNumber(
          draft.averageScore,
          "averageScore",
          errors,
          { nonnegative: true },
        );
        averageInputs.max_score_per_respondent = readNumber(
          draft.maxScorePerRespondent,
          "maxScorePerRespondent",
          errors,
          { positive: true },
        );
      } else {
        averageInputs.total_score = readNumber(
          draft.totalScore,
          "totalScore",
          errors,
          { nonnegative: true },
        );
        const totalPossible = optionalNumber(
          draft.totalPossibleScore,
          "totalPossibleScore",
          errors,
          { positive: true },
        );
        const maxPerRespondent = optionalNumber(
          draft.maxScorePerRespondent,
          "maxScorePerRespondent",
          errors,
          { positive: true },
        );
        if (totalPossible === null && maxPerRespondent === null) {
          errors.totalPossibleScore =
            "Enter total possible score or maximum score per respondent.";
        }
        averageInputs.total_possible_score = totalPossible;
        averageInputs.max_score_per_respondent = maxPerRespondent;
      }
    }
    body.average_inputs = averageInputs;
  } else {
    errors.value = "This measurement type cannot be entered here.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, mutation: null, errors };
  }
  return {
    ok: true,
    errors: {},
    mutation: {
      endpoint: component
        ? "/api/strategy/component-entries"
        : "/api/strategy/observations",
      body,
    },
  };
}

function valueString(value: number | null): string {
  return value === null ? "" : String(value);
}

export function draftFromStrategicDataEntryRecord(
  selectedKpi: StrategicDataEntrySelectedKpi,
  record: StrategicDataEntryRecord,
): StrategicDataEntryDraft {
  const draft = emptyStrategicDataEntryDraft(
    selectedKpi,
    record.year,
    new Date(`${record.year}-07-01T12:00:00Z`),
  );
  return {
    ...draft,
    componentId: record.componentId === null ? draft.componentId : String(record.componentId),
    flexibleMode:
      record.reportingFrequency === "flexible" && record.periodType === "annual"
        ? "annual"
        : "monthly",
    periodIndex: String(record.periodIndex),
    value: valueString(record.scalarValue ?? record.milestoneValue),
    binaryValue:
      record.booleanValue === null ? "" : record.booleanValue ? "1" : "0",
    numerator: valueString(record.numerator),
    denominator: valueString(record.denominator),
    averageMethod: record.averageMethod ?? "total_score",
    respondentCount: valueString(record.respondentCount),
    totalScore: valueString(record.totalScore),
    averageScore: valueString(record.averageScore),
    maxScorePerRespondent: valueString(record.maxScorePerRespondent),
    totalPossibleScore: valueString(record.totalPossibleScore),
    positiveResponseCount: valueString(record.positiveResponseCount),
    totalResponseCount: valueString(record.totalResponseCount),
    mutuallyExclusive: record.mutuallyExclusive ?? true,
    bandCounts: {
      ...draft.bandCounts,
      ...Object.fromEntries(
        record.bands.map((band) => [String(band.bandId), String(band.count)]),
      ),
    },
    notes: record.notes ?? "",
    sourceReference: record.sourceReference ?? "",
  };
}

export function strategicDataEntryPeriodLabel(
  record: StrategicDataEntryRecord,
): string {
  return strategyPeriods.reportingPeriodLabel({
    reportingFrequency: record.reportingFrequency,
    resolvedFrequency: record.periodType,
    reportingYear: record.year,
    periodIndex: record.periodIndex,
    flexibleMode:
      record.reportingFrequency === "flexible" &&
      (record.periodType === "monthly" || record.periodType === "annual")
        ? record.periodType
        : null,
  });
}

export function strategicDataEntryRawValueLabel(
  record: StrategicDataEntryRecord,
  unit: string | null,
): string {
  if (record.kind === "distribution") {
    return `${record.respondentCount ?? 0} respondents · ${record.bands.length} bands`;
  }
  if (record.measurementType === "binary") {
    return record.booleanValue ? "Complete" : "Not complete";
  }
  if (record.measurementType === "milestone") {
    return record.milestoneValue === null ? "Not reported" : `${record.milestoneValue}%`;
  }
  if (
    record.measurementType === "percentage" ||
    record.measurementType === "ratio"
  ) {
    return `${record.numerator ?? "—"} / ${record.denominator ?? "fixed denominator"}`;
  }
  if (record.measurementType === "average") {
    if (record.averageMethod === "percent_positive") {
      return `${record.positiveResponseCount ?? "—"} positive / ${record.totalResponseCount ?? "—"} responses`;
    }
    if (record.averageMethod === "average_score") {
      return `${record.averageScore ?? "—"} average · ${record.respondentCount ?? "—"} respondents`;
    }
    return `${record.totalScore ?? "—"} total score · ${record.respondentCount ?? "—"} respondents`;
  }
  return `${record.scalarValue ?? "—"}${unit ? ` ${unit}` : ""}`;
}

export function deleteEndpointForRecord(
  record: StrategicDataEntryRecord,
): StrategicDataEntryMutation["endpoint"] {
  if (record.kind === "component_entry") {
    return "/api/strategy/component-entries";
  }
  if (record.kind === "distribution") {
    return "/api/strategy/distributions";
  }
  return "/api/strategy/observations";
}
