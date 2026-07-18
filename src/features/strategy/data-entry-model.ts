import type {
  AverageInputMethod,
  ConfigurationStatus,
  DistributionDerivedGroup,
  MeasurementType,
  StrategyReportingFrequency,
} from "./types";
import type { ReportingCycleOption } from "./reporting-cycle";

interface StrategicDataEntryKpiOption {
  id: number;
  name: string;
  priorityName: string;
  goalName: string;
  measurementType: MeasurementType | null;
  reportingFrequency: StrategyReportingFrequency | null;
  configurationStatus: ConfigurationStatus | null;
  checklistStatus: "not_started" | "needs_attention" | "complete";
}

export interface StrategicDataEntryComponentOption {
  id: number;
  label: string;
  measurementType: MeasurementType;
  unit: string | null;
  numeratorLabel: string | null;
  denominatorLabel: string | null;
  fixedDenominator: number | null;
}

export interface StrategicDataEntryBandOption {
  id: number;
  componentId: number | null;
  slug: string;
  label: string;
  displayOrder: number;
  isUnknown: boolean;
  isDeclined: boolean;
  derivedGroup: DistributionDerivedGroup | null;
}

export interface StrategicDataEntrySelectedKpi {
  id: number;
  slug: string;
  name: string;
  priorityName: string;
  goalName: string;
  unit: string | null;
  numeratorLabel: string | null;
  denominatorLabel: string | null;
  measurementType: MeasurementType;
  reportingFrequency: StrategyReportingFrequency;
  configurationStatus: ConfigurationStatus;
  calculationPrecision: number;
  fixedDenominator: number | null;
  components: StrategicDataEntryComponentOption[];
  bands: StrategicDataEntryBandOption[];
}

interface StrategicDataEntryBandValue {
  bandId: number;
  slug: string;
  currentLabel: string;
  labelSnapshot: string;
  count: number;
  displayOrder: number;
  isUnknown: boolean;
  isDeclined: boolean;
  derivedGroup: DistributionDerivedGroup | null;
}

type StrategicDataEntryRecordKind =
  | "observation"
  | "component_entry"
  | "distribution";

export interface StrategicDataEntryRecord {
  id: number;
  kind: StrategicDataEntryRecordKind;
  kpiId: number;
  componentId: number | null;
  componentLabel: string | null;
  measurementType: MeasurementType;
  reportingFrequency: StrategyReportingFrequency;
  year: number;
  periodType: Exclude<StrategyReportingFrequency, "flexible">;
  periodIndex: number;
  scalarValue: number | null;
  numerator: number | null;
  denominator: number | null;
  respondentCount: number | null;
  averageMethod: AverageInputMethod | null;
  totalScore: number | null;
  averageScore: number | null;
  maxScorePerRespondent: number | null;
  totalPossibleScore: number | null;
  positiveResponseCount: number | null;
  totalResponseCount: number | null;
  booleanValue: boolean | null;
  milestoneValue: number | null;
  mutuallyExclusive: boolean | null;
  notes: string | null;
  sourceReference: string | null;
  bands: StrategicDataEntryBandValue[];
}

export interface StrategicDataEntryPageData {
  reportingYear: number;
  years: number[];
  reportingPeriod: ReportingCycleOption;
  reportingPeriods: ReportingCycleOption[];
  showSelectedKpi: boolean;
  kpis: StrategicDataEntryKpiOption[];
  selectedKpiId: number | null;
  selectedKpi: StrategicDataEntrySelectedKpi | null;
  records: StrategicDataEntryRecord[];
  loadError: string | null;
}
