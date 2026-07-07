import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { CategoryPageClient } from "./CategoryPageClient";
import { loadDashboardData } from "@/lib/dashboard-data";
import { getCategoryBySlug, listEntries, listBreakdowns } from "@/lib/repository";
import { defaultComparisonPair } from "@/lib/analytics";

export const dynamic = "force-dynamic";

function parseThroughMonth(raw: string | string[] | undefined, fallbackYear: number): number {
  const parsed = Number(Array.isArray(raw) ? raw[0] : raw);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 12) return Math.round(parsed);
  const now = new Date();
  return fallbackYear === now.getFullYear() ? Math.min(now.getMonth() + 1, 12) : 12;
}

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

  // Determine the selected year + month from URL params, falling back to
  // the latest available data year. Computing the fallback requires knowing
  // the available years, which come from entries + breakdowns (lightweight
  // queries that don't need the full dashboard data load).
  const urlYear = Number(sp.currentYear);
  const hasUrlYear = Number.isFinite(urlYear) && urlYear > 0;
  const years = Array.from(
    new Set([
      ...listEntries().map((e) => e.year),
      ...listBreakdowns().map((b) => b.year),
    ]),
  ).sort((a, b) => a - b);
  const fallbackPair = defaultComparisonPair(years);

  const currentYear = hasUrlYear ? urlYear : fallbackPair.currentYear;
  const compareYear = Number(sp.compareYear) || fallbackPair.compareYear;
  const currentMonth = parseThroughMonth(sp.currentMonth, currentYear);

  // Single load with the correct year + through-month. Goals are computed
  // for exactly the selected year and pacing period — no stale values
  // from other years, no wasted double-load.
  const data = loadDashboardData({ throughMonth: currentMonth, year: currentYear });

  const initialState = {
    currentYear,
    compareYear,
    currentMonth,
  };

  return (
    <AppShell user={user}>
      <CategoryPageClient data={data} categorySlug={slug} initialState={initialState} />
    </AppShell>
  );
}