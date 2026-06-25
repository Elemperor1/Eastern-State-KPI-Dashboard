import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { CategoryPageClient } from "./CategoryPageClient";
import { loadDashboardData } from "@/lib/dashboard-data";
import { getCategoryBySlug } from "@/lib/repository";
import { defaultComparisonPair } from "@/lib/analytics";

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
  const session = await getSession();
  if (!session.user) redirect("/login");

  const data = loadDashboardData();
  const category = getCategoryBySlug(slug);
  if (!category) redirect("/dashboard/overview");

  const fallbackPair = defaultComparisonPair(data.years);

  function parseThroughMonth(raw: string | string[] | undefined, fallbackYear: number): number {
    const parsed = Number(Array.isArray(raw) ? raw[0] : raw);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 12) return Math.round(parsed);
    const now = new Date();
    return fallbackYear === now.getFullYear() ? Math.min(now.getMonth() + 1, 12) : 12;
  }

  const initialState = {
    currentYear: Number(sp.currentYear) || fallbackPair.currentYear,
    compareYear: Number(sp.compareYear) || fallbackPair.compareYear,
    currentMonth: parseThroughMonth(sp.currentMonth, fallbackPair.currentYear),
  };

  return (
    <AppShell user={session.user}>
      <CategoryPageClient data={data} categorySlug={slug} initialState={initialState} />
    </AppShell>
  );
}
