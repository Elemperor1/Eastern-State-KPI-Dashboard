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

/** Builds create user payload. */
export function buildCreateUserPayload(form: FormData): CreateUserPayload {
  const requestedRole = String(form.get("role"));
  return {
    name: String(form.get("name") ?? ""),
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
    role: requestedRole === "admin" ? "admin" : "viewer",
  };
}

/** Determines whether is current admin user. */
export function isCurrentAdminUser(user: Pick<User, "id">, currentUserId: number): boolean {
  return user.id === currentUserId;
}

/** Determines whether can reset admin user password. */
export function canResetAdminUserPassword(user: Pick<User, "disabled">): boolean {
  return !user.disabled;
}

/** Formats admin user status. */
export function formatAdminUserStatus(user: Pick<User, "disabled">): "Active" | "Disabled" {
  return user.disabled ? "Disabled" : "Active";
}

/** Formats admin user created date. */
export function formatAdminUserCreatedDate(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString("en-US");
}

/** Builds role change success message. */
export function buildRoleChangeSuccessMessage(name: string, role: Role): string {
  return `Role for ${name} updated to ${role}. Their active sessions were revoked.`;
}

/** Builds disable user success message. */
export function buildDisableUserSuccessMessage(name: string): string {
  return `${name} was disabled and signed out everywhere.`;
}

/** Builds enable user success message. */
export function buildEnableUserSuccessMessage(name: string): string {
  return `${name} was re-enabled.`;
}
