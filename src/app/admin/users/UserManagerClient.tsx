"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { User } from "@/lib/types";

export function UserManagerClient({
  currentUserId,
  users: initialUsers,
}: {
  currentUserId: number;
  users: User[];
}) {
  const [users, setUsers] = useState(initialUsers);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    }
  }

  async function createUser(form: FormData) {
    const payload = {
      email: String(form.get("email") || ""),
      name: String(form.get("name") || ""),
      password: String(form.get("password") || ""),
      role: (form.get("role") as "admin" | "viewer") || "viewer",
    };
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(`Could not create user: ${data.error}`);
      return;
    }
    setFeedback("User created.");
    (document.getElementById("create-user-form") as HTMLFormElement)?.reset();
    await refresh();
  }

  async function resetPassword(id: number) {
    const password = prompt("Enter a new password (8+ characters):");
    if (!password) return;
    if (password.length < 8) {
      setFeedback("Password must be at least 8 characters.");
      return;
    }
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, password }),
    });
    if (!res.ok) {
      setFeedback("Could not update password.");
      return;
    }
    setFeedback("Password updated.");
  }

  async function deleteUser(id: number, name: string) {
    if (id === currentUserId) {
      setFeedback("You cannot delete the account you are currently signed in as.");
      return;
    }
    if (!confirm(`Delete user "${name}"?`)) return;
    const res = await fetch("/api/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      setFeedback("Could not delete user.");
      return;
    }
    setFeedback("User deleted.");
    await refresh();
  }

  return (
    <div className="px-8 py-8 max-w-[1000px] mx-auto">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-500 mb-2">Admin · Users</p>
        <h1 className="text-3xl font-display font-semibold text-ink-900">Team & Access</h1>
        <p className="text-sm text-ink-500 mt-1">
          Admins can edit data; viewers can explore the dashboard.
        </p>
      </header>

      {feedback ? (
        <div className="mb-5 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {feedback}
        </div>
      ) : null}

      <form
        id="create-user-form"
        onSubmit={async (e) => {
          e.preventDefault();
          await createUser(new FormData(e.currentTarget));
        }}
        className="surface p-5 mb-6"
      >
        <h2 className="text-sm font-semibold text-ink-700 mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4" /> Invite a team member
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="label">Name</label>
            <input name="name" required className="input" placeholder="Full name" />
          </div>
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" required className="input" placeholder="name@easternstate.org" />
          </div>
          <div>
            <label className="label">Password</label>
            <input name="password" type="password" required minLength={8} className="input" placeholder="8+ characters" />
          </div>
          <div>
            <label className="label">Role</label>
            <select name="role" className="input" defaultValue="viewer">
              <option value="viewer">Viewer (read-only)</option>
              <option value="admin">Admin (full access)</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="submit" className="btn-primary">
            <Plus className="w-4 h-4" /> Create user
          </button>
        </div>
      </form>

      <div className="surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 bg-ink-50 border-b border-ink-200">
              <th className="text-left px-5 py-3">Name</th>
              <th className="text-left px-5 py-3">Email</th>
              <th className="text-left px-5 py-3">Role</th>
              <th className="text-left px-5 py-3">Created</th>
              <th className="text-right px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-ink-50/50">
                <td className="px-5 py-3 font-medium text-ink-900">
                  {user.name}
                  {user.id === currentUserId ? (
                    <span className="ml-2 text-[10px] uppercase font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                      You
                    </span>
                  ) : null}
                </td>
                <td className="px-5 py-3 text-ink-700">{user.email}</td>
                <td className="px-5 py-3">
                  <span
                    className={`pill ${
                      user.role === "admin"
                        ? "bg-brand-50 text-brand-800 border border-brand-200"
                        : "bg-ink-100 text-ink-700"
                    }`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="px-5 py-3 text-ink-500 text-xs">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="inline-flex gap-2">
                    <button onClick={() => resetPassword(user.id)} className="btn-secondary px-3 py-1.5">
                      Reset password
                    </button>
                    <button
                      onClick={() => deleteUser(user.id, user.name)}
                      disabled={user.id === currentUserId}
                      className="btn-danger px-2.5 py-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}