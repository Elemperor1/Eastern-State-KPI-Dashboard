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

/** Supports the form data test scenario. */
function formData(values: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe("admin user helpers", () => {
  it("keeps viewer as the default and offers the restricted Board role", () => {
    expect(ADMIN_USER_ROLE_OPTIONS.map((option) => option.value)).toEqual([
      "viewer",
      "board",
      "admin",
    ]);
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

  it("preserves the Board role in create-user payloads", () => {
    const payload = buildCreateUserPayload(formData({
      name: "Board Member",
      email: "board@example.test",
      password: "temporary",
      role: "board",
    }));

    expect(payload.role).toBe("board");
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

  it("reads the stored UTC created_at as UTC, not as local time", () => {
    // users.created_at defaults to datetime('now'): UTC with no zone marker.
    // Parsed bare it shifts by the viewer's offset, which can roll a late
    // evening signup onto the following day. Compared against the equivalent
    // explicit-UTC instant so the assertion holds in any timezone.
    expect(formatAdminUserCreatedDate("2026-07-08 02:30:00")).toBe(
      formatAdminUserCreatedDate("2026-07-08T02:30:00.000Z"),
    );
  });

  it("builds security-sensitive account mutation messages", () => {
    expect(buildRoleChangeSuccessMessage("Kerry", "viewer")).toBe(
      "Role for Kerry updated to viewer. They have been signed out on all devices.",
    );
    expect(buildDisableUserSuccessMessage("Zach")).toBe("Zach was disabled and signed out everywhere.");
    expect(buildEnableUserSuccessMessage("Zach")).toBe("Zach was re-enabled.");
  });
});
