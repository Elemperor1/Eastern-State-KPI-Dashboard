import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import { AppShell } from "@/components/AppShell";
import { TrendExplorerClient } from "./TrendExplorerClient";
import { listCategories, listKPIs } from "@/features/catalog/server";
import { listEntries } from "@/features/metrics/server";

export const dynamic = "force-dynamic";

export default async function TrendsPage() {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");

  return (
    <AppShell user={user}>
      <TrendExplorerClient
        kpis={listKPIs()}
        categories={listCategories()}
        entries={listEntries()}
        years={Array.from(new Set(listEntries().map((e) => e.year))).sort()}
      />
    </AppShell>
  );
}
