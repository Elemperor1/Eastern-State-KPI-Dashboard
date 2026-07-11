export const CONFIGURATION_GAP_STATUSES = [
  "draft",
  "needs_definition",
  "needs_target",
  "ready",
  "active",
  "archived",
] as const;

export type ConfigurationGapStatus =
  (typeof CONFIGURATION_GAP_STATUSES)[number];

export const CONFIGURATION_GAP_KINDS = [
  "measurement_type",
  "formula",
  "components",
  "target",
  "denominator",
  "target_year",
  "unresolved_question",
] as const;

export type ConfigurationGapKind =
  (typeof CONFIGURATION_GAP_KINDS)[number];

/**
 * Small, serializable contract between the server route and the read-only UI.
 * It deliberately mirrors display needs instead of exposing persistence types.
 */
export interface ConfigurationGapRowViewModel {
  id: string;
  kpiId: number;
  kpiName: string;
  kpiSlug: string;
  priorityId: number;
  priorityName: string;
  goalId: number;
  goalName: string;
  configurationStatus: ConfigurationGapStatus;
  reportingFrequency: string | null;
  targetYears: number[];
  unresolvedQuestion: string | null;
  owner: string | null;
  dueDate: string | null;
  lastReviewedDate: string | null;
  missingMeasurementType: boolean;
  missingFormula: boolean;
  missingComponents: boolean;
  missingTarget: boolean;
  missingDenominator: boolean;
  missingTargetYear: boolean;
  editorHref: string;
}

export interface ConfigurationGapSummaryCounts {
  readyKpis: number;
  activeKpis: number;
  kpisNeedingTargets: number;
  kpisNeedingDefinitions: number;
  goalsExcludedFromCompletion: number;
}

export interface ConfigurationGapPageData {
  rows: ConfigurationGapRowViewModel[];
  counts: ConfigurationGapSummaryCounts;
  reportingYear: number;
  error: string | null;
}

export interface ConfigurationGapFilters {
  query: string;
  priorityId: number | null;
  goalId: number | null;
  status: ConfigurationGapStatus | null;
  owner: string | null;
  targetYear: number | "missing" | null;
  reportingFrequency: string | null;
}

export interface ConfigurationGapNamedOption {
  id: number;
  name: string;
}

export interface ConfigurationGapFilterOptions {
  priorities: ConfigurationGapNamedOption[];
  goals: ConfigurationGapNamedOption[];
  statuses: ConfigurationGapStatus[];
  owners: string[];
  hasUnassignedOwner: boolean;
  targetYears: number[];
  hasMissingTargetYear: boolean;
  reportingFrequencies: string[];
}

export const EMPTY_CONFIGURATION_GAP_FILTERS: ConfigurationGapFilters = {
  query: "",
  priorityId: null,
  goalId: null,
  status: null,
  owner: null,
  targetYear: null,
  reportingFrequency: null,
};

export const UNASSIGNED_CONFIGURATION_GAP_OWNER = "__unassigned__";

const GAP_KIND_LABELS: Record<ConfigurationGapKind, string> = {
  measurement_type: "Measurement type",
  formula: "Formula",
  components: "Components",
  target: "Target",
  denominator: "Denominator",
  target_year: "Target year",
  unresolved_question: "Unresolved question",
};

const STATUS_LABELS: Record<ConfigurationGapStatus, string> = {
  draft: "Draft",
  needs_definition: "Needs definition",
  needs_target: "Needs target",
  ready: "Ready",
  active: "Active",
  archived: "Archived",
};

function normalizedText(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function uniqueNamedOptions(
  rows: ConfigurationGapRowViewModel[],
  select: (row: ConfigurationGapRowViewModel) => ConfigurationGapNamedOption,
): ConfigurationGapNamedOption[] {
  const byId = new Map<number, ConfigurationGapNamedOption>();
  for (const row of rows) {
    const option = select(row);
    if (!byId.has(option.id)) byId.set(option.id, option);
  }
  return [...byId.values()].sort((a, b) => compareText(a.name, b.name));
}

function uniqueStrings(values: Array<string | null>): string[] {
  const byNormalizedValue = new Map<string, string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const normalized = trimmed.toLocaleLowerCase();
    if (!byNormalizedValue.has(normalized)) {
      byNormalizedValue.set(normalized, trimmed);
    }
  }
  return [...byNormalizedValue.values()].sort(compareText);
}

export function getConfigurationGapKinds(
  row: ConfigurationGapRowViewModel,
): ConfigurationGapKind[] {
  const kinds: ConfigurationGapKind[] = [];
  if (row.missingMeasurementType) kinds.push("measurement_type");
  if (row.missingFormula) kinds.push("formula");
  if (row.missingComponents) kinds.push("components");
  if (row.missingTarget) kinds.push("target");
  if (row.missingDenominator) kinds.push("denominator");
  if (row.missingTargetYear) kinds.push("target_year");
  if (normalizedText(row.unresolvedQuestion)) {
    kinds.push("unresolved_question");
  }
  return kinds;
}

export function getConfigurationGapKindLabel(
  kind: ConfigurationGapKind,
): string {
  return GAP_KIND_LABELS[kind];
}

export function getConfigurationGapStatusLabel(
  status: ConfigurationGapStatus,
): string {
  return STATUS_LABELS[status];
}

export function buildConfigurationGapFilterOptions(
  rows: ConfigurationGapRowViewModel[],
): ConfigurationGapFilterOptions {
  const statuses = new Set(rows.map((row) => row.configurationStatus));
  const targetYears = new Set(
    rows.flatMap((row) => row.targetYears).filter(Number.isInteger),
  );

  return {
    priorities: uniqueNamedOptions(rows, (row) => ({
      id: row.priorityId,
      name: row.priorityName,
    })),
    goals: uniqueNamedOptions(rows, (row) => ({
      id: row.goalId,
      name: row.goalName,
    })),
    statuses: CONFIGURATION_GAP_STATUSES.filter((status) =>
      statuses.has(status),
    ),
    owners: uniqueStrings(rows.map((row) => row.owner)),
    hasUnassignedOwner: rows.some((row) => !normalizedText(row.owner)),
    targetYears: [...targetYears].sort((a, b) => a - b),
    hasMissingTargetYear: rows.some((row) => row.missingTargetYear),
    reportingFrequencies: uniqueStrings(
      rows.map((row) => row.reportingFrequency),
    ),
  };
}

export function filterConfigurationGaps(
  rows: ConfigurationGapRowViewModel[],
  filters: ConfigurationGapFilters,
): ConfigurationGapRowViewModel[] {
  const query = normalizedText(filters.query);
  const owner = normalizedText(filters.owner);
  const reportingFrequency = normalizedText(filters.reportingFrequency);

  return rows
    .filter((row) => {
      if (filters.priorityId !== null && row.priorityId !== filters.priorityId) {
        return false;
      }
      if (filters.goalId !== null && row.goalId !== filters.goalId) {
        return false;
      }
      if (filters.status !== null && row.configurationStatus !== filters.status) {
        return false;
      }
      if (filters.owner === UNASSIGNED_CONFIGURATION_GAP_OWNER) {
        if (normalizedText(row.owner)) return false;
      } else if (owner && normalizedText(row.owner) !== owner) {
        return false;
      }
      if (filters.targetYear === "missing") {
        if (!row.missingTargetYear) return false;
      } else if (
        filters.targetYear !== null &&
        !row.targetYears.includes(filters.targetYear)
      ) {
        return false;
      }
      if (
        reportingFrequency &&
        normalizedText(row.reportingFrequency) !== reportingFrequency
      ) {
        return false;
      }
      if (!query) return true;

      const searchable = [
        row.kpiName,
        row.kpiSlug,
        row.priorityName,
        row.goalName,
        row.owner,
        row.unresolvedQuestion,
        getConfigurationGapStatusLabel(row.configurationStatus),
        ...getConfigurationGapKinds(row).map(getConfigurationGapKindLabel),
      ]
        .map(normalizedText)
        .join(" ");
      return searchable.includes(query);
    })
    .sort(
      (a, b) =>
        compareText(a.priorityName, b.priorityName) ||
        compareText(a.goalName, b.goalName) ||
        compareText(a.kpiName, b.kpiName) ||
        compareText(a.id, b.id),
    );
}

export function hasConfigurationGapFilters(
  filters: ConfigurationGapFilters,
): boolean {
  return (
    Boolean(filters.query.trim()) ||
    filters.priorityId !== null ||
    filters.goalId !== null ||
    filters.status !== null ||
    Boolean(filters.owner) ||
    filters.targetYear !== null ||
    Boolean(filters.reportingFrequency)
  );
}

export function parseOptionalInteger(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function formatConfigurationGapDate(value: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed) return "Not recorded";
  const timestamp = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? Date.parse(`${trimmed}T00:00:00Z`)
    : Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}
