"use client";

import { useState } from "react";
import { AdminPasswordResetDialog } from "@/components/AdminPasswordResetDialog";
import { AdminUserCreateForm } from "@/components/AdminUserCreateForm";
import { AdminUsersTable } from "@/components/AdminUsersTable";
import { ConfirmDialog, PageHeader, StatusBanner } from "@/components/ui";
import {
  buildCreateUserPayload,
  buildDisableUserSuccessMessage,
  buildEnableUserSuccessMessage,
  buildRoleChangeSuccessMessage,
} from "@/features/users/admin-users";
import type { Role, User } from "@/lib/types";
import { apiFetch } from "@/lib/api-client";

interface UserMutationPayload {
  user?: User | null;
  users?: User[];
  error?: string;
}

export function UserManagerClient({
  users: initialUsers,
  currentUserId,
}: {
  users: User[];
  currentUserId: number;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [feedback, setFeedback] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [disableTarget, setDisableTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [accountBusy, setAccountBusy] = useState<number | null>(null);

  function applyUsersPayload(data: UserMutationPayload) {
    if (data.users) setUsers(data.users);
  }

  async function createUser(form: FormData) {
    const res = await apiFetch("/api/users", {
      method: "POST",
      body: buildCreateUserPayload(form),
    });
    const data = await res.json() as UserMutationPayload;
    if (!res.ok) {
      setFeedback({ message: `Could not create user: ${data.error}`, variant: "error" });
      return;
    }
    applyUsersPayload(data);
    setFeedback({ message: "User created.", variant: "success" });
  }

  async function resetPassword(id: number, password: string) {
    setResetting(true);
    try {
      const res = await apiFetch("/api/users", {
        method: "PATCH",
        body: { id, password },
      });
      const data = await res.json().catch(() => ({})) as UserMutationPayload;
      if (!res.ok) {
        setFeedback({ message: `Could not reset password: ${data.error ?? res.status}`, variant: "error" });
        return;
      }
      applyUsersPayload(data);
      setFeedback({ message: "Temporary password set. The user must replace it at next login.", variant: "success" });
      setResetTarget(null);
      setNewPassword("");
    } finally {
      setResetting(false);
    }
  }

  async function deleteUser(id: number) {
    const res = await apiFetch("/api/users", {
      method: "DELETE",
      body: { id },
    });
    const data = await res.json().catch(() => ({})) as UserMutationPayload;
    if (!res.ok) {
      setFeedback({ message: `Could not delete user: ${data.error ?? res.status}`, variant: "error" });
      return;
    }
    applyUsersPayload(data);
    setFeedback({ message: "User deleted.", variant: "success" });
  }

  /**
   * Apply a security-sensitive account change (role change or
   * disable/enable) via /api/users/account. The endpoint bumps the
   * user's sessions_valid_after watermark, which immediately
   * invalidates every session they currently hold (D8AD-CAN-003) —
   * a downgraded or disabled user is logged out on their next
   * request. Self-targeted changes are refused by the API.
   */
  async function patchAccount(id: number, body: { role?: Role; disabled?: boolean }, successMessage: string) {
    setAccountBusy(id);
    try {
      const res = await apiFetch("/api/users/account", {
        method: "PATCH",
        body: { id, ...body },
      });
      const data = await res.json().catch(() => ({})) as UserMutationPayload;
      if (!res.ok) {
        setFeedback({ message: `Could not update account: ${data.error ?? res.status}`, variant: "error" });
        return;
      }
      applyUsersPayload(data);
      setFeedback({ message: successMessage, variant: "success" });
    } finally {
      setAccountBusy(null);
    }
  }

  async function changeRole(id: number, role: Role, name: string) {
    await patchAccount(id, { role }, buildRoleChangeSuccessMessage(name, role));
  }

  async function disableUser(id: number, name: string) {
    setDisableTarget(null);
    await patchAccount(id, { disabled: true }, buildDisableUserSuccessMessage(name));
  }

  async function enableUser(id: number, name: string) {
    await patchAccount(id, { disabled: false }, buildEnableUserSuccessMessage(name));
  }

  function closeResetDialog() {
    if (resetting) return;
    setResetTarget(null);
    setNewPassword("");
  }

  return (
    <div className="page-content page-enter">
      <PageHeader
        eyebrow="Admin · Users"
        title="Team & Access"
        subtitle="Admins can edit data; viewers can explore the dashboard."
      />

      {feedback ? (
        <StatusBanner variant={feedback.variant} onDismiss={() => setFeedback(null)}>
          {feedback.message}
        </StatusBanner>
      ) : null}

      <AdminUserCreateForm
        onSubmit={async (event) => {
          event.preventDefault();
          await createUser(new FormData(event.currentTarget));
        }}
      />

      <AdminUsersTable
        users={users}
        currentUserId={currentUserId}
        accountBusy={accountBusy}
        onRoleChange={changeRole}
        onDisableRequest={setDisableTarget}
        onEnable={enableUser}
        onResetRequest={(user) => {
          setResetTarget(user);
          setNewPassword("");
        }}
        onDeleteRequest={setDeleteTarget}
      />

      <AdminPasswordResetDialog
        target={resetTarget}
        password={newPassword}
        isResetting={resetting}
        onPasswordChange={setNewPassword}
        onClose={closeResetDialog}
        onConfirm={() => resetTarget && resetPassword(resetTarget.id, newPassword)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name ?? "this user"}?`}
        description="This removes the account and immediately revokes access. The action cannot be undone."
        confirmLabel="Delete user"
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) await deleteUser(target.id);
        }}
      />

      <ConfirmDialog
        open={Boolean(disableTarget)}
        title={`Disable ${disableTarget?.name ?? "this user"}?`}
        description="A disabled account cannot log in and is signed out of every active session immediately. The account can be re-enabled later."
        confirmLabel="Disable account"
        onClose={() => setDisableTarget(null)}
        onConfirm={async () => {
          const target = disableTarget;
          if (target) await disableUser(target.id, target.name);
        }}
      />
    </div>
  );
}
