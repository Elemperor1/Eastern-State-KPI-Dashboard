"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  FormField,
  IconButton,
  Input,
  PageHeader,
  Select,
  StatusBanner,
  Table,
  Tabs,
} from "@/components/ui";
import type { Category, KPIWithCategory, UnitType, ReportingFrequency, Direction } from "@/lib/types";

type Tab = "kpis" | "categories";

const UNIT_TYPES: UnitType[] = ["count", "percent", "currency", "attendance", "note", "breakdown"];
const FREQUENCIES: ReportingFrequency[] = ["monthly", "annual", "flexible"];
const DIRECTIONS: Direction[] = ["higher", "lower", "neutral"];

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
  const [feedback, setFeedback] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    action: () => void | Promise<void>;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);

  const filteredKpis = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return kpis.filter((k) => {
      if (categoryFilter !== null && k.category_id !== categoryFilter) return false;
      if (!needle) return true;
      return (
        k.name.toLowerCase().includes(needle) ||
        k.slug.toLowerCase().includes(needle)
      );
    });
  }, [kpis, query, categoryFilter]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const k of kpis) counts.set(k.category_id, (counts.get(k.category_id) ?? 0) + 1);
    return counts;
  }, [kpis]);

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
      unit_type: String(form.get("unit_type") || "count"),
      reporting_frequency: String(form.get("reporting_frequency") || "monthly"),
      direction: String(form.get("direction") || "higher"),
      description: String(form.get("description") || "") || null,
    };
    const res = await fetch("/api/kpis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback({ message: `Could not create KPI: ${data.error}`, variant: "error" });
      return;
    }
    setFeedback({ message: "KPI created.", variant: "success" });
    await refresh();
  }

  async function deleteKPI(id: number, name: string) {
    const res = await fetch("/api/kpis", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const data = await res.json();
      setFeedback({ message: `Could not delete: ${data.error}`, variant: "error" });
      return;
    }
    setFeedback({ message: "KPI deleted.", variant: "success" });
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
      setFeedback({ message: `Could not create category: ${data.error}`, variant: "error" });
      return;
    }
    setFeedback({ message: "Category created.", variant: "success" });
    await refresh();
  }

  async function deleteCategory(id: number, name: string) {
    const res = await fetch("/api/categories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const data = await res.json();
      setFeedback({ message: `Could not delete: ${data.error}`, variant: "error" });
      return;
    }
    setFeedback({ message: "Category deleted.", variant: "success" });
    await refresh();
  }

  function requestDeleteKPI(id: number, name: string) {
    setConfirmation({
      title: `Delete “${name}”?`,
      description: "This also removes every entry associated with this KPI. The action cannot be undone.",
      confirmLabel: "Delete KPI",
      action: () => deleteKPI(id, name),
    });
  }

  function requestDeleteCategory(id: number, name: string) {
    setConfirmation({
      title: `Delete “${name}”?`,
      description: "This also removes the category’s KPIs and all associated entries. The action cannot be undone.",
      confirmLabel: "Delete category",
      action: () => deleteCategory(id, name),
    });
  }

  return (
    <div className="page-content page-enter">
      <PageHeader
        eyebrow="Admin · KPIs & Categories"
        title="Define what gets measured"
        subtitle="Add new KPIs or categories. Each KPI defines its unit type, reporting frequency, and direction."
      />

      {feedback ? (
        <StatusBanner variant={feedback.variant} onDismiss={() => setFeedback(null)}>
          {feedback.message}
        </StatusBanner>
      ) : null}

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "kpis", label: `KPIs (${kpis.length})` },
          { value: "categories", label: `Categories (${categories.length})` },
        ]}
        className="mb-6"
      />

      {tab === "kpis" ? (
        <div className="space-y-6">
          <Card className="p-5 lg:p-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await createKPI(new FormData(e.currentTarget));
                (e.currentTarget as HTMLFormElement).reset();
              }}
            >
              <h2 className="mb-5 flex items-center gap-2 text-xl font-semibold text-ink-900">
                <Plus className="w-4 h-4" /> Add a new KPI
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <FormField label="Name" className="md:col-span-2">
                  <Input name="name" required placeholder="e.g. Virtual program attendees" />
                </FormField>
                <FormField label="Slug">
                  <Input name="slug" required placeholder="virtual-attendees" pattern="[a-z0-9-]+" />
                </FormField>
                <FormField label="Category">
                  <Select name="category_id" required defaultValue={categories[0]?.id}>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Unit label">
                  <Input name="unit" required placeholder="e.g. people" />
                </FormField>
                <FormField label="Unit type">
                  <Select name="unit_type" defaultValue="count">
                    {UNIT_TYPES.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Frequency">
                  <Select name="reporting_frequency" defaultValue="monthly">
                    {FREQUENCIES.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Direction">
                  <Select name="direction" defaultValue="higher">
                    {DIRECTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d === "higher" ? "higher is better" : d === "lower" ? "lower is better" : "neutral"}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Description" className="md:col-span-2 lg:col-span-3">
                  <Input name="description" placeholder="Optional" />
                </FormField>
              </div>
              <div className="mt-4 flex justify-end">
                <Button type="submit" variant="primary" size="sm" icon={Plus}>Create KPI</Button>
              </div>
            </form>
          </Card>

          <Card className="overflow-hidden">
            <div className="space-y-4 border-b border-ink-100 p-5">
              <div>
                <h2 className="text-xl font-semibold text-ink-900">Existing KPIs</h2>
                <p className="mt-1 text-sm text-ink-500">
                  Showing {filteredKpis.length} of {kpis.length} measures across {categories.length} categories
                </p>
              </div>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative max-w-sm flex-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name or slug…"
                    aria-label="Search KPIs by name or slug"
                    className="pl-9"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip
                    type="button"
                    active={categoryFilter === null}
                    onClick={() => setCategoryFilter(null)}
                  >
                    All ({kpis.length})
                  </Chip>
                  {categories.map((c) => (
                    <Chip
                      key={c.id}
                      type="button"
                      active={categoryFilter === c.id}
                      onClick={() =>
                        setCategoryFilter((prev) => (prev === c.id ? null : c.id))
                      }
                    >
                      {c.name} ({categoryCounts.get(c.id) ?? 0})
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
            <Table minWidth="640px">
              <thead>
                <tr>
                  <th className="text-left" scope="col">Metric</th>
                  <th className="text-left" scope="col">Category</th>
                  <th className="text-left" scope="col">Type</th>
                  <th className="text-left" scope="col">Frequency</th>
                  <th className="text-left" scope="col">Direction</th>
                  <th className="text-right" scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {filteredKpis.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-ink-500">
                      No KPIs match the current filters.
                    </td>
                  </tr>
                ) : null}
                {filteredKpis.map((k) => (
                  <tr key={k.id} className="transition-colors hover:bg-ink-50/70">
                    <td className="py-3 pr-4">
                      <span className="font-medium text-ink-900">{k.name}</span>
                      <span className="block text-xs text-ink-400">{k.slug} · {k.unit}</span>
                    </td>
                    <td className="text-ink-700">{k.category_name}</td>
                    <td className="text-ink-700">{k.unit_type}</td>
                    <td className="text-ink-700">{k.reporting_frequency}</td>
                    <td className="text-ink-700">{k.direction}</td>
                    <td className="text-right">
                      <IconButton
                        icon={Trash2}
                        label={`Delete KPI ${k.name}`}
                        variant="danger"
                        size="sm"
                        onClick={() => requestDeleteKPI(k.id, k.name)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="p-5 lg:p-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await createCategory(new FormData(e.currentTarget));
                (e.currentTarget as HTMLFormElement).reset();
              }}
            >
              <h2 className="mb-5 flex items-center gap-2 text-xl font-semibold text-ink-900">
                <Plus className="w-4 h-4" /> Add a new category
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField label="Name">
                  <Input name="name" required placeholder="Education" />
                </FormField>
                <FormField label="Slug">
                  <Input name="slug" required placeholder="education" pattern="[a-z0-9-]+" />
                </FormField>
                <FormField label="Description">
                  <Input name="description" placeholder="Optional" />
                </FormField>
              </div>
              <div className="mt-4 flex justify-end">
                <Button type="submit" variant="primary" size="sm" icon={Plus}>Create category</Button>
              </div>
            </form>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-ink-100 p-5">
              <h2 className="text-xl font-semibold text-ink-900">Existing categories</h2>
              <p className="mt-1 text-sm text-ink-500">{categories.length} reporting areas</p>
            </div>
            <div className="space-y-2">
              {categories.map((c) => (
                <div key={c.id} className="flex items-start justify-between border-b border-ink-100 p-4 transition-colors last:border-b-0 hover:bg-ink-50/70">
                  <div className="min-w-0">
                    <span className="font-medium text-ink-900">{c.name}</span>
                    <span className="ml-2 text-xs text-ink-400">{c.slug}</span>
                    {c.description ? <p className="text-xs text-ink-500 mt-0.5 text-pretty">{c.description}</p> : null}
                  </div>
                  <IconButton
                    icon={Trash2}
                    label={`Delete category ${c.name}`}
                    variant="danger"
                    size="sm"
                    onClick={() => requestDeleteCategory(c.id, c.name)}
                    className="shrink-0 ml-3"
                  />
                </div>
              ))}
            </div>
          </Card>
        </div>
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
