"use client";

import { useEffect, useRef, useState } from "react";
import { AdminPasswordResetDialog } from "@/components/AdminPasswordResetDialog";
import { AdminUserCreateForm } from "@/components/AdminUserCreateForm";
import { Badge, Button, Chip, ConfirmDialog, EmptyState, FormField, Select, StatusBanner } from "@/components/ui";
import {
  buildCreateUserPayload,
  buildDisableUserSuccessMessage,
  buildEnableUserSuccessMessage,
  buildRoleChangeSuccessMessage,
  canResetAdminUserPassword,
  formatAdminUserCreatedDate,
  formatAdminUserStatus,
  isCurrentAdminUser,
} from "@/features/users/admin-users";
import type { Role, User } from "@/lib/types";
import { apiFetch } from "@/lib/api-client";
import { runEventHandler } from "@/lib/async-event";

interface UserMutationPayload {
  user?: User | null;
  users?: User[];
  error?: string;
}

/** Renders the user manager client interface. */
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
  const [creating, setCreating] = useState(false);
  const [selection, setSelection] = useState<"new" | number | null>(null);
  const returnFocusTarget = useRef<string | null>(null);

  useEffect(() => {
    if (selection !== null || returnFocusTarget.current === null) return;
    const target = returnFocusTarget.current;
    returnFocusTarget.current = null;
    requestAnimationFrame(() => document.getElementById(target)?.focus());
  }, [selection]);

  /** Implements the apply users payload operation. */
  function applyUsersPayload(data: UserMutationPayload) {
    if (data.users) setUsers(data.users);
  }

  /** Builds user. */
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
    if (data.user) setSelection(data.user.id);
  }

  /** Removes or resets password. */
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

  /** Removes or resets user. */
  async function deleteUser(id: number): Promise<boolean> {
    try {
      const res = await apiFetch("/api/users", {
        method: "DELETE",
        body: { id },
      });
      const data = await res.json().catch(() => ({})) as UserMutationPayload;
      if (!res.ok) {
        setFeedback({ message: `Could not delete user: ${data.error ?? res.status}`, variant: "error" });
        return false;
      }
      applyUsersPayload(data);
      setFeedback({ message: "User deleted.", variant: "success" });
      setSelection(null);
      return true;
    } catch {
      setFeedback({ message: "Could not delete user. Check the connection and try again.", variant: "error" });
      return false;
    }
  }

  /**
   * Apply a security-sensitive account change (role change or
   * disable/enable) via /api/users/account. The endpoint bumps the
   * user's sessions_valid_after watermark, which immediately
   * invalidates every session they currently hold (D8AD-CAN-003) —
   * a downgraded or disabled user is logged out on their next
   * request. Self-targeted changes are refused by the API.
   */
  async function patchAccount(
    id: number,
    body: { role?: Role; disabled?: boolean },
    successMessage: string,
  ): Promise<boolean> {
    setAccountBusy(id);
    try {
      const res = await apiFetch("/api/users/account", {
        method: "PATCH",
        body: { id, ...body },
      });
      const data = await res.json().catch(() => ({})) as UserMutationPayload;
      if (!res.ok) {
        setFeedback({ message: `Could not update account: ${data.error ?? res.status}`, variant: "error" });
        return false;
      }
      applyUsersPayload(data);
      setFeedback({ message: successMessage, variant: "success" });
      return true;
    } catch {
      setFeedback({ message: "Could not update account. Check the connection and try again.", variant: "error" });
      return false;
    } finally {
      setAccountBusy(null);
    }
  }

  /** Implements the change role operation. */
  async function changeRole(id: number, role: Role, name: string) {
    await patchAccount(id, { role }, buildRoleChangeSuccessMessage(name, role));
  }

  /** Implements the disable user operation. */
  async function disableUser(id: number, name: string): Promise<boolean> {
    return patchAccount(id, { disabled: true }, buildDisableUserSuccessMessage(name));
  }

  /** Implements the enable user operation. */
  async function enableUser(id: number, name: string) {
    await patchAccount(id, { disabled: false }, buildEnableUserSuccessMessage(name));
  }

  /** Implements the close reset dialog operation. */
  function closeResetDialog() {
    if (resetting) return;
    setResetTarget(null);
    setNewPassword("");
  }

  const selectedUser = typeof selection === "number"
    ? users.find((user) => user.id === selection) ?? null
    : null;

  return (
    <div className="min-w-0 page-enter">

      {feedback ? (
        <StatusBanner variant={feedback.variant} onDismiss={() => setFeedback(null)}>
          {feedback.message}
        </StatusBanner>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 items-start gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className={selection !== null ? "hidden min-w-0 lg:block" : "min-w-0"} aria-label="People list">
          <div className="flex items-center justify-between gap-3 border-b border-ink-200 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-ink-950">People</h2>
              <p className="mt-1 text-sm text-ink-600">{users.length} accounts</p>
            </div>
            <Button id="add-person-button" type="button" size="sm" variant="secondary" onClick={() => setSelection("new")}>Add person</Button>
          </div>
          <ul className="divide-y divide-ink-100 border-b border-ink-200">
            {users.map((user) => (
              <li key={user.id} className="flex items-center gap-2 py-2">
                <Button
                  id={`person-list-item-${user.id}`}
                  type="button"
                  variant="ghost"
                  fullWidth
                  className={`!justify-start ${selection === user.id ? "bg-brand-50" : ""}`}
                  onClick={() => setSelection(user.id)}
                >
                  {user.name}
                </Button>
                {user.disabled ? <Badge variant="warning" label="Account status">Disabled</Badge> : null}
              </li>
            ))}
          </ul>
        </aside>

        <section className={selection !== null ? "min-w-0" : "hidden min-w-0 lg:block"} aria-label="Person details">
          {selection !== null ? (
            <div className="mb-5 lg:hidden">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  returnFocusTarget.current = selection === "new"
                    ? "add-person-button"
                    : `person-list-item-${selection}`;
                  setSelection(null);
                }}
              >
                Back to list
              </Button>
            </div>
          ) : null}

          {selection === "new" ? (
            <AdminUserCreateForm
              isSubmitting={creating}
              onSubmit={async (event) => {
                event.preventDefault();
                setCreating(true);
                try {
                  await createUser(new FormData(event.currentTarget));
                } catch {
                  setFeedback({ message: "Could not create user. Check the connection and try again.", variant: "error" });
                } finally {
                  setCreating(false);
                }
              }}
            />
          ) : selectedUser ? (
            <div className="border-y border-ink-200 py-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-ink-950">{selectedUser.name}</h2>
                  <p className="mt-1 text-sm text-ink-600">{selectedUser.email}</p>
                </div>
                <div className="flex gap-2">
                  {isCurrentAdminUser(selectedUser, currentUserId) ? <Chip>You</Chip> : null}
                  <Badge variant={selectedUser.disabled ? "warning" : "success"} label="Account status">
                    {formatAdminUserStatus(selectedUser)}
                  </Badge>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <FormField label="Access" htmlFor={`person-role-${selectedUser.id}`}>
                  <Select
                    id={`person-role-${selectedUser.id}`}
                    value={selectedUser.role}
                    disabled={isCurrentAdminUser(selectedUser, currentUserId) || accountBusy === selectedUser.id}
                    onChange={(event) =>
                      runEventHandler(
                        changeRole,
                        selectedUser.id,
                        event.target.value as Role,
                        selectedUser.name,
                      )
                    }
                  >
                    <option value="viewer">Can view</option>
                    <option value="admin">Can edit</option>
                  </Select>
                </FormField>
                <div>
                  <p className="text-sm font-medium text-ink-700">Added</p>
                  <p className="mt-2 text-sm text-ink-900">{formatAdminUserCreatedDate(selectedUser.created_at)}</p>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap gap-3 border-t border-ink-200 pt-5">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!canResetAdminUserPassword(selectedUser)}
                  onClick={() => { setResetTarget(selectedUser); setNewPassword(""); }}
                >
                  Reset password
                </Button>
                {selectedUser.disabled ? (
                  <Button type="button" variant="secondary" disabled={accountBusy === selectedUser.id} onClick={() => enableUser(selectedUser.id, selectedUser.name)}>Enable account</Button>
                ) : (
                  <Button type="button" variant="secondary" disabled={isCurrentAdminUser(selectedUser, currentUserId) || accountBusy === selectedUser.id} onClick={() => setDisableTarget(selectedUser)}>Disable account</Button>
                )}
                <Button type="button" variant="danger" disabled={isCurrentAdminUser(selectedUser, currentUserId)} onClick={() => setDeleteTarget(selectedUser)}>Delete person</Button>
              </div>
            </div>
          ) : (
            <EmptyState title="Choose a person" description="Select a person from the list to review access." />
          )}
        </section>
      </div>

      <AdminPasswordResetDialog
        target={resetTarget}
        password={newPassword}
        isResetting={resetting}
        onPasswordChange={setNewPassword}
        onClose={closeResetDialog}
        onConfirm={() => {
          if (resetTarget) {
            runEventHandler(resetPassword, resetTarget.id, newPassword);
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name ?? "this user"}?`}
        description="This removes the account and immediately revokes access. The action cannot be undone."
        confirmLabel="Delete user"
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          const target = deleteTarget;
          if (target && await deleteUser(target.id)) setDeleteTarget(null);
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
          if (target && await disableUser(target.id, target.name)) {
            setDisableTarget(null);
          }
        }}
      />
    </div>
  );
}
