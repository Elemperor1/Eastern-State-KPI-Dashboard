"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import {
  Card,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  StatusBanner,
} from "@/components/ui";
import {
  ANNUAL_ENTRY_MONTH,
  addBlankBreakdownDraft,
  applySavedBreakdownDraft,
  applySavedEntryDraft,
  buildAdminDataSelectionModel,
  buildBreakdownDrafts,
  buildDeleteEntryPayload,
  buildEntryDrafts,
  clearSavedEntryDraft,
  formatAdminDataPeriod,
  isAnnualReportingFrequency,
  markBreakdownDraftSaving,
  markEntryDraftSaving,
  patchBreakdownDraft,
  patchEntryDraft,
  readSavedBreakdownMutation,
  readSavedEntryMutation,
  removeBreakdownDraft,
  resolveBreakdownEditMonth,
  type AdminBreakdownDraft,
  type AdminBreakdownDraftPatch,
  type AdminEntryDraft,
  type AdminEntryDraftPatch,
} from "@/features/metrics";
import { AdminAnnualEntryEditor } from "@/components/AdminAnnualEntryEditor";
import { AdminBreakdownEntryEditor } from "@/components/AdminBreakdownEntryEditor";
import { AdminDataFilters } from "@/components/AdminDataFilters";
import { AdminMonthlyEntryEditor } from "@/components/AdminMonthlyEntryEditor";
import { SampleDataBadge } from "@/components/SampleDataBadge";
import type {
  BreakdownEntryWithMeta,
  Category,
  KPIWithCategory,
  MonthlyEntryWithMeta,
} from "@/lib/types";
import { apiFetch } from "@/lib/api-client";

export function AdminDataClient({
  kpis,
  categories,
  entries,
  breakdowns,
  years,
  sampleData,
}: {
  kpis: KPIWithCategory[];
  categories: Category[];
  entries: MonthlyEntryWithMeta[];
  breakdowns: BreakdownEntryWithMeta[];
  years: number[];
  sampleData: boolean;
}) {
  const [categorySlug, setCategorySlug] = useState<string>("all");
  const [kpiSlug, setKpiSlug] = useState<string>(kpis[0]?.slug ?? "");
  const [year, setYear] = useState<number>(years[years.length - 1] ?? new Date().getFullYear());
  const [brkMonth, setBrkMonth] = useState<number>(Math.min(new Date().getMonth() + 1, 12));
  const [drafts, setDrafts] = useState<Record<string, AdminEntryDraft>>({});
  const [brkDrafts, setBrkDrafts] = useState<AdminBreakdownDraft[]>([]);
  const [feedback, setFeedback] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    action: () => void | Promise<void>;
  } | null>(null);

  const {
    filteredKpis,
    kpi,
    selectedBreakdownIsMonthly,
    selectedBreakdownMonths,
    selectedBreakdownPeriod,
  } = useMemo(
    () => buildAdminDataSelectionModel({
      breakdownMonth: brkMonth,
      breakdowns,
      categorySlug,
      kpiSlug,
      kpis,
      year,
    }),
    [breakdowns, brkMonth, categorySlug, kpiSlug, kpis, year],
  );

  useEffect(() => {
    if (!kpi) return;
    setFeedback(null);
    if (kpi.unit_type === "breakdown") {
      const nextMonth = resolveBreakdownEditMonth({
        availableMonths: selectedBreakdownMonths,
        fallbackMonth: Math.min(new Date().getMonth() + 1, 12),
        isMonthlyBreakdown: selectedBreakdownIsMonthly,
        requestedMonth: brkMonth,
      });
      if (nextMonth !== brkMonth) {
        setBrkMonth(nextMonth);
        return;
      }
      setBrkDrafts(buildBreakdownDrafts({
        breakdowns,
        isMonthlyBreakdown: selectedBreakdownIsMonthly,
        kpi,
        month: nextMonth,
        year,
      }));
      setDrafts({});
      return;
    }

    setDrafts(buildEntryDrafts({ entries, kpi, year }));
    setBrkDrafts([]);
  }, [
    kpi,
    year,
    entries,
    breakdowns,
    brkMonth,
    selectedBreakdownIsMonthly,
    selectedBreakdownMonths,
  ]);

  function setField(month: number, patch: AdminEntryDraftPatch) {
    setDrafts((prev) => patchEntryDraft(prev, month, patch));
  }

  async function saveMonth(month: number) {
    if (!kpi) return;
    const draft = drafts[String(month)];
    if (!draft) return;
    if (draft.value === "" || Number.isNaN(Number(draft.value))) return;
    setDrafts((prev) => markEntryDraftSaving(prev, month, true));
    try {
      const res = await apiFetch("/api/entries", {
        method: "POST",
        body: {
          kpi_id: kpi.id,
          year,
          month,
          value: Number(draft.value),
          notes: draft.notes || null,
        },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFeedback({ message: `Could not save: ${data.error ?? "unknown error"}`, variant: "error" });
        setDrafts((prev) => markEntryDraftSaving(prev, month, false));
        return;
      }
      const entry = readSavedEntryMutation(await res.json().catch(() => null));
      if (!entry) {
        setFeedback({ message: "Could not save: invalid server response", variant: "error" });
        setDrafts((prev) => markEntryDraftSaving(prev, month, false));
        return;
      }
      setDrafts((prev) => applySavedEntryDraft(prev, month, entry));
      setFeedback({
        message: `Saved ${formatAdminDataPeriod(month, year)}.`,
        variant: "success",
      });
    } catch (err) {
      console.error(err);
      setFeedback({ message: "Network error. Try again.", variant: "error" });
      setDrafts((prev) => markEntryDraftSaving(prev, month, false));
    }
  }

  async function clearMonth(month: number) {
    if (!kpi) return;
    const draft = drafts[String(month)];
    const payload = buildDeleteEntryPayload(draft);
    if (!payload) return;
    setDrafts((prev) => markEntryDraftSaving(prev, month, true));
    try {
      const res = await apiFetch("/api/entries", {
        method: "DELETE",
        body: payload,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFeedback({ message: `Could not clear: ${data.error ?? "unknown error"}`, variant: "error" });
        setDrafts((prev) => markEntryDraftSaving(prev, month, false));
        return;
      }
      setDrafts((prev) => clearSavedEntryDraft(prev, month));
      setFeedback({
        message: `Cleared ${formatAdminDataPeriod(month, year)}.`,
        variant: "success",
      });
    } catch (err) {
      console.error(err);
      setFeedback({ message: "Network error. Try again.", variant: "error" });
      setDrafts((prev) => markEntryDraftSaving(prev, month, false));
    }
  }

  function updateBrk(idx: number, patch: AdminBreakdownDraftPatch) {
    setBrkDrafts((prev) => patchBreakdownDraft(prev, idx, patch));
  }

  async function saveBrk(idx: number) {
    if (!kpi) return;
    const d = brkDrafts[idx];
    if (!d || d.value === "" || Number.isNaN(Number(d.value)) || !d.label.trim()) return;
    // Guard: monthly breakdowns must never be saved with month=0 (annual
    // summary slot). This catches the race where brkMonth hasn't been
    // corrected by the useEffect yet after switching KPIs.
    if (selectedBreakdownIsMonthly && (brkMonth < 1 || brkMonth > 12)) {
      setFeedback({ message: "Select a valid month before saving.", variant: "error" });
      return;
    }
    setBrkDrafts((prev) => markBreakdownDraftSaving(prev, idx, true));
    try {
      const res = await apiFetch("/api/breakdowns", {
        method: "POST",
        body: {
          id: d.id,
          kpi_id: kpi.id,
          year,
          month: selectedBreakdownIsMonthly ? brkMonth : undefined,
          label: d.label.trim(),
          value: Number(d.value),
          notes: d.notes || null,
        },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFeedback({ message: `Could not save: ${data.error ?? "unknown error"}`, variant: "error" });
        setBrkDrafts((prev) => markBreakdownDraftSaving(prev, idx, false));
        return;
      }
      const breakdown = readSavedBreakdownMutation(
        await res.json().catch(() => null),
      );
      if (!breakdown) {
        setFeedback({ message: "Could not save: invalid server response", variant: "error" });
        setBrkDrafts((prev) => markBreakdownDraftSaving(prev, idx, false));
        return;
      }
      setBrkDrafts((prev) => applySavedBreakdownDraft(prev, idx, breakdown));
      setFeedback({
        message: `Saved "${breakdown.label}" for ${selectedBreakdownPeriod}.`,
        variant: "success",
      });
    } catch (err) {
      console.error(err);
      setFeedback({ message: "Network error. Try again.", variant: "error" });
      setBrkDrafts((prev) => markBreakdownDraftSaving(prev, idx, false));
    }
  }

  async function deleteBrk(idx: number) {
    if (!kpi) return;
    const d = brkDrafts[idx];
    if (!d) return;
    if (d.id !== null) {
      const res = await apiFetch("/api/breakdowns", {
        method: "DELETE",
        body: { id: d.id },
      });
      if (!res.ok) {
        setFeedback({ message: "Could not delete row.", variant: "error" });
        return;
      }
    }
    setBrkDrafts((prev) => removeBreakdownDraft(prev, idx));
    setFeedback({ message: "Row removed.", variant: "success" });
  }

  function addBrkRow() {
    setBrkDrafts(addBlankBreakdownDraft);
  }

  function requestClearMonth(month: number) {
    const period = formatAdminDataPeriod(month, year);
    setConfirmation({
      title: `Clear ${period}?`,
      description: "This removes the saved value and notes for this period. The action cannot be undone.",
      confirmLabel: "Clear value",
      action: () => clearMonth(month),
    });
  }

  function requestDeleteBreakdown(idx: number) {
    const row = brkDrafts[idx];
    if (!row) return;
    if (row.id === null) {
      void deleteBrk(idx);
      return;
    }
    setConfirmation({
      title: `Delete “${row.label}”?`,
      description: `This removes the breakdown row from ${selectedBreakdownPeriod}. The action cannot be undone.`,
      confirmLabel: "Delete row",
      action: () => deleteBrk(idx),
    });
  }

  return (
    <div className="page-content page-enter">
      <PageHeader
        eyebrow="Admin · Data Entry"
        title="Enter monthly, annual, and breakdown values"
        subtitle="Pick a metric and year, then fill in the values. Changes are saved per field."
        actions={<SampleDataBadge sample={sampleData} />}
      />

      {feedback ? (
        <StatusBanner variant={feedback.variant} onDismiss={() => setFeedback(null)}>
          {feedback.message}
        </StatusBanner>
      ) : null}

      <AdminDataFilters
        categories={categories}
        filteredKpis={filteredKpis}
        years={years}
        categorySlug={categorySlug}
        kpiSlug={kpiSlug}
        year={year}
        onCategoryChange={(nextCategorySlug) => {
          setCategorySlug(nextCategorySlug);
          setKpiSlug("");
        }}
        onKpiChange={setKpiSlug}
        onYearChange={setYear}
      />

      {!kpi ? (
        <Card className="p-8">
          <EmptyState
            icon={FileSpreadsheet}
            title="Select a metric"
            description="Choose a category, metric, and year from the controls above to begin entering data."
          />
        </Card>
      ) : kpi.unit_type === "breakdown" ? (
        <AdminBreakdownEntryEditor
          drafts={brkDrafts}
          kpi={kpi}
          selectedBreakdownIsMonthly={selectedBreakdownIsMonthly}
          selectedBreakdownPeriod={selectedBreakdownPeriod}
          breakdownMonth={brkMonth}
          onBreakdownMonthChange={setBrkMonth}
          onAddRow={addBrkRow}
          onChangeRow={updateBrk}
          onSaveRow={saveBrk}
          onDeleteRow={requestDeleteBreakdown}
        />
      ) : isAnnualReportingFrequency(kpi.reporting_frequency) ? (
        <AdminAnnualEntryEditor
          draft={drafts[String(ANNUAL_ENTRY_MONTH)]}
          kpi={kpi}
          year={year}
          onChange={(patch) => setField(ANNUAL_ENTRY_MONTH, patch)}
          onSave={() => saveMonth(ANNUAL_ENTRY_MONTH)}
          onClear={() => requestClearMonth(ANNUAL_ENTRY_MONTH)}
        />
      ) : (
        <AdminMonthlyEntryEditor
          drafts={drafts}
          kpi={kpi}
          year={year}
          onChange={setField}
          onSave={saveMonth}
          onClear={requestClearMonth}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmation)}
        title={confirmation?.title ?? ""}
        description={confirmation?.description ?? ""}
        confirmLabel={confirmation?.confirmLabel}
        onClose={() => setConfirmation(null)}
        onConfirm={async () => {
          const action = confirmation?.action;
          setConfirmation(null);
          await action?.();
        }}
      />
    </div>
  );
}
