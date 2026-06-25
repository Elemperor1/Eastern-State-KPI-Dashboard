import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { TrendExplorerClient } from "./TrendExplorerClient";
import { listCategories, listEntries, listKPIs } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function TrendsPage() {
  const session = await getSession();
  if (!session.user) redirect("/login");

  return (
    <AppShell user={session.user}>
      <TrendExplorerClient
        kpis={listKPIs()}
        categories={listCategories()}
        entries={listEntries()}
        years={Array.from(new Set(listEntries().map((e) => e.year))).sort()}
      />
    </AppShell>
  );
}