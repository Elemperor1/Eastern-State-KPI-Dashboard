"use client";

import { useState } from "react";
import { Plus, Trash2, RotateCcw } from "lucide-react";
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
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  async function refresh() {
    const res = await fetch("/api/users");
    const data = await res.json();
    setUsers(data.users);
  }

  async function createUser(form: FormData) {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name")),
        email: String(form.get("email")),
        password: String(form.get("password")),
        role: String(form.get("role")),
      }),
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
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, password }),
    });
    if (!res.ok) {
      setFeedback({ message: "Could not reset password.", variant: "error" });
      setResetting(false);
      return;
    }
    setFeedback({ message: "Password updated.", variant: "success" });
    setResetTarget(null);
    setNewPassword("");
    setResetting(false);
    await refresh();
  }

  async function deleteUser(id: number, name: string) {
    const res = await fetch("/api/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      setFeedback({ message: "Could not delete user.", variant: "error" });
      return;
    }
    setFeedback({ message: "User deleted.", variant: "success" });
    await refresh();
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
          <p className="mt-1 text-sm text-ink-500">{users.length} active accounts</p>
        </div>
        <Table minWidth="560px">
          <thead>
            <tr>
              <th className="text-left" scope="col">Name</th>
              <th className="text-left" scope="col">Email</th>
              <th className="text-left" scope="col">Role</th>
              <th className="text-left" scope="col">Created</th>
              <th className="text-right" scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="transition-colors hover:bg-ink-50/70">
                <td className="font-medium text-ink-900">
                  <span className="inline-flex items-center gap-2">
                    {user.name}
                    {user.id === currentUserId ? (
                      <Badge variant="success">You</Badge>
                    ) : null}
                  </span>
                </td>
                <td className="text-ink-700">{user.email}</td>
                <td className="">
                  <Badge variant={user.role === "admin" ? "info" : "default"}>
                    {user.role}
                  </Badge>
                </td>
                <td className="text-ink-500 text-xs">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
                <td className="text-right">
                  <div className="inline-flex gap-2">
                    <IconButton
                      icon={RotateCcw}
                      label={`Reset password for ${user.name}`}
                      variant="secondary"
                      size="sm"
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
                      disabled={user.id === currentUserId}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Dialog
        open={Boolean(resetTarget)}
        title={`Set a new password for ${resetTarget?.name ?? "this user"}`}
        description="Enter a temporary password with at least eight characters. Share it through an approved secure channel."
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
    </div>
  );
}
