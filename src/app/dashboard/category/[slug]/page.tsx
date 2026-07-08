import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import { AppShell } from "@/components/AppShell";
import { CategoryPageClient } from "./CategoryPageClient";
import { resolveDashboardCompareState } from "@/features/reporting/period";
import {
  listDashboardYears,
  loadCategoryPageData,
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
  const rawLegacy = Array.isArray(sp.legacy) ? sp.legacy[0] : sp.legacy;
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");

  const initialState = resolveDashboardCompareState(sp, listDashboardYears());

  const data = loadCategoryPageData(slug, {
    throughMonth: initialState.currentMonth,
    year: initialState.currentYear,
  });
  if (!data) redirect("/dashboard/overview");

  return (
    <AppShell user={user}>
      <CategoryPageClient
        data={data}
        categorySlug={slug}
        initialState={initialState}
        legacyPdfEnabled={rawLegacy === "1"}
      />
    </AppShell>
  );
}
