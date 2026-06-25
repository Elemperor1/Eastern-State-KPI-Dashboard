"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, Trash2, FileSpreadsheet } from "lucide-react";
import { Button, Card, FormField, Input, Select, EmptyState, IconButton, PageHeader, StatusBanner } from "@/components/ui";
import { MONTH_FULL, MONTH_LABELS, formatValue } from "@/lib/analytics";
import { SampleDataBadge } from "@/components/SampleDataBadge";
import type {
  BreakdownEntryWithMeta,
  Category,
  KPIWithCategory,
  MonthlyEntryWithMeta,
} from "@/lib/types";

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
  const [drafts, setDrafts] = useState<Record<string, DraftEntry>>({});
  const [brkDrafts, setBrkDrafts] = useState<DraftBreakdown[]>([]);
  const [feedback, setFeedback] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  const filteredKpis = useMemo(
    () => (categorySlug === "all" ? kpis : kpis.filter((k) => k.category_slug === categorySlug)),
    [kpis, categorySlug],
  );

  const kpi = kpis.find((k) => k.slug === kpiSlug) ?? null;

  useEffect(() => {
    if (!kpi) return;
    setFeedback(null);
    if (kpi.unit_type === "breakdown") {
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
  }, [kpi, year, entries, breakdowns]);

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
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kpi_id: kpi.id,
          year,
          month,
          value: Number(draft.value),
          notes: draft.notes || null,
        }),
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
    if (!confirm(`Clear ${labelFor(month)} ${year}?`)) return;
    setDrafts((prev) => ({ ...prev, [String(month)]: { ...prev[String(month)], saving: true } }));
    try {
      const res = await fetch("/api/entries", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kpi_id: kpi.id,
          year,
          month,
        }),
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
      const res = await fetch("/api/breakdowns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: d.id,
          kpi_id: kpi.id,
          year,
          label: d.label.trim(),
          value: Number(d.value),
          notes: d.notes || null,
        }),
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
    if (d.id !== null && !confirm(`Delete "${d.label}"?`)) return;
    if (d.id !== null) {
      const res = await fetch("/api/breakdowns", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id }),
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

  return (
    <div className="px-6 py-6 lg:px-8 lg:py-8 max-w-[1200px] mx-auto">
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

      <div className="flex flex-wrap items-end gap-4 mb-6 no-print">
        <FormField htmlFor="admin-category" label="Category" className="min-w-[180px]">
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

        <FormField htmlFor="admin-kpi" label="Metric" className="min-w-[220px]">
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

        <FormField htmlFor="admin-year" label="Year" className="min-w-[120px]">
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
      </div>

      {!kpi ? (
        <Card className="p-8">
          <EmptyState
            icon={FileSpreadsheet}
            title="Select a metric"
            description="Choose a category, metric, and year from the controls above to begin entering data."
          />
        </Card>
      ) : kpi.unit_type === "breakdown" ? (
        <Card className="p-5 lg:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-ink-900">{kpi.name}</h2>
              <p className="text-xs text-ink-500 mt-0.5">
                Breakdown · {year} · {kpi.unit}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={addBrkRow}>+ Add row</Button>
          </div>
          <div className="space-y-3">
            {brkDrafts.map((d, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-[1fr_140px_1fr_auto_auto] gap-3 items-center">
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
                <Button
                  variant="primary"
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
                  onClick={() => deleteBrk(idx)}
                />
              </div>
            ))}
            {brkDrafts.length === 0 ? (
              <p className="text-sm text-ink-500 text-center py-4">No breakdown rows yet for {year}. Click “Add row” to begin.</p>
            ) : null}
          </div>
        </Card>
      ) : kpi.reporting_frequency === "annual" ? (
        <Card className="p-5 lg:p-6 max-w-xl">
          <h2 className="text-lg font-semibold text-ink-900 mb-1">{kpi.name}</h2>
          <p className="text-xs text-ink-500 mb-4">
            Annual metric · {year} · {kpi.unit} ({kpi.unit_type})
          </p>
          <AnnualEntryRow
            draft={drafts["0"]}
            onChange={(patch) => setField(0, patch)}
            onSave={() => saveMonth(0)}
            onClear={() => clearMonth(0)}
            year={year}
            unit={kpi.unit}
            unitType={kpi.unit_type}
          />
        </Card>
      ) : (
        <Card className="p-5 lg:p-6">
          <h2 className="text-lg font-semibold text-ink-900 mb-1">{kpi.name}</h2>
          <p className="text-xs text-ink-500 mb-4">
            Monthly metric · {year} · {kpi.unit} ({kpi.unit_type})
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                  onClear={() => clearMonth(month)}
                />
              );
            })}
          </div>
        </Card>
      )}
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
      className={`
        rounded-xl border p-4 transition-[border-color,background-color,box-shadow] duration-150
        ${draft.dirty ? "border-brand-400 bg-brand-50/30 shadow-sm" : "border-ink-200 bg-white"}
      `}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-ink-800">{label}</span>
        {draft.saved !== null ? (
          <span className="text-xs text-ink-400 tabular">
            saved {formatValue(draft.saved, unitType)}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 mb-3">
        <Input
          className="tabular flex-1"
          inputMode="decimal"
          placeholder="0"
          value={draft.value}
          onChange={(e) => onChange({ value: e.target.value })}
        />
        <span className="text-xs text-ink-400 w-14 truncate text-right">{unit}</span>
      </div>
      <Input
        className="text-xs mb-3"
        placeholder="Notes…"
        value={draft.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
      />
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          isLoading={draft.saving}
          icon={Save}
          disabled={!draft.dirty}
          className="flex-1"
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
          variant="primary"
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
