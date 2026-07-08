import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import { AppShell } from "@/components/AppShell";
import { AdminDataClient } from "./AdminDataClient";
import { loadAdminDataPageData } from "@/features/metrics/server";

export const dynamic = "force-dynamic";

export default async function AdminDataPage() {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");
  if (user.role !== "admin") redirect("/dashboard/overview");

  const data = loadAdminDataPageData();

  return (
    <AppShell user={user}>
      <AdminDataClient {...data} />
    </AppShell>
  );
}
