import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { TrendExplorerClient } from "./TrendExplorerClient";
import { listCategories, listEntries, listKPIs } from "@/lib/repository";

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