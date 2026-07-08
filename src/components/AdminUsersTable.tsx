"use client";

import { Ban, Power, RotateCcw, Trash2 } from "lucide-react";
import { Badge, Card, IconButton, Select, Table } from "@/components/ui";
import {
  canResetAdminUserPassword,
  formatAdminUserCreatedDate,
  formatAdminUserStatus,
  isCurrentAdminUser,
} from "@/features/users/admin-users";
import type { Role, User } from "@/lib/types";

interface AdminUsersTableProps {
  users: User[];
  currentUserId: number;
  accountBusy: number | null;
  onRoleChange: (id: number, role: Role, name: string) => void;
  onDisableRequest: (user: User) => void;
  onEnable: (id: number, name: string) => void;
  onResetRequest: (user: User) => void;
  onDeleteRequest: (user: User) => void;
}

export function AdminUsersTable({
  users,
  currentUserId,
  accountBusy,
  onRoleChange,
  onDisableRequest,
  onEnable,
  onResetRequest,
  onDeleteRequest,
}: AdminUsersTableProps) {
  return (
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
            const isSelf = isCurrentAdminUser(user, currentUserId);
            const status = formatAdminUserStatus(user);
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
                <td>
                  {isSelf ? (
                    <Badge variant={user.role === "admin" ? "info" : "default"}>
                      {user.role}
                    </Badge>
                  ) : (
                    <Select
                      aria-label={`Role for ${user.name}`}
                      value={user.role}
                      disabled={accountBusy === user.id}
                      onChange={(event) => onRoleChange(user.id, event.target.value as Role, user.name)}
                    >
                      <option value="viewer">viewer</option>
                      <option value="admin">admin</option>
                    </Select>
                  )}
                </td>
                <td>
                  {status === "Disabled" ? (
                    <Badge variant="warning">Disabled</Badge>
                  ) : (
                    <Badge variant="success">Active</Badge>
                  )}
                </td>
                <td className="text-xs text-ink-500">
                  {formatAdminUserCreatedDate(user.created_at)}
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
                        onClick={() => onEnable(user.id, user.name)}
                      />
                    ) : (
                      <IconButton
                        icon={Ban}
                        label={`Disable ${user.name}`}
                        variant="secondary"
                        size="sm"
                        disabled={isSelf || accountBusy === user.id}
                        onClick={() => onDisableRequest(user)}
                      />
                    )}
                    <IconButton
                      icon={RotateCcw}
                      label={`Reset password for ${user.name}`}
                      variant="secondary"
                      size="sm"
                      disabled={!canResetAdminUserPassword(user)}
                      onClick={() => onResetRequest(user)}
                    />
                    <IconButton
                      icon={Trash2}
                      label={`Delete user ${user.name}`}
                      variant="danger"
                      size="sm"
                      onClick={() => onDeleteRequest(user)}
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
  );
}
