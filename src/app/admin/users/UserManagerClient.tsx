"use client";

import { useState } from "react";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import { Badge, Button, Card, FormField, Input, Select, IconButton, PageHeader, StatusBanner, Table } from "@/components/ui";
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

  async function resetPassword(id: number) {
    if (!confirm("Reset this user’s password to the default?")) return;
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      setFeedback({ message: "Could not reset password.", variant: "error" });
      return;
    }
    setFeedback({ message: "Password reset.", variant: "success" });
    await refresh();
  }

  async function deleteUser(id: number, name: string) {
    if (!confirm(`Delete user "${name}"?`)) return;
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
    <div className="px-6 py-6 lg:px-8 lg:py-8 max-w-[1000px] mx-auto">
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

      <Card className="p-5 mb-6">
        <form
          id="create-user-form"
          onSubmit={async (e) => {
            e.preventDefault();
            await createUser(new FormData(e.currentTarget));
          }}
        >
          <h2 className="text-sm font-semibold text-ink-900 mb-4 flex items-center gap-2">
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
          <tbody className="divide-y divide-ink-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-ink-50/50 transition-colors">
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
                      onClick={() => resetPassword(user.id)}
                    />
                    <IconButton
                      icon={Trash2}
                      label={`Delete user ${user.name}`}
                      variant="danger"
                      size="sm"
                      onClick={() => deleteUser(user.id, user.name)}
                      disabled={user.id === currentUserId}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
