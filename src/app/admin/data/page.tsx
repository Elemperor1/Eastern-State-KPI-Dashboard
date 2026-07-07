import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import { AppShell } from "@/components/AppShell";
import { AdminDataClient } from "./AdminDataClient";
import { listCategories, listKPIs } from "@/features/catalog/server";
import { listBreakdowns, listEntries } from "@/features/metrics/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminDataPage() {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");
  if (user.role !== "admin") redirect("/dashboard/overview");

  const db = getDb();
  const metaRow = db.prepare("SELECT value FROM meta WHERE key = 'sample_data'").get() as
    | { value?: string }
    | undefined;
  const entries = listEntries();
  const breakdowns = listBreakdowns();

  return (
    <AppShell user={user}>
      <AdminDataClient
        kpis={listKPIs()}
        categories={listCategories()}
        entries={entries}
        breakdowns={breakdowns}
        years={Array.from(
          new Set([...entries.map((e) => e.year), ...breakdowns.map((b) => b.year)]),
        ).sort()}
        sampleData={metaRow?.value === "1"}
      />
    </AppShell>
  );
}
