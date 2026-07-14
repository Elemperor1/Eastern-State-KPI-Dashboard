import {
  STRATEGY_REPORTING_FREQUENCIES,
  type ExplicitStrategyReportingFrequency,
  type StrategyReportingFrequency,
} from "./types";

export const STRATEGY_MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const STRATEGY_QUARTER_LABELS = ["Q1", "Q2", "Q3", "Q4"] as const;
export const FLEXIBLE_PERIOD_MODES = ["monthly", "annual"] as const;

export type FlexiblePeriodMode = (typeof FLEXIBLE_PERIOD_MODES)[number];
export type ConcreteStrategyReportingFrequency =
  ExplicitStrategyReportingFrequency;

export type StrategyPeriodDefinition =
  | {
      reportingFrequency: ConcreteStrategyReportingFrequency;
      flexibleMode?: never;
    }
  | {
      reportingFrequency: "flexible";
      flexibleMode: FlexiblePeriodMode;
    };

export type StrategyPeriodContext = StrategyPeriodDefinition & {
  reportingYear: number;
};

export interface StrategyReportingPeriod {
  reportingFrequency: StrategyReportingFrequency;
  resolvedFrequency: ConcreteStrategyReportingFrequency;
  reportingYear: number;
  /**
   * Storage representation: calendar month 1-12, quarter 1-4, or the internal
   * annual/cumulative/one-time sentinel. Render labels through
   * `reportingPeriodLabel`; never show this field directly to users.
   */
  periodIndex: number;
  flexibleMode: FlexiblePeriodMode | null;
}

export interface StrategyPeriodOption {
  value: number;
  storageIndex: number;
  label: string;
}

export interface StrategyPeriodCandidate {
  reportingFrequency?: unknown;
  reportingYear?: unknown;
  periodIndex?: unknown;
  reportingMonth?: unknown;
  reportingQuarter?: unknown;
  flexibleMode?: unknown;
}

export type StrategyPeriodIssueCode =
  | "INVALID_INPUT"
  | "INVALID_FREQUENCY"
  | "INVALID_YEAR"
  | "FLEXIBLE_MODE_REQUIRED"
  | "INVALID_FLEXIBLE_MODE"
  | "FLEXIBLE_MODE_NOT_ALLOWED"
  | "MIXED_PERIOD_INPUT"
  | "PERIOD_REQUIRED"
  | "INVALID_PERIOD";

export interface StrategyPeriodIssue {
  code: StrategyPeriodIssueCode;
  path: keyof StrategyPeriodCandidate | "input";
  message: string;
}

export type StrategyPeriodValidationResult =
  | { success: true; period: StrategyReportingPeriod; issues: [] }
  | { success: false; period: null; issues: StrategyPeriodIssue[] };

const MIN_REPORTING_YEAR = 1900;
const MAX_REPORTING_YEAR = 2100;
const INTERNAL_SINGLE_PERIOD_INDEX = 0;

const FREQUENCY_SET = new Set<string>(STRATEGY_REPORTING_FREQUENCIES);
const FLEXIBLE_MODE_SET = new Set<string>(FLEXIBLE_PERIOD_MODES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReportingFrequency(value: unknown): value is StrategyReportingFrequency {
  return typeof value === "string" && FREQUENCY_SET.has(value);
}

function isFlexibleMode(value: unknown): value is FlexiblePeriodMode {
  return typeof value === "string" && FLEXIBLE_MODE_SET.has(value);
}

function isReportingYear(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_REPORTING_YEAR &&
    value <= MAX_REPORTING_YEAR
  );
}

function isSupplied(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function resolveDefinition(
  definition: StrategyPeriodDefinition,
): ConcreteStrategyReportingFrequency {
  if (definition.reportingFrequency !== "flexible") {
    return definition.reportingFrequency;
  }
  return definition.flexibleMode;
}

function assertReportingYear(year: number): void {
  if (!isReportingYear(year)) {
    throw new RangeError(
      `Reporting year must be an integer from ${MIN_REPORTING_YEAR} through ${MAX_REPORTING_YEAR}.`,
    );
  }
}

function assertValidNow(now: Date): void {
  if (Number.isNaN(now.getTime())) {
    throw new RangeError("The current date must be valid.");
  }
}

function definitionFromPeriod(period: StrategyReportingPeriod): StrategyPeriodDefinition {
  return period.reportingFrequency === "flexible"
    ? {
        reportingFrequency: "flexible",
        flexibleMode: period.flexibleMode as FlexiblePeriodMode,
      }
    : { reportingFrequency: period.reportingFrequency };
}

/**
 * Validate and normalize period input from APIs/forms. Monthly and quarterly
 * callers may provide either the generic `periodIndex` or their named field,
 * but mixing representations is rejected rather than silently choosing one.
 */
export function validateReportingPeriod(input: unknown): StrategyPeriodValidationResult {
  if (!isRecord(input)) {
    return {
      success: false,
      period: null,
      issues: [
        {
          code: "INVALID_INPUT",
          path: "input",
          message: "Reporting period input must be an object.",
        },
      ],
    };
  }

  const candidate = input as StrategyPeriodCandidate;
  const issues: StrategyPeriodIssue[] = [];
  const frequency = candidate.reportingFrequency;
  const year = candidate.reportingYear;

  if (!isReportingFrequency(frequency)) {
    issues.push({
      code: "INVALID_FREQUENCY",
      path: "reportingFrequency",
      message: "Choose a supported reporting frequency.",
    });
  }
  if (!isReportingYear(year)) {
    issues.push({
      code: "INVALID_YEAR",
      path: "reportingYear",
      message: `Reporting year must be an integer from ${MIN_REPORTING_YEAR} through ${MAX_REPORTING_YEAR}.`,
    });
  }

  let flexibleMode: FlexiblePeriodMode | null = null;
  let resolvedFrequency: ConcreteStrategyReportingFrequency | null = null;
  if (isReportingFrequency(frequency)) {
    if (frequency === "flexible") {
      if (candidate.flexibleMode === undefined || candidate.flexibleMode === null) {
        issues.push({
          code: "FLEXIBLE_MODE_REQUIRED",
          path: "flexibleMode",
          message: "Legacy flexible reporting requires an explicit monthly or annual mode.",
        });
      } else if (!isFlexibleMode(candidate.flexibleMode)) {
        issues.push({
          code: "INVALID_FLEXIBLE_MODE",
          path: "flexibleMode",
          message: "Legacy flexible mode must be monthly or annual.",
        });
      } else {
        flexibleMode = candidate.flexibleMode;
        resolvedFrequency = candidate.flexibleMode;
      }
    } else {
      resolvedFrequency = frequency;
      if (isSupplied(candidate.flexibleMode)) {
        issues.push({
          code: "FLEXIBLE_MODE_NOT_ALLOWED",
          path: "flexibleMode",
          message: "Flexible mode applies only to legacy flexible reporting.",
        });
      }
    }
  }

  const suppliedIndexFields = [
    ["periodIndex", candidate.periodIndex],
    ["reportingMonth", candidate.reportingMonth],
    ["reportingQuarter", candidate.reportingQuarter],
  ] as const;
  const suppliedIndexes = suppliedIndexFields.filter(([, value]) => isSupplied(value));
  if (suppliedIndexes.length > 1) {
    issues.push({
      code: "MIXED_PERIOD_INPUT",
      path: "periodIndex",
      message: "Provide one period representation, not mixed month, quarter, and index fields.",
    });
  }

  let periodIndex: number | null = null;
  if (resolvedFrequency === "monthly") {
    if (isSupplied(candidate.reportingQuarter)) {
      issues.push({
        code: "MIXED_PERIOD_INPUT",
        path: "reportingQuarter",
        message: "Monthly reporting cannot use a quarter selection.",
      });
    }
    const rawIndex = isSupplied(candidate.reportingMonth)
      ? candidate.reportingMonth
      : candidate.periodIndex;
    if (!isSupplied(rawIndex)) {
      issues.push({
        code: "PERIOD_REQUIRED",
        path: "reportingMonth",
        message: "Choose a calendar month.",
      });
    } else if (
      typeof rawIndex !== "number" ||
      !Number.isInteger(rawIndex) ||
      rawIndex < 1 ||
      rawIndex > STRATEGY_MONTH_LABELS.length
    ) {
      issues.push({
        code: "INVALID_PERIOD",
        path: isSupplied(candidate.reportingMonth) ? "reportingMonth" : "periodIndex",
        message: "Choose a calendar month from January through December.",
      });
    } else {
      periodIndex = rawIndex;
    }
  } else if (resolvedFrequency === "quarterly") {
    if (isSupplied(candidate.reportingMonth)) {
      issues.push({
        code: "MIXED_PERIOD_INPUT",
        path: "reportingMonth",
        message: "Quarterly reporting cannot use a month selection.",
      });
    }
    const rawIndex = isSupplied(candidate.reportingQuarter)
      ? candidate.reportingQuarter
      : candidate.periodIndex;
    if (!isSupplied(rawIndex)) {
      issues.push({
        code: "PERIOD_REQUIRED",
        path: "reportingQuarter",
        message: "Choose a quarter from Q1 through Q4.",
      });
    } else if (
      typeof rawIndex !== "number" ||
      !Number.isInteger(rawIndex) ||
      rawIndex < 1 ||
      rawIndex > STRATEGY_QUARTER_LABELS.length
    ) {
      issues.push({
        code: "INVALID_PERIOD",
        path: isSupplied(candidate.reportingQuarter) ? "reportingQuarter" : "periodIndex",
        message: "Choose a quarter from Q1 through Q4.",
      });
    } else {
      periodIndex = rawIndex;
    }
  } else if (resolvedFrequency !== null) {
    if (isSupplied(candidate.reportingMonth) || isSupplied(candidate.reportingQuarter)) {
      issues.push({
        code: "MIXED_PERIOD_INPUT",
        path: isSupplied(candidate.reportingMonth)
          ? "reportingMonth"
          : "reportingQuarter",
        message: "This reporting frequency uses one named reporting period.",
      });
    }
    if (
      isSupplied(candidate.periodIndex) &&
      candidate.periodIndex !== INTERNAL_SINGLE_PERIOD_INDEX
    ) {
      issues.push({
        code: "INVALID_PERIOD",
        path: "periodIndex",
        message: "This reporting frequency uses one named reporting period.",
      });
    }
    periodIndex = INTERNAL_SINGLE_PERIOD_INDEX;
  }

  if (
    issues.length > 0 ||
    !isReportingFrequency(frequency) ||
    !isReportingYear(year) ||
    resolvedFrequency === null ||
    periodIndex === null
  ) {
    return { success: false, period: null, issues };
  }

  return {
    success: true,
    issues: [],
    period: {
      reportingFrequency: frequency,
      resolvedFrequency,
      reportingYear: year,
      periodIndex,
      flexibleMode,
    },
  };
}

/** Choose the period that best represents the selected year at `now`. */
export function defaultReportingPeriod(
  context: StrategyPeriodContext,
  now: Date = new Date(),
): StrategyReportingPeriod {
  assertReportingYear(context.reportingYear);
  assertValidNow(now);
  const resolvedFrequency = resolveDefinition(context);
  const currentYear = now.getFullYear();
  let periodIndex = INTERNAL_SINGLE_PERIOD_INDEX;

  if (resolvedFrequency === "monthly") {
    periodIndex =
      context.reportingYear < currentYear
        ? STRATEGY_MONTH_LABELS.length
        : context.reportingYear > currentYear
          ? 1
          : now.getMonth() + 1;
  } else if (resolvedFrequency === "quarterly") {
    periodIndex =
      context.reportingYear < currentYear
        ? STRATEGY_QUARTER_LABELS.length
        : context.reportingYear > currentYear
          ? 1
          : Math.floor(now.getMonth() / 3) + 1;
  }

  return {
    reportingFrequency: context.reportingFrequency,
    resolvedFrequency,
    reportingYear: context.reportingYear,
    periodIndex,
    flexibleMode:
      context.reportingFrequency === "flexible" ? context.flexibleMode : null,
  };
}

/** User-facing label for a validated period. Internal sentinels never leak. */
export function reportingPeriodLabel(period: StrategyReportingPeriod): string {
  const validation = validateReportingPeriod(period);
  if (!validation.success) {
    throw new RangeError(validation.issues.map((issue) => issue.message).join(" "));
  }
  const normalized = validation.period;
  switch (normalized.resolvedFrequency) {
    case "monthly":
      return `${STRATEGY_MONTH_LABELS[normalized.periodIndex - 1]} ${normalized.reportingYear}`;
    case "quarterly":
      return `${STRATEGY_QUARTER_LABELS[normalized.periodIndex - 1]} ${normalized.reportingYear}`;
    case "annual":
      return `Full year ${normalized.reportingYear}`;
    case "cumulative":
      return `Cumulative through ${normalized.reportingYear}`;
    case "one_time":
      return `One-time result (${normalized.reportingYear})`;
  }
}

/** Map a validated reporting selection to its persisted period index. */
export function reportingPeriodStorageIndex(period: StrategyReportingPeriod): number {
  const validation = validateReportingPeriod(period);
  if (!validation.success) {
    throw new RangeError(validation.issues.map((issue) => issue.message).join(" "));
  }
  return validation.period.periodIndex;
}

/** Fraction of the reporting cycle elapsed at the selected period. */
export function reportingPeriodElapsedFraction(period: StrategyReportingPeriod): number {
  const validation = validateReportingPeriod(period);
  if (!validation.success) {
    throw new RangeError(validation.issues.map((issue) => issue.message).join(" "));
  }
  if (validation.period.resolvedFrequency === "monthly") {
    return validation.period.periodIndex / STRATEGY_MONTH_LABELS.length;
  }
  if (validation.period.resolvedFrequency === "quarterly") {
    return validation.period.periodIndex / STRATEGY_QUARTER_LABELS.length;
  }
  return 1;
}

/** Options that a period control may safely render for the selected year. */
export function allowedReportingPeriodOptions(
  definition: StrategyPeriodDefinition,
  reportingYear: number,
): StrategyPeriodOption[] {
  assertReportingYear(reportingYear);
  const resolvedFrequency = resolveDefinition(definition);
  if (resolvedFrequency === "monthly") {
    return STRATEGY_MONTH_LABELS.map((label, index) => ({
      value: index + 1,
      storageIndex: index + 1,
      label,
    }));
  }
  if (resolvedFrequency === "quarterly") {
    return STRATEGY_QUARTER_LABELS.map((label, index) => ({
      value: index + 1,
      storageIndex: index + 1,
      label,
    }));
  }

  const label =
    resolvedFrequency === "annual"
      ? "Full year"
      : resolvedFrequency === "cumulative"
        ? `Cumulative through ${reportingYear}`
        : `One-time result (${reportingYear})`;
  return [
    {
      value: INTERNAL_SINGLE_PERIOD_INDEX,
      storageIndex: INTERNAL_SINGLE_PERIOD_INDEX,
      label,
    },
  ];
}

/** Re-resolve a validated period after the user switches reporting year. */
export function reportingPeriodForYear(
  period: StrategyReportingPeriod,
  reportingYear: number,
  now: Date = new Date(),
): StrategyReportingPeriod {
  const validation = validateReportingPeriod(period);
  if (!validation.success) {
    throw new RangeError(validation.issues.map((issue) => issue.message).join(" "));
  }
  return defaultReportingPeriod(
    {
      ...definitionFromPeriod(validation.period),
      reportingYear,
    },
    now,
  );
}
