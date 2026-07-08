import {
  ANNUAL_ENTRY_MONTH,
  MONTH_FULL,
  MONTH_NUMBERS,
  isAnnualEntryMonth,
  isAnnualReportingFrequency,
  isMonthlyEntryMonth,
} from "./period-rules";
import type {
  BreakdownEntryWithMeta,
  KPIWithCategory,
  MonthlyEntryWithMeta,
} from "@/lib/types";

export interface AdminEntryDraft {
  id: number | null;
  value: string;
  notes: string;
  saved: number | null;
  dirty: boolean;
  saving?: boolean;
}

export type AdminEntryDraftPatch = Partial<
  Omit<AdminEntryDraft, "id" | "saved" | "dirty" | "saving">
>;

export interface AdminBreakdownDraft {
  id: number | null;
  label: string;
  value: string;
  notes: string;
  savedValue: number | null;
  dirty: boolean;
  saving?: boolean;
}

export type AdminBreakdownDraftPatch = Partial<
  Omit<AdminBreakdownDraft, "savedValue" | "dirty" | "saving">
>;

export interface SavedEntryDraftInput {
  id: number;
  value: number;
  notes?: string | null;
}

export interface SavedBreakdownDraftInput {
  id: number;
  label: string;
  value: number;
  notes?: string | null;
}

export interface AdminDataSelectionModel {
  filteredKpis: KPIWithCategory[];
  kpi: KPIWithCategory | null;
  selectedBreakdownIsMonthly: boolean;
  selectedBreakdownMonths: number[];
  selectedBreakdownPeriod: string;
}

export function buildAdminDataSelectionModel({
  breakdownMonth,
  breakdowns,
  categorySlug,
  kpiSlug,
  kpis,
  year,
}: {
  breakdownMonth: number;
  breakdowns: BreakdownEntryWithMeta[];
  categorySlug: string;
  kpiSlug: string;
  kpis: KPIWithCategory[];
  year: number;
}): AdminDataSelectionModel {
  const filteredKpis = categorySlug === "all"
    ? kpis
    : kpis.filter((kpi) => kpi.category_slug === categorySlug);
  const kpi = kpis.find((item) => item.slug === kpiSlug) ?? null;
  const selectedBreakdownIsMonthly = isMonthlyBreakdownKpi(kpi, breakdowns);
  const selectedBreakdownMonths = kpi && selectedBreakdownIsMonthly
    ? listBreakdownEditMonths({ breakdowns, kpi, year })
    : [];

  return {
    filteredKpis,
    kpi,
    selectedBreakdownIsMonthly,
    selectedBreakdownMonths,
    selectedBreakdownPeriod: formatAdminDataPeriod(
      selectedBreakdownIsMonthly ? breakdownMonth : ANNUAL_ENTRY_MONTH,
      year,
    ),
  };
}

export function formatAdminDataPeriod(month: number, year: number): string {
  if (isAnnualEntryMonth(month)) return String(year);
  return `${MONTH_FULL[month - 1] ?? `Month ${month}`} ${year}`;
}

export function buildDeleteEntryPayload(
  draft: AdminEntryDraft | undefined,
): { id: number } | null {
  return draft?.id === null || draft === undefined ? null : { id: draft.id };
}

export function readSavedEntryMutation(
  payload: unknown,
): SavedEntryDraftInput | null {
  if (!isRecord(payload) || !isRecord(payload.entry)) return null;
  const entry = payload.entry;
  if (!isPositiveInteger(entry.id) || !isFiniteNumber(entry.value)) return null;
  if (!isOptionalNote(entry.notes)) return null;

  return {
    id: entry.id,
    value: entry.value,
    notes: entry.notes,
  };
}

export function readSavedBreakdownMutation(
  payload: unknown,
): SavedBreakdownDraftInput | null {
  if (!isRecord(payload) || !isRecord(payload.breakdown)) return null;
  const breakdown = payload.breakdown;
  if (
    !isPositiveInteger(breakdown.id) ||
    typeof breakdown.label !== "string" ||
    breakdown.label.length === 0 ||
    !isFiniteNumber(breakdown.value) ||
    !isOptionalNote(breakdown.notes)
  ) {
    return null;
  }

  return {
    id: breakdown.id,
    label: breakdown.label,
    value: breakdown.value,
    notes: breakdown.notes,
  };
}

export function buildEntryDrafts({
  entries,
  kpi,
  year,
}: {
  entries: MonthlyEntryWithMeta[];
  kpi: KPIWithCategory;
  year: number;
}): Record<string, AdminEntryDraft> {
  const drafts: Record<string, AdminEntryDraft> = {};

  if (isAnnualReportingFrequency(kpi.reporting_frequency)) {
    const existing = entries.find(
      (entry) =>
        entry.kpi_id === kpi.id &&
        entry.year === year &&
        isAnnualEntryMonth(entry.month),
    );
    drafts[String(ANNUAL_ENTRY_MONTH)] = entryDraftFromRow(existing);
    return drafts;
  }

  for (const month of MONTH_NUMBERS) {
    const existing = entries.find(
      (entry) =>
        entry.kpi_id === kpi.id &&
        entry.year === year &&
        entry.month === month,
    );
    drafts[String(month)] = entryDraftFromRow(existing);
  }

  return drafts;
}

export function patchEntryDraft(
  drafts: Record<string, AdminEntryDraft>,
  month: number,
  patch: AdminEntryDraftPatch,
): Record<string, AdminEntryDraft> {
  const key = String(month);
  const current = drafts[key] ?? blankEntryDraft();
  const nextValue = patch.value !== undefined ? patch.value : current.value;
  const nextNotes = patch.notes !== undefined ? patch.notes : current.notes;

  return {
    ...drafts,
    [key]: {
      ...current,
      ...patch,
      dirty:
        nextValue !== String(current.saved ?? "") ||
        nextNotes !== (current.notes ?? ""),
    },
  };
}

export function markEntryDraftSaving(
  drafts: Record<string, AdminEntryDraft>,
  month: number,
  saving: boolean,
): Record<string, AdminEntryDraft> {
  const key = String(month);
  const current = drafts[key];
  if (!current) return drafts;
  return { ...drafts, [key]: { ...current, saving } };
}

export function applySavedEntryDraft(
  drafts: Record<string, AdminEntryDraft>,
  month: number,
  entry: SavedEntryDraftInput,
): Record<string, AdminEntryDraft> {
  return {
    ...drafts,
    [String(month)]: entryDraftFromSavedInput(entry),
  };
}

export function clearSavedEntryDraft(
  drafts: Record<string, AdminEntryDraft>,
  month: number,
): Record<string, AdminEntryDraft> {
  return {
    ...drafts,
    [String(month)]: blankEntryDraft(),
  };
}

export function isMonthlyBreakdownKpi(
  kpi: KPIWithCategory | null,
  breakdowns: BreakdownEntryWithMeta[],
): boolean {
  return Boolean(
    kpi?.unit_type === "breakdown" &&
      breakdowns.some(
        (breakdown) =>
          breakdown.kpi_id === kpi.id &&
          isMonthlyEntryMonth(breakdown.month),
      ),
  );
}

export function listBreakdownEditMonths({
  breakdowns,
  kpi,
  year,
}: {
  breakdowns: BreakdownEntryWithMeta[];
  kpi: KPIWithCategory;
  year: number;
}): number[] {
  return Array.from(
    new Set(
      breakdowns
        .filter(
          (breakdown) =>
            breakdown.kpi_id === kpi.id &&
            breakdown.year === year &&
            isMonthlyEntryMonth(breakdown.month),
        )
        .map((breakdown) => breakdown.month),
    ),
  ).sort((a, b) => a - b);
}

export function resolveBreakdownEditMonth({
  availableMonths,
  fallbackMonth,
  isMonthlyBreakdown,
  requestedMonth,
}: {
  availableMonths: number[];
  fallbackMonth: number;
  isMonthlyBreakdown: boolean;
  requestedMonth: number;
}): number {
  if (!isMonthlyBreakdown) return ANNUAL_ENTRY_MONTH;

  if (availableMonths.length === 0 && isMonthlyEntryMonth(requestedMonth)) {
    return requestedMonth;
  }

  if (availableMonths.includes(requestedMonth)) {
    return requestedMonth;
  }

  return availableMonths[0] ?? clampToCalendarMonth(fallbackMonth);
}

export function buildBreakdownDrafts({
  breakdowns,
  isMonthlyBreakdown,
  kpi,
  month,
  year,
}: {
  breakdowns: BreakdownEntryWithMeta[];
  isMonthlyBreakdown: boolean;
  kpi: KPIWithCategory;
  month: number;
  year: number;
}): AdminBreakdownDraft[] {
  return breakdowns
    .filter((breakdown) => {
      if (breakdown.kpi_id !== kpi.id || breakdown.year !== year) {
        return false;
      }
      return isMonthlyBreakdown ? breakdown.month === month : true;
    })
    .map((breakdown) => ({
      id: breakdown.id,
      label: breakdown.label,
      value: String(breakdown.value),
      notes: breakdown.notes ?? "",
      savedValue: breakdown.value,
      dirty: false,
    }));
}

export function patchBreakdownDraft(
  drafts: AdminBreakdownDraft[],
  index: number,
  patch: AdminBreakdownDraftPatch,
): AdminBreakdownDraft[] {
  const current = drafts[index];
  if (!current) return drafts;
  const next = { ...current, ...patch };

  return replaceBreakdownDraft(drafts, index, {
    ...next,
    dirty:
      next.label !== (current.savedValue !== null ? current.label : "") ||
      next.value !== String(current.savedValue ?? "") ||
      next.notes !== current.notes,
  });
}

export function markBreakdownDraftSaving(
  drafts: AdminBreakdownDraft[],
  index: number,
  saving: boolean,
): AdminBreakdownDraft[] {
  const current = drafts[index];
  if (!current) return drafts;
  return replaceBreakdownDraft(drafts, index, { ...current, saving });
}

export function applySavedBreakdownDraft(
  drafts: AdminBreakdownDraft[],
  index: number,
  entry: SavedBreakdownDraftInput,
): AdminBreakdownDraft[] {
  return replaceBreakdownDraft(drafts, index, breakdownDraftFromSavedInput(entry));
}

export function removeBreakdownDraft(
  drafts: AdminBreakdownDraft[],
  index: number,
): AdminBreakdownDraft[] {
  return drafts.filter((_, draftIndex) => draftIndex !== index);
}

export function addBlankBreakdownDraft(
  drafts: AdminBreakdownDraft[],
): AdminBreakdownDraft[] {
  return [...drafts, blankBreakdownDraft()];
}

function entryDraftFromRow(entry: MonthlyEntryWithMeta | undefined): AdminEntryDraft {
  return {
    id: entry?.id ?? null,
    value: entry ? String(entry.value) : "",
    notes: entry?.notes ?? "",
    saved: entry?.value ?? null,
    dirty: false,
  };
}

function entryDraftFromSavedInput(entry: SavedEntryDraftInput): AdminEntryDraft {
  return {
    id: entry.id,
    value: String(entry.value),
    notes: entry.notes ?? "",
    saved: entry.value,
    dirty: false,
    saving: false,
  };
}

function blankEntryDraft(): AdminEntryDraft {
  return {
    id: null,
    value: "",
    notes: "",
    saved: null,
    dirty: false,
    saving: false,
  };
}

function breakdownDraftFromSavedInput(entry: SavedBreakdownDraftInput): AdminBreakdownDraft {
  return {
    id: entry.id,
    label: entry.label,
    value: String(entry.value),
    notes: entry.notes ?? "",
    savedValue: entry.value,
    dirty: false,
    saving: false,
  };
}

function blankBreakdownDraft(): AdminBreakdownDraft {
  return {
    id: null,
    label: "",
    value: "",
    notes: "",
    savedValue: null,
    dirty: true,
  };
}

function replaceBreakdownDraft(
  drafts: AdminBreakdownDraft[],
  index: number,
  draft: AdminBreakdownDraft,
): AdminBreakdownDraft[] {
  const copy = [...drafts];
  copy[index] = draft;
  return copy;
}

function clampToCalendarMonth(month: number): number {
  if (month < 1) return 1;
  if (month > 12) return 12;
  return month;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalNote(
  value: unknown,
): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}
