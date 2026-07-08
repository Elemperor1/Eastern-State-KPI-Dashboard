import type { Role, User } from "@/lib/types";

export const ADMIN_USER_ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: "viewer", label: "Viewer (read-only)" },
  { value: "admin", label: "Admin (full access)" },
];

export interface CreateUserPayload extends Record<string, unknown> {
  name: string;
  email: string;
  password: string;
  role: Role;
}

export function buildCreateUserPayload(form: FormData): CreateUserPayload {
  const requestedRole = String(form.get("role"));
  return {
    name: String(form.get("name") ?? ""),
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
    role: requestedRole === "admin" ? "admin" : "viewer",
  };
}

export function isCurrentAdminUser(user: Pick<User, "id">, currentUserId: number): boolean {
  return user.id === currentUserId;
}

export function canResetAdminUserPassword(user: Pick<User, "disabled">): boolean {
  return !user.disabled;
}

export function formatAdminUserStatus(user: Pick<User, "disabled">): "Active" | "Disabled" {
  return user.disabled ? "Disabled" : "Active";
}

export function formatAdminUserCreatedDate(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString("en-US");
}

export function buildRoleChangeSuccessMessage(name: string, role: Role): string {
  return `Role for ${name} updated to ${role}. Their active sessions were revoked.`;
}

export function buildDisableUserSuccessMessage(name: string): string {
  return `${name} was disabled and signed out everywhere.`;
}

export function buildEnableUserSuccessMessage(name: string): string {
  return `${name} was re-enabled.`;
}
