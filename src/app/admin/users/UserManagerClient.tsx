"use client";

import { useState } from "react";
import { Ban, Plus, Power, Trash2, RotateCcw } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  FormField,
  IconButton,
  Input,
  PageHeader,
  Select,
  StatusBanner,
  Table,
} from "@/components/ui";
import type { User } from "@/lib/types";
import { apiFetch } from "@/lib/api-client";

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

  async function refresh() {
    const res = await fetch("/api/users");
    const data = await res.json();
    setUsers(data.users);
  }

  async function createUser(form: FormData) {
    const res = await apiFetch("/api/users", {
      method: "POST",
      body: {
        name: String(form.get("name")),
        email: String(form.get("email")),
        password: String(form.get("password")),
        role: String(form.get("role")),
      },
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback({ message: `Could not create user: ${data.error}`, variant: "error" });
      return;
    }
    setFeedback({ message: "User created.", variant: "success" });
    await refresh();
  }

  async function resetPassword(id: number, password: string) {
    setResetting(true);
    const res = await apiFetch("/api/users", {
      method: "PATCH",
      body: { id, password },
    });
    if (!res.ok) {
      setFeedback({ message: "Could not reset password.", variant: "error" });
      setResetting(false);
      return;
    }
    setFeedback({ message: "Temporary password set. The user must replace it at next login.", variant: "success" });
    setResetTarget(null);
    setNewPassword("");
    setResetting(false);
    await refresh();
  }

  async function deleteUser(id: number, name: string) {
    const res = await apiFetch("/api/users", {
      method: "DELETE",
      body: { id },
    });
    if (!res.ok) {
      setFeedback({ message: "Could not delete user.", variant: "error" });
      return;
    }
    setFeedback({ message: "User deleted.", variant: "success" });
    await refresh();
  }

  /**
   * Apply a security-sensitive account change (role change or
   * disable/enable) via /api/users/account. The endpoint bumps the
   * user's sessions_valid_after watermark, which immediately
   * invalidates every session they currently hold (D8AD-CAN-003) —
   * a downgraded or disabled user is logged out on their next
   * request. Self-targeted changes are refused by the API.
   */
  async function patchAccount(id: number, body: { role?: "admin" | "viewer"; disabled?: boolean }, successMessage: string) {
    setAccountBusy(id);
    try {
      const res = await apiFetch("/api/users/account", {
        method: "PATCH",
        body: { id, ...body },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ message: `Could not update account: ${data.error ?? res.status}`, variant: "error" });
        return;
      }
      setFeedback({ message: successMessage, variant: "success" });
      await refresh();
    } finally {
      setAccountBusy(null);
    }
  }

  async function changeRole(id: number, role: "admin" | "viewer", name: string) {
    await patchAccount(id, { role }, `Role for ${name} updated to ${role}. Their active sessions were revoked.`);
  }

  async function disableUser(id: number, name: string) {
    setDisableTarget(null);
    await patchAccount(id, { disabled: true }, `${name} was disabled and signed out everywhere.`);
  }

  async function enableUser(id: number, name: string) {
    await patchAccount(id, { disabled: false }, `${name} was re-enabled.`);
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

      <Card className="mb-6 p-5 lg:p-6">
        <form
          id="create-user-form"
          onSubmit={async (e) => {
            e.preventDefault();
            await createUser(new FormData(e.currentTarget));
          }}
        >
          <h2 className="mb-5 flex items-center gap-2 text-xl font-semibold text-ink-900">
            <Plus className="w-4 h-4" /> Invite a team member
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <FormField label="Name">
              <Input name="name" required placeholder="Full name" />
            </FormField>
            <FormField label="Email">
              <Input name="email" type="email" required placeholder="name@easternstate.org" />
            </FormField>
            <FormField label="Password">
              <Input name="password" type="password" required minLength={8} placeholder="8+ characters" />
            </FormField>
            <FormField label="Role">
              <Select name="role" defaultValue="viewer">
                <option value="viewer">Viewer (read-only)</option>
                <option value="admin">Admin (full access)</option>
              </Select>
            </FormField>
          </div>
          <div className="mt-4 flex justify-end">
            <Button type="submit" variant="primary" icon={Plus}>Create user</Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-ink-100 p-5">
          <h2 className="text-xl font-semibold text-ink-900">Team members</h2>
          <p className="mt-1 text-sm text-ink-500">{users.length} accounts</p>
        </div>
        <Table minWidth="720px">
          <thead>
            <tr>
              <th className="text-left" scope="col">Name</th>
              <th className="text-left" scope="col">Email</th>
              <th className="text-left" scope="col">Role</th>
              <th className="text-left" scope="col">Status</th>
              <th className="text-left" scope="col">Created</th>
              <th className="text-right" scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              return (
                <tr key={user.id} className={`transition-colors hover:bg-ink-50/70 ${user.disabled ? "opacity-60" : ""}`}>
                  <td className="font-medium text-ink-900">
                    <span className="inline-flex items-center gap-2">
                      {user.name}
                      {isSelf ? (
                        <Badge variant="success">You</Badge>
                      ) : null}
                    </span>
                  </td>
                  <td className="text-ink-700">{user.email}</td>
                  <td className="">
                    {isSelf ? (
                      <Badge variant={user.role === "admin" ? "info" : "default"}>
                        {user.role}
                      </Badge>
                    ) : (
                      <Select
                        aria-label={`Role for ${user.name}`}
                        value={user.role}
                        disabled={accountBusy === user.id}
                        onChange={(e) =>
                          changeRole(
                            user.id,
                            e.target.value as "admin" | "viewer",
                            user.name,
                          )
                        }
                      >
                        <option value="viewer">viewer</option>
                        <option value="admin">admin</option>
                      </Select>
                    )}
                  </td>
                  <td className="">
                    {user.disabled ? (
                      <Badge variant="warning">Disabled</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </td>
                  <td className="text-ink-500 text-xs">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="text-right">
                    <div className="inline-flex gap-2">
                      {user.disabled ? (
                        <IconButton
                          icon={Power}
                          label={`Re-enable ${user.name}`}
                          variant="secondary"
                          size="sm"
                          disabled={isSelf || accountBusy === user.id}
                          onClick={() => enableUser(user.id, user.name)}
                        />
                      ) : (
                        <IconButton
                          icon={Ban}
                          label={`Disable ${user.name}`}
                          variant="secondary"
                          size="sm"
                          disabled={isSelf || accountBusy === user.id}
                          onClick={() => setDisableTarget(user)}
                        />
                      )}
                      <IconButton
                        icon={RotateCcw}
                        label={`Reset password for ${user.name}`}
                        variant="secondary"
                        size="sm"
                        disabled={user.disabled}
                        onClick={() => {
                          setResetTarget(user);
                          setNewPassword("");
                        }}
                      />
                      <IconButton
                        icon={Trash2}
                        label={`Delete user ${user.name}`}
                        variant="danger"
                        size="sm"
                        onClick={() => setDeleteTarget(user)}
                        disabled={isSelf}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Dialog
        open={Boolean(resetTarget)}
        title={`Set a new password for ${resetTarget?.name ?? "this user"}`}
        description="Enter a temporary password with at least eight characters. The user must replace it at their next login before reaching the dashboard. Share it through an approved secure channel."
        onClose={() => {
          if (resetting) return;
          setResetTarget(null);
          setNewPassword("");
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setResetTarget(null);
                setNewPassword("");
              }}
              disabled={resetting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => resetTarget && resetPassword(resetTarget.id, newPassword)}
              disabled={newPassword.length < 8}
              isLoading={resetting}
            >
              Update password
            </Button>
          </>
        }
      >
        <FormField htmlFor="reset-password" label="New temporary password" hint="Minimum 8 characters">
          <Input
            id="reset-password"
            type="password"
            autoFocus
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </FormField>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name ?? "this user"}?`}
        description="This removes the account and immediately revokes access. The action cannot be undone."
        confirmLabel="Delete user"
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) await deleteUser(target.id, target.name);
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
