"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, Trash2, FileSpreadsheet } from "lucide-react";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FilterToolbar,
  FormField,
  IconButton,
  Input,
  PageHeader,
  Select,
  StatusBanner,
} from "@/components/ui";
import { MONTH_FULL, MONTH_LABELS, formatValue } from "@/lib/analytics";
import { SampleDataBadge } from "@/components/SampleDataBadge";
import { cn } from "@/lib/utils";
import type {
  BreakdownEntryWithMeta,
  Category,
  KPIWithCategory,
  MonthlyEntryWithMeta,
} from "@/lib/types";
import { apiFetch } from "@/lib/api-client";

interface DraftEntry {
  value: string;
  notes: string;
  saved: number | null;
  dirty: boolean;
  saving?: boolean;
}

interface DraftBreakdown {
  id: number | null;
  label: string;
  value: string;
  notes: string;
  savedValue: number | null;
  dirty: boolean;
  saving?: boolean;
}

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
  const [brkMonth, setBrkMonth] = useState<number>(0);
  const [drafts, setDrafts] = useState<Record<string, DraftEntry>>({});
  const [brkDrafts, setBrkDrafts] = useState<DraftBreakdown[]>([]);
  const [feedback, setFeedback] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    action: () => void | Promise<void>;
  } | null>(null);

  const filteredKpis = useMemo(
    () => (categorySlug === "all" ? kpis : kpis.filter((k) => k.category_slug === categorySlug)),
    [kpis, categorySlug],
  );

  const kpi = kpis.find((k) => k.slug === kpiSlug) ?? null;

  useEffect(() => {
    if (!kpi) return;
    setFeedback(null);
    if (kpi.unit_type === "breakdown") {
      const hasMonthlyBrk = breakdowns.some((b) => b.kpi_id === kpi.id && b.month > 0);
      if (hasMonthlyBrk) {
        const monthBrks = breakdowns.filter((b) => b.kpi_id === kpi.id && b.year === year && b.month === brkMonth);
        const drafts: DraftBreakdown[] = monthBrks.map((b) => ({
          id: b.id,
          label: b.label,
          value: String(b.value),
          notes: b.notes ?? "",
          savedValue: b.value,
          dirty: false,
        }));
        setBrkDrafts(drafts);
      } else {
        const yearBrks = breakdowns.filter((b) => b.kpi_id === kpi.id && b.year === year);
        const drafts: DraftBreakdown[] = yearBrks.map((b) => ({
          id: b.id,
          label: b.label,
          value: String(b.value),
          notes: b.notes ?? "",
          savedValue: b.value,
          dirty: false,
        }));
        setBrkDrafts(drafts);
      }
      setDrafts({});
      return;
    }

    const next: Record<string, DraftEntry> = {};
    if (kpi.reporting_frequency === "annual") {
      const existing = entries.find((e) => e.kpi_id === kpi.id && e.year === year && e.month === 0);
      next["0"] = {
        value: existing ? String(existing.value) : "",
        notes: existing?.notes ?? "",
        saved: existing?.value ?? null,
        dirty: false,
      };
    } else {
      for (let month = 1; month <= 12; month++) {
        const existing = entries.find((e) => e.kpi_id === kpi.id && e.year === year && e.month === month);
        next[String(month)] = {
          value: existing ? String(existing.value) : "",
          notes: existing?.notes ?? "",
          saved: existing?.value ?? null,
          dirty: false,
        };
      }
    }
    setDrafts(next);
    setBrkDrafts([]);
  }, [kpi, year, entries, breakdowns, brkMonth]);

  function setField(month: number, patch: Partial<Omit<DraftEntry, "saved" | "dirty" | "saving">>) {
    setDrafts((prev) => {
      const current = prev[String(month)] ?? { value: "", notes: "", saved: null, dirty: false };
      const next = { ...current, ...patch };
      const newValue = patch.value !== undefined ? patch.value : current.value;
      const newNotes = patch.notes !== undefined ? patch.notes : current.notes;
      next.dirty = newValue !== String(current.saved ?? "") || newNotes !== (current.notes ?? "");
      return { ...prev, [String(month)]: next };
    });
  }

  async function saveMonth(month: number) {
    if (!kpi) return;
    const draft = drafts[String(month)];
    if (!draft) return;
    if (draft.value === "" || Number.isNaN(Number(draft.value))) return;
    setDrafts((prev) => ({ ...prev, [String(month)]: { ...prev[String(month)], saving: true } }));
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
        setDrafts((prev) => ({ ...prev, [String(month)]: { ...prev[String(month)], saving: false } }));
        return;
      }
      const { entry } = await res.json();
      setDrafts((prev) => ({
        ...prev,
        [String(month)]: {
          value: String(entry.value),
          notes: entry.notes ?? "",
          saved: entry.value,
          dirty: false,
          saving: false,
        },
      }));
      setFeedback({ message: `Saved ${labelFor(month)} ${year}.`, variant: "success" });
    } catch (err) {
      console.error(err);
      setFeedback({ message: "Network error. Try again.", variant: "error" });
      setDrafts((prev) => ({ ...prev, [String(month)]: { ...prev[String(month)], saving: false } }));
    }
  }

  async function clearMonth(month: number) {
    if (!kpi) return;
    const draft = drafts[String(month)];
    if (!draft || draft.saved === null) return;
    setDrafts((prev) => ({ ...prev, [String(month)]: { ...prev[String(month)], saving: true } }));
    try {
      const res = await apiFetch("/api/entries", {
        method: "DELETE",
        body: {
          kpi_id: kpi.id,
          year,
          month,
        },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFeedback({ message: `Could not clear: ${data.error ?? "unknown error"}`, variant: "error" });
        setDrafts((prev) => ({ ...prev, [String(month)]: { ...prev[String(month)], saving: false } }));
        return;
      }
      setDrafts((prev) => ({
        ...prev,
        [String(month)]: {
          value: "",
          notes: "",
          saved: null,
          dirty: false,
          saving: false,
        },
      }));
      setFeedback({ message: `Cleared ${labelFor(month)} ${year}.`, variant: "success" });
    } catch (err) {
      console.error(err);
      setFeedback({ message: "Network error. Try again.", variant: "error" });
      setDrafts((prev) => ({ ...prev, [String(month)]: { ...prev[String(month)], saving: false } }));
    }
  }

  function updateBrk(idx: number, patch: Partial<Omit<DraftBreakdown, "savedValue" | "dirty" | "saving">>) {
    setBrkDrafts((prev) => {
      const current = prev[idx];
      if (!current) return prev;
      const next = { ...current, ...patch };
      next.dirty =
        next.label !== (current.savedValue !== null ? current.label : "") ||
        next.value !== String(current.savedValue ?? "") ||
        next.notes !== current.notes;
      const copy = [...prev];
      copy[idx] = next;
      return copy;
    });
  }

  async function saveBrk(idx: number) {
    if (!kpi) return;
    const d = brkDrafts[idx];
    if (!d || d.value === "" || Number.isNaN(Number(d.value)) || !d.label.trim()) return;
    setBrkDrafts((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], saving: true };
      return copy;
    });
    try {
      const res = await apiFetch("/api/breakdowns", {
        method: "POST",
        body: {
          id: d.id,
          kpi_id: kpi.id,
          year,
          month: brkMonth || undefined,
          label: d.label.trim(),
          value: Number(d.value),
          notes: d.notes || null,
        },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFeedback({ message: `Could not save: ${data.error ?? "unknown error"}`, variant: "error" });
        setBrkDrafts((prev) => {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], saving: false };
          return copy;
        });
        return;
      }
      const { entry } = await res.json();
      setBrkDrafts((prev) => {
        const copy = [...prev];
        copy[idx] = {
          id: entry.id,
          label: entry.label,
          value: String(entry.value),
          notes: entry.notes ?? "",
          savedValue: entry.value,
          dirty: false,
          saving: false,
        };
        return copy;
      });
      setFeedback({ message: `Saved "${entry.label}" for ${year}.`, variant: "success" });
    } catch (err) {
      console.error(err);
      setFeedback({ message: "Network error. Try again.", variant: "error" });
      setBrkDrafts((prev) => {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], saving: false };
        return copy;
      });
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
    setBrkDrafts((prev) => prev.filter((_, i) => i !== idx));
    setFeedback({ message: "Row removed.", variant: "success" });
  }

  function addBrkRow() {
    setBrkDrafts((prev) => [
      ...prev,
      { id: null, label: "", value: "", notes: "", savedValue: null, dirty: true },
    ]);
  }

  function labelFor(month: number) {
    return month === 0 ? `${year}` : MONTH_FULL[month - 1];
  }

  function requestClearMonth(month: number) {
    setConfirmation({
      title: `Clear ${labelFor(month)} ${year}?`,
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
      description: `This removes the breakdown row from ${year}. The action cannot be undone.`,
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

      <FilterToolbar className="mb-6">
        <FormField htmlFor="admin-category" label="Category" className="w-full md:w-auto md:min-w-[180px]">
          <Select
            id="admin-category"
            value={categorySlug}
            onChange={(e) => {
              setCategorySlug(e.target.value);
              setKpiSlug("");
            }}
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>{c.name}</option>
            ))}
          </Select>
        </FormField>

        <FormField htmlFor="admin-kpi" label="Metric" className="w-full md:min-w-[220px] md:flex-1">
          <Select
            id="admin-kpi"
            value={kpiSlug}
            onChange={(e) => setKpiSlug(e.target.value)}
          >
            <option value="">Select a metric…</option>
            {filteredKpis.map((k) => (
              <option key={k.slug} value={k.slug}>
                {k.name} ({k.unit_type})
              </option>
            ))}
          </Select>
        </FormField>

        <FormField htmlFor="admin-year" label="Year" className="w-full md:w-auto md:min-w-[120px]">
          <Select
            id="admin-year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </Select>
        </FormField>
      </FilterToolbar>

      {!kpi ? (
        <Card className="p-8">
          <EmptyState
            icon={FileSpreadsheet}
            title="Select a metric"
            description="Choose a category, metric, and year from the controls above to begin entering data."
          />
        </Card>
      ) : kpi.unit_type === "breakdown" ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-100 p-5">
            <div>
              <h2 className="text-xl font-semibold text-ink-900">{kpi.name}</h2>
              <p className="mt-1 text-sm text-ink-500">
                Breakdown · {year} · {kpi.unit}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {breakdowns.some((b) => b.kpi_id === kpi.id && b.month > 0) ? (
                <div className="min-w-[120px]">
                  <select
                    className="w-full rounded-md border border-ink-300 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    value={brkMonth}
                    onChange={(e) => setBrkMonth(Number(e.target.value))}
                  >
                    <option value={0}>Full year</option>
                    {MONTH_LABELS.map((m, i) => (
                      <option key={i} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              <Button variant="secondary" size="sm" onClick={addBrkRow}>Add row</Button>
            </div>
          </div>
          <div>
            {brkDrafts.map((d, idx) => (
              <div
                key={idx}
                className={cn(
                  "grid grid-cols-1 items-center gap-3 border-b border-ink-100 p-4 last:border-b-0 md:grid-cols-[minmax(180px,1fr)_140px_minmax(180px,1fr)_auto]",
                  d.dirty && "bg-brand-50/50 shadow-[inset_3px_0_0_var(--color-primary)]",
                )}
              >
                <Input
                  placeholder="Label (e.g. Foundation funders)"
                  value={d.label}
                  onChange={(e) => updateBrk(idx, { label: e.target.value })}
                />
                <Input
                  className="tabular"
                  inputMode="decimal"
                  placeholder="Value"
                  value={d.value}
                  onChange={(e) => updateBrk(idx, { value: e.target.value })}
                />
                <Input
                  placeholder="Notes (optional)"
                  value={d.notes}
                  onChange={(e) => updateBrk(idx, { notes: e.target.value })}
                />
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant={d.dirty ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => saveBrk(idx)}
                    isLoading={d.saving}
                    icon={Save}
                    disabled={!d.dirty}
                  >
                    Save
                  </Button>
                  <IconButton
                    icon={Trash2}
                    label={`Delete ${d.label || "row"}`}
                    variant="danger"
                    size="sm"
                    onClick={() => requestDeleteBreakdown(idx)}
                  />
                </div>
              </div>
            ))}
            {brkDrafts.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={FileSpreadsheet}
                  title={`No breakdown rows for ${year}`}
                  description="Add the first row to begin entering the composition for this metric."
                  action={<Button variant="secondary" onClick={addBrkRow}>Add row</Button>}
                />
              </div>
            ) : null}
          </div>
        </Card>
      ) : kpi.reporting_frequency === "annual" ? (
        <Card className="max-w-2xl p-5 lg:p-6">
          <h2 className="text-xl font-semibold text-ink-900">{kpi.name}</h2>
          <p className="mb-5 mt-1 text-sm text-ink-500">
            Annual metric · {year} · {kpi.unit} ({kpi.unit_type})
          </p>
          <AnnualEntryRow
            draft={drafts["0"]}
            onChange={(patch) => setField(0, patch)}
            onSave={() => saveMonth(0)}
            onClear={() => requestClearMonth(0)}
            year={year}
            unit={kpi.unit}
            unitType={kpi.unit_type}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-ink-100 p-5">
            <h2 className="text-xl font-semibold text-ink-900">{kpi.name}</h2>
            <p className="mt-1 text-sm text-ink-500">
              Monthly metric · {year} · {kpi.unit} ({kpi.unit_type})
            </p>
          </div>
          <div className="hidden grid-cols-[minmax(56px,0.55fr)_minmax(140px,1fr)_minmax(180px,1.5fr)_auto] gap-3 border-b border-ink-100 bg-ink-50 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500 md:grid">
            <span>Period</span>
            <span>Value</span>
            <span>Notes</span>
            <span className="text-right">Actions</span>
          </div>
          <div>
            {MONTH_LABELS.map((m, i) => {
              const month = i + 1;
              const draft = drafts[String(month)];
              if (!draft) return null;
              return (
                <MonthCell
                  key={month}
                  label={m}
                  draft={draft}
                  unit={kpi.unit}
                  unitType={kpi.unit_type}
                  onChange={(patch) => setField(month, patch)}
                  onSave={() => saveMonth(month)}
                  onClear={() => requestClearMonth(month)}
                />
              );
            })}
          </div>
        </Card>
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

function MonthCell({
  label,
  draft,
  unit,
  unitType,
  onChange,
  onSave,
  onClear,
}: {
  label: string;
  draft: DraftEntry;
  unit: string;
  unitType: KPIWithCategory["unit_type"];
  onChange: (patch: Partial<Omit<DraftEntry, "saved" | "dirty" | "saving">>) => void;
  onSave: () => void;
  onClear: () => void;
}) {
  return (
    <div
      className={cn("entry-row", draft.dirty && "entry-row-dirty")}
    >
      <div>
        <span className="block text-sm font-semibold text-ink-900">{label}</span>
        {draft.saved !== null ? (
          <span className="mt-1 block text-xs tabular text-ink-500">
            Saved {formatValue(draft.saved, unitType)}
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <Input
          className="min-w-0 flex-1 tabular"
          inputMode="decimal"
          placeholder="0"
          value={draft.value}
          onChange={(e) => onChange({ value: e.target.value })}
        />
        <span className="w-14 truncate text-right text-xs text-ink-500">{unit}</span>
      </div>
      <Input
        className="entry-notes text-sm"
        placeholder="Notes…"
        value={draft.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
      />
      <div className="flex items-center justify-end gap-2">
        <Button
          variant={draft.dirty ? "primary" : "secondary"}
          size="sm"
          onClick={onSave}
          isLoading={draft.saving}
          icon={Save}
          disabled={!draft.dirty}
        >
          Save
        </Button>
        <IconButton
          icon={Trash2}
          label={`Clear ${label}`}
          variant="danger"
          size="sm"
          onClick={onClear}
          disabled={draft.saved === null}
        />
      </div>
    </div>
  );
}

function AnnualEntryRow({
  draft,
  onChange,
  onSave,
  onClear,
  year,
  unit,
  unitType,
}: {
  draft: DraftEntry;
  onChange: (patch: Partial<Omit<DraftEntry, "saved" | "dirty" | "saving">>) => void;
  onSave: () => void;
  onClear: () => void;
  year: number;
  unit: string;
  unitType: KPIWithCategory["unit_type"];
}) {
  if (!draft) return <p className="text-sm text-ink-500">No draft.</p>;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          className="tabular max-w-[240px]"
          inputMode="decimal"
          placeholder={`Enter ${year} value`}
          value={draft.value}
          onChange={(e) => onChange({ value: e.target.value })}
        />
        <span className="text-xs text-ink-400">{unit}</span>
        {draft.saved !== null ? (
          <span className="text-xs text-ink-400 tabular">
            saved {formatValue(draft.saved, unitType)}
          </span>
        ) : null}
      </div>
      <Input
        className="text-sm"
        placeholder="Notes (optional)"
        value={draft.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
      />
      <div className="flex items-center gap-2">
        <Button
          variant={draft.dirty ? "primary" : "secondary"}
          size="sm"
          onClick={onSave}
          isLoading={draft.saving}
          icon={Save}
          disabled={!draft.dirty}
        >
          Save {year} value
        </Button>
        <IconButton
          icon={Trash2}
          label={`Clear ${year} value`}
          variant="danger"
          size="sm"
          onClick={onClear}
          disabled={draft.saved === null}
        />
      </div>
    </div>
  );
}
