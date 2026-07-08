import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import { AppShell } from "@/components/AppShell";
import { listUsers } from "@/features/users/server";
import { UserManagerClient } from "./UserManagerClient";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");
  if (user.role !== "admin") redirect("/dashboard/overview");

  return (
    <AppShell user={user}>
      <UserManagerClient currentUserId={user.id} users={listUsers()} />
    </AppShell>
  );
}
