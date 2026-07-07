import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import { AppShell } from "@/components/AppShell";
import { CategoryPageClient } from "./CategoryPageClient";
import { getCategoryBySlug } from "@/features/catalog/server";
import { resolveDashboardCompareState } from "@/features/reporting/period";
import {
  listDashboardYears,
  loadDashboardData,
} from "@/features/reporting/server";

export const dynamic = "force-dynamic";

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");

  const category = getCategoryBySlug(slug);
  if (!category) redirect("/dashboard/overview");

  const initialState = resolveDashboardCompareState(sp, listDashboardYears());

  // Single load with the correct year + through-month. Goals are computed
  // for exactly the selected year and pacing period — no stale values
  // from other years, no wasted double-load.
  const data = loadDashboardData({
    throughMonth: initialState.currentMonth,
    year: initialState.currentYear,
  });

  return (
    <AppShell user={user}>
      <CategoryPageClient data={data} categorySlug={slug} initialState={initialState} />
    </AppShell>
  );
}
