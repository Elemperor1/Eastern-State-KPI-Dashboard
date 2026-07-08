import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import { AppShell } from "@/components/AppShell";
import { TrendExplorerClient } from "./TrendExplorerClient";
import { loadTrendExplorerPageData } from "@/features/reporting/server";

export const dynamic = "force-dynamic";

export default async function TrendsPage() {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");

  return (
    <AppShell user={user}>
      <TrendExplorerClient data={loadTrendExplorerPageData()} />
    </AppShell>
  );
}
