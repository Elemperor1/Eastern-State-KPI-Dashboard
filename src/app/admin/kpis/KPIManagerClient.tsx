"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Category, KPIWithCategory } from "@/lib/types";

type Tab = "kpis" | "categories";

export function KPIManagerClient({
  kpis: initialKpis,
  categories: initialCategories,
}: {
  kpis: KPIWithCategory[];
  categories: Category[];
}) {
  const [tab, setTab] = useState<Tab>("kpis");
  const [kpis, setKpis] = useState(initialKpis);
  const [categories, setCategories] = useState(initialCategories);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function refresh() {
    const [kpiRes, catRes] = await Promise.all([
      fetch("/api/kpis").then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
    ]);
    setKpis(kpiRes.kpis);
    setCategories(catRes.categories);
  }

  async function createKPI(form: FormData) {
    const payload = {
      category_id: Number(form.get("category_id")),
      slug: String(form.get("slug") || ""),
      name: String(form.get("name") || ""),
      unit: String(form.get("unit") || ""),
      format: (form.get("format") as "number" | "currency" | "percent") || "number",
      description: String(form.get("description") || "") || null,
    };
    const res = await fetch("/api/kpis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(`Could not create KPI: ${data.error}`);
      return;
    }
    setFeedback("KPI created.");
    await refresh();
  }

  async function deleteKPI(id: number, name: string) {
    if (!confirm(`Delete KPI "${name}"? This will also remove all its monthly entries.`)) return;
    const res = await fetch("/api/kpis", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const data = await res.json();
      setFeedback(`Could not delete: ${data.error}`);
      return;
    }
    setFeedback("KPI deleted.");
    await refresh();
  }

  async function createCategory(form: FormData) {
    const payload = {
      slug: String(form.get("slug") || ""),
      name: String(form.get("name") || ""),
      description: String(form.get("description") || "") || null,
    };
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(`Could not create category: ${data.error}`);
      return;
    }
    setFeedback("Category created.");
    await refresh();
  }

  async function deleteCategory(id: number, name: string) {
    if (!confirm(`Delete category "${name}"? This will also remove all its KPIs and entries.`)) return;
    const res = await fetch("/api/categories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const data = await res.json();
      setFeedback(`Could not delete: ${data.error}`);
      return;
    }
    setFeedback("Category deleted.");
    await refresh();
  }

  return (
    <div className="px-8 py-8 max-w-[1200px] mx-auto">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-500 mb-2">Admin · KPIs & Categories</p>
        <h1 className="text-3xl font-display font-semibold text-ink-900">
          Define what gets measured
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          Add new KPIs or categories. All changes are reflected immediately in the dashboard.
        </p>
      </header>

      <div className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5 shadow-soft mb-5">
        {(["kpis", "categories"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md ${
              tab === t ? "bg-brand-700 text-white" : "text-ink-700"
            }`}
          >
            {t === "kpis" ? `KPIs (${kpis.length})` : `Categories (${categories.length})`}
          </button>
        ))}
      </div>

      {feedback ? (
        <div className="mb-5 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {feedback}
        </div>
      ) : null}

      {tab === "kpis" ? (
        <div className="space-y-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await createKPI(new FormData(e.currentTarget));
              (e.currentTarget as HTMLFormElement).reset();
            }}
            className="surface p-5"
          >
            <h2 className="text-sm font-semibold text-ink-700 mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add a new KPI
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="label">Name</label>
                <input name="name" required className="input" placeholder="e.g. Newsletter Subscribers" />
              </div>
              <div>
                <label className="label">Slug (URL identifier)</label>
                <input
                  name="slug"
                  required
                  className="input"
                  pattern="[a-z0-9-]+"
                  placeholder="e.g. newsletter-subscribers"
                />
              </div>
              <div>
                <label className="label">Category</label>
                <select name="category_id" required className="input">
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Unit</label>
                <input name="unit" className="input" placeholder="e.g. subscribers" />
              </div>
              <div>
                <label className="label">Format</label>
                <select name="format" className="input" defaultValue="number">
                  <option value="number">Number</option>
                  <option value="currency">Currency (USD)</option>
                  <option value="percent">Percent</option>
                </select>
              </div>
              <div className="md:col-span-2 lg:col-span-3">
                <label className="label">Description</label>
                <input name="description" className="input" placeholder="What does this measure?" />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button type="submit" className="btn-primary">
                <Plus className="w-4 h-4" /> Create KPI
              </button>
            </div>
          </form>

          <div className="surface overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 bg-ink-50 border-b border-ink-200">
                  <th className="text-left px-5 py-3">Name</th>
                  <th className="text-left px-5 py-3">Category</th>
                  <th className="text-left px-5 py-3">Slug</th>
                  <th className="text-left px-5 py-3">Unit</th>
                  <th className="text-left px-5 py-3">Format</th>
                  <th className="text-right px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {kpis.map((kpi) => (
                  <tr key={kpi.id} className="hover:bg-ink-50/50">
                    <td className="px-5 py-3 font-medium text-ink-900">{kpi.name}</td>
                    <td className="px-5 py-3 text-ink-700">{kpi.category_name}</td>
                    <td className="px-5 py-3 text-ink-500 font-mono text-xs">{kpi.slug}</td>
                    <td className="px-5 py-3 text-ink-700">{kpi.unit || "—"}</td>
                    <td className="px-5 py-3">
                      <span className="pill bg-ink-100 text-ink-700">{kpi.format}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => deleteKPI(kpi.id, kpi.name)}
                        className="btn-danger px-2.5 py-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await createCategory(new FormData(e.currentTarget));
              (e.currentTarget as HTMLFormElement).reset();
            }}
            className="surface p-5"
          >
            <h2 className="text-sm font-semibold text-ink-700 mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add a new category
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Name</label>
                <input name="name" required className="input" placeholder="e.g. Education Outreach" />
              </div>
              <div>
                <label className="label">Slug</label>
                <input
                  name="slug"
                  required
                  className="input"
                  pattern="[a-z0-9-]+"
                  placeholder="e.g. education-outreach"
                />
              </div>
              <div className="md:col-span-2">
                <label className="label">Description</label>
                <input name="description" className="input" placeholder="What does this category group?" />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button type="submit" className="btn-primary">
                <Plus className="w-4 h-4" /> Create Category
              </button>
            </div>
          </form>

          <div className="surface overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 bg-ink-50 border-b border-ink-200">
                  <th className="text-left px-5 py-3">Name</th>
                  <th className="text-left px-5 py-3">Slug</th>
                  <th className="text-left px-5 py-3">Description</th>
                  <th className="text-right px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {categories.map((c) => (
                  <tr key={c.id} className="hover:bg-ink-50/50">
                    <td className="px-5 py-3 font-medium text-ink-900">{c.name}</td>
                    <td className="px-5 py-3 text-ink-500 font-mono text-xs">{c.slug}</td>
                    <td className="px-5 py-3 text-ink-700">{c.description || "—"}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => deleteCategory(c.id, c.name)}
                        className="btn-danger px-2.5 py-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}