import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { listUsers } from "@/lib/auth";
import { UserManagerClient } from "./UserManagerClient";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await getSession();
  if (!session.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/dashboard/overview");

  return (
    <AppShell active="/admin/users">
      <UserManagerClient currentUserId={session.user.id} users={listUsers()} />
    </AppShell>
  );
}