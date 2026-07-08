import { describe, expect, it } from "vitest";
import {
  ADMIN_USER_ROLE_OPTIONS,
  buildCreateUserPayload,
  buildDisableUserSuccessMessage,
  buildEnableUserSuccessMessage,
  buildRoleChangeSuccessMessage,
  canResetAdminUserPassword,
  formatAdminUserCreatedDate,
  formatAdminUserStatus,
  isCurrentAdminUser,
} from "./admin-users";

function formData(values: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe("admin user helpers", () => {
  it("keeps viewer as the default role option before admin", () => {
    expect(ADMIN_USER_ROLE_OPTIONS.map((option) => option.value)).toEqual(["viewer", "admin"]);
  });

  it("builds a create-user payload from form data", () => {
    const payload = buildCreateUserPayload(formData({
      name: "Ada Lovelace",
      email: "ada@example.test",
      password: "correct-horse",
      role: "admin",
    }));

    expect(payload).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.test",
      password: "correct-horse",
      role: "admin",
    });
  });

  it("falls back to viewer for unexpected role values", () => {
    const payload = buildCreateUserPayload(formData({
      name: "Grace Hopper",
      email: "grace@example.test",
      password: "temporary",
      role: "owner",
    }));

    expect(payload.role).toBe("viewer");
  });

  it("classifies self, status, and password-reset eligibility", () => {
    expect(isCurrentAdminUser({ id: 12 }, 12)).toBe(true);
    expect(isCurrentAdminUser({ id: 13 }, 12)).toBe(false);
    expect(formatAdminUserStatus({ disabled: false })).toBe("Active");
    expect(formatAdminUserStatus({ disabled: true })).toBe("Disabled");
    expect(canResetAdminUserPassword({ disabled: false })).toBe(true);
    expect(canResetAdminUserPassword({ disabled: true })).toBe(false);
  });

  it("formats created dates for the admin table", () => {
    expect(formatAdminUserCreatedDate("2026-07-08T12:30:00.000Z")).toBe("7/8/2026");
  });

  it("builds security-sensitive account mutation messages", () => {
    expect(buildRoleChangeSuccessMessage("Kerry", "viewer")).toBe(
      "Role for Kerry updated to viewer. Their active sessions were revoked.",
    );
    expect(buildDisableUserSuccessMessage("Zach")).toBe("Zach was disabled and signed out everywhere.");
    expect(buildEnableUserSuccessMessage("Zach")).toBe("Zach was re-enabled.");
  });
});
