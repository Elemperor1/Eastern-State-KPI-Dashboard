"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Save, Trash2 } from "lucide-react";
import clsx from "clsx";
import { MONTH_FULL, MONTH_LABELS, formatValue } from "@/lib/analytics";
import type {
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

export function AdminDataClient({
  kpis,
  categories,
  entries,
  years,
}: {
  kpis: KPIWithCategory[];
  categories: Category[];
  entries: MonthlyEntryWithMeta[];
  years: number[];
}) {
  const [categorySlug, setCategorySlug] = useState<string>("all");
  const [kpiSlug, setKpiSlug] = useState<string>(kpis[0]?.slug ?? "");
  const [year, setYear] = useState<number>(years[years.length - 1] ?? new Date().getFullYear());
  const [drafts, setDrafts] = useState<Record<string, DraftEntry>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const filteredKpis = useMemo(
    () => (categorySlug === "all" ? kpis : kpis.filter((k) => k.category_slug === categorySlug)),
    [kpis, categorySlug],
  );

  const kpi = kpis.find((k) => k.slug === kpiSlug) ?? null;

  // Load drafts whenever KPI/year changes.
  useEffect(() => {
    if (!kpi) return;
    const next: Record<string, DraftEntry> = {};
    for (let month = 1; month <= 12; month++) {
      const existing = entries.find((e) => e.kpi_id === kpi.id && e.year === year && e.month === month);
      const key = `${month}`;
      next[key] = {
        value: existing ? String(existing.value) : "",
        notes: existing?.notes ?? "",
        saved: existing?.value ?? null,
        dirty: false,
      };
    }
    setDrafts(next);
    setFeedback(null);
  }, [kpi, year, entries]);

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
        setFeedback(`Could not save ${MONTH_LABELS[month - 1]}: ${data.error ?? "unknown error"}`);
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
      setFeedback(`Saved ${MONTH_LABELS[month - 1]} ${year}.`);
    } catch (err) {
      console.error(err);
      setFeedback("Network error while saving.");
      setDrafts((prev) => ({ ...prev, [String(month)]: { ...prev[String(month)], saving: false } }));
    }
  }

  async function clearMonth(month: number) {
    if (!kpi) return;
    const draft = drafts[String(month)];
    if (!draft?.saved) return;
    if (!confirm(`Delete the ${MONTH_LABELS[month - 1]} ${year} entry for ${kpi.name}?`)) return;
    try {
      // To keep the contract simple we use the POST endpoint with empty value
      // through a DELETE on the row id — but our API uses id-based delete.
      const existing = entries.find(
        (e) => e.kpi_id === kpi.id && e.year === year && e.month === month,
      );
      if (!existing) return;
      const res = await fetch("/api/entries", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: existing.id }),
      });
      if (!res.ok) {
        setFeedback("Could not delete entry.");
        return;
      }
      setDrafts((prev) => ({
        ...prev,
        [String(month)]: { value: "", notes: "", saved: null, dirty: false },
      }));
      setFeedback(`Deleted ${MONTH_LABELS[month - 1]} ${year}.`);
    } catch (err) {
      console.error(err);
      setFeedback("Network error while deleting.");
    }
  }

  async function saveAll() {
    const months = Object.entries(drafts)
      .filter(([, d]) => d.dirty)
      .map(([m]) => Number(m));
    for (const m of months) {
      // eslint-disable-next-line no-await-in-loop
      await saveMonth(m);
    }
  }

  const dirtyCount = Object.values(drafts).filter((d) => d.dirty).length;

  return (
    <div className="px-8 py-8 max-w-[1400px] mx-auto">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-500 mb-2">Admin · Data Entry</p>
        <h1 className="text-3xl font-display font-semibold text-ink-900">
          Monthly KPI Values
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          Enter or edit values. Changes are saved per cell — your work is preserved if you switch KPIs.
        </p>
      </header>

      <div className="surface p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="label">Category</label>
            <select
              className="input"
              value={categorySlug}
              onChange={(e) => {
                setCategorySlug(e.target.value);
                setKpiSlug("");
              }}
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">KPI</label>
            <select
              className="input"
              value={kpiSlug}
              onChange={(e) => setKpiSlug(e.target.value)}
            >
              <option value="" disabled>
                Select a KPI
              </option>
              {filteredKpis.map((k) => (
                <option key={k.id} value={k.slug}>
                  {k.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Year</label>
            <select
              className="input"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
              <option value={new Date().getFullYear() + 1}>
                {new Date().getFullYear() + 1} (new)
              </option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={saveAll}
              disabled={!kpi || dirtyCount === 0}
              className="btn-primary w-full"
            >
              <Save className="w-4 h-4" />
              Save {dirtyCount > 0 ? `${dirtyCount} change${dirtyCount === 1 ? "" : "s"}` : "all"}
            </button>
          </div>
        </div>
        {kpi ? (
          <p className="text-xs text-ink-500 mt-3">
            <span className="font-semibold text-ink-700">{kpi.name}</span> · {kpi.category_name} ·{" "}
            {kpi.unit || "no unit"} · format: {kpi.format}
          </p>
        ) : null}
        {feedback ? (
          <p className="mt-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-1.5 inline-block">
            {feedback}
          </p>
        ) : null}
      </div>

      {!kpi ? (
        <div className="surface p-12 text-center text-sm text-ink-500">
          Select a category and KPI to begin entering data.
        </div>
      ) : (
        <div className="surface overflow-hidden">
          <div className="grid grid-cols-12 text-[11px] uppercase tracking-wider font-semibold text-ink-500 bg-ink-50 border-b border-ink-200 px-5 py-3">
            <div className="col-span-3">Month</div>
            <div className="col-span-3">Value</div>
            <div className="col-span-4">Notes (optional)</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>
          <div className="divide-y divide-ink-100">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
              const draft = drafts[String(month)] ?? { value: "", notes: "", saved: null, dirty: false };
              return (
                <div
                  key={month}
                  className={clsx(
                    "grid grid-cols-12 items-center px-5 py-3",
                    draft.dirty && "bg-amber-50/50",
                  )}
                >
                  <div className="col-span-3 text-sm text-ink-700 font-medium">
                    {MONTH_FULL[month - 1]}
                  </div>
                  <div className="col-span-3 pr-3">
                    <input
                      className="input tabular"
                      inputMode="decimal"
                      placeholder="—"
                      value={draft.value}
                      onChange={(e) => setField(month, { value: e.target.value })}
                    />
                    {draft.saved !== null ? (
                      <p className="text-[10px] text-ink-400 mt-1 tabular">
                        Last saved: {formatValue(draft.saved, kpi.format)}
                      </p>
                    ) : null}
                  </div>
                  <div className="col-span-4 pr-3">
                    <input
                      className="input"
                      placeholder="Context or notes for the editor…"
                      value={draft.notes}
                      onChange={(e) => setField(month, { notes: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-2">
                    <button
                      onClick={() => saveMonth(month)}
                      disabled={!draft.dirty || draft.saving}
                      className="btn-secondary px-2.5 py-1.5"
                      title="Save this month"
                    >
                      <Save className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => clearMonth(month)}
                      disabled={!draft.saved}
                      className="btn-danger px-2.5 py-1.5"
                      title="Delete this entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}