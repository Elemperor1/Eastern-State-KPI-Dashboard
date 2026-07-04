import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { listUsers } from "@/lib/auth";
import { UserManagerClient } from "./UserManagerClient";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");
  if (user.role !== "admin") redirect("/dashboard/overview");

  return (
    <AppShell user={user}>
      <UserManagerClient currentUserId={user.id} users={listUsers()} />
    </AppShell>
  );
}