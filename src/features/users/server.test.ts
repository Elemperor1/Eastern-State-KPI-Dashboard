import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BYPASS_USER_EMAIL } from "@/lib/reserved-auth-identities";
import { getDb, resetDb } from "@/lib/db";
import {
  createUser,
  deleteUser,
  findUserByEmail,
  setUserDisabled,
  updateUserPassword,
  updateUserPasswordIfCurrent,
  updateUserRole,
  UserLifecycleGuardError,
  UserNotFoundError,
  type UserLifecycleActor,
} from "@/features/users/server";

interface LifecycleEventRow {
  subject_user_id: number | null;
  subject_email_snapshot: string;
  subject_name_snapshot: string;
  subject_role_snapshot: string | null;
  event_type: string;
  previous_value_json: string | null;
  new_value_json: string | null;
  actor_id: number | null;
  actor_email_snapshot: string | null;
}

describe("user lifecycle guards and audit trail", () => {
  let tmpDir: string;
  let originalDbPath: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-users-test-"));
    originalDbPath = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
    resetDb();
  });

  afterEach(() => {
    resetDb();
    if (originalDbPath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = originalDbPath;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Supports the lifecycle events test scenario. */
  function lifecycleEvents(): LifecycleEventRow[] {
    return getDb()
      .prepare(
        "SELECT * FROM user_lifecycle_audit_events ORDER BY id ASC",
      )
      .all() as unknown as LifecycleEventRow[];
  }

  /** Supports the create admin test scenario. */
  function createAdmin(email: string) {
    return createUser({
      email,
      name: `Admin ${email}`,
      password: "AdminPass!2026",
      role: "admin",
    });
  }

  /** Supports the actor identity test scenario: audit actors must be real
   *  user rows (actor_id is FK-enforced), matching production where the
   *  actor is always the session user or System. */
  function asActor(user: { id: number; email: string }): UserLifecycleActor {
    return { id: user.id, email: user.email };
  }

  it("records a System-attributed create event with no secret material", () => {
    const user = createUser({
      email: "new@example.org",
      name: "New User",
      password: "NewPass!2026",
      role: "viewer",
      mustChangePassword: true,
    });

    const events = lifecycleEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      subject_user_id: user.id,
      subject_email_snapshot: "new@example.org",
      subject_name_snapshot: "New User",
      subject_role_snapshot: "viewer",
      event_type: "create",
      actor_id: null,
      actor_email_snapshot: "System",
    });
    expect(events[0].new_value_json).toContain("must_change_password");
    expect(JSON.stringify(events)).not.toContain("NewPass!2026");
    expect(JSON.stringify(events)).not.toContain("$2");
  });

  it("refuses to demote, disable, or delete the last active administrator", () => {
    const sole = createAdmin("sole@example.org");
    const viewer = createUser({
      email: "viewer@example.org",
      name: "Viewer",
      password: "ViewerPass!2026",
      role: "viewer",
    });
    const eventsBefore = lifecycleEvents().length;

    // Self-demotion / self-disable / self-deletion of the last active admin
    // is the real zero-admin vector.
    expect(() => updateUserRole(sole.id, "viewer", asActor(sole))).toThrow(
      UserLifecycleGuardError,
    );
    expect(() => setUserDisabled(sole.id, true, asActor(sole))).toThrow(
      UserLifecycleGuardError,
    );
    // Deletion by a DIFFERENT (non-admin) principal reaches the
    // last-active-admin guard itself rather than the self-delete check.
    expect(() => deleteUser(sole.id, asActor(viewer))).toThrow(
      UserLifecycleGuardError,
    );
    // Self-deletion is refused specifically as a self-target.
    expect(() => deleteUser(sole.id, asActor(sole))).toThrow(
      /own account/,
    );

    // Guard refusals are transactional: no mutation AND no audit events.
    const surviving = findUserByEmail("sole@example.org");
    expect(surviving?.role).toBe("admin");
    expect(surviving?.disabled).toBe(false);
    expect(lifecycleEvents()).toHaveLength(eventsBefore);
  });

  it("still refuses when the only other administrator is disabled", () => {
    const first = createAdmin("first@example.org");
    const second = createAdmin("second@example.org");
    const viewer = createUser({
      email: "viewer@example.org",
      name: "Viewer",
      password: "ViewerPass!2026",
      role: "viewer",
    });
    setUserDisabled(second.id, true, asActor(first));

    expect(() => deleteUser(first.id, asActor(viewer))).toThrow(
      UserLifecycleGuardError,
    );
    expect(() => updateUserRole(first.id, "board", asActor(first))).toThrow(
      UserLifecycleGuardError,
    );

    // Re-enabling the second admin restores mutability of the first.
    setUserDisabled(second.id, false, asActor(first));
    expect(() =>
      updateUserRole(first.id, "viewer", asActor(second)),
    ).not.toThrow();
  });

  it("does not count the reserved auth-bypass identity as another active administrator", () => {
    createAdmin(BYPASS_USER_EMAIL);
    const realAdmin = createAdmin("real-admin@example.org");
    const viewer = createUser({
      email: "viewer@example.org",
      name: "Viewer",
      password: "ViewerPass!2026",
      role: "viewer",
    });

    expect(() =>
      updateUserRole(realAdmin.id, "viewer", asActor(realAdmin)),
    ).toThrow(UserLifecycleGuardError);
    expect(() =>
      setUserDisabled(realAdmin.id, true, asActor(realAdmin)),
    ).toThrow(UserLifecycleGuardError);
    expect(() => deleteUser(realAdmin.id, asActor(viewer))).toThrow(
      UserLifecycleGuardError,
    );

    expect(findUserByEmail("real-admin@example.org")).toMatchObject({
      role: "admin",
      disabled: false,
    });
  });

  it("allows demoting an admin when another active admin remains and audits it", () => {
    const first = createAdmin("first@example.org");
    const second = createAdmin("second@example.org");

    updateUserRole(first.id, "viewer", asActor(second));

    expect(findUserByEmail("first@example.org")?.role).toBe("viewer");
    const roleEvents = lifecycleEvents().filter(
      (event) => event.event_type === "role_change",
    );
    expect(roleEvents).toHaveLength(1);
    expect(roleEvents[0]).toMatchObject({
      subject_user_id: first.id,
      subject_email_snapshot: "first@example.org",
      actor_id: second.id,
      actor_email_snapshot: "second@example.org",
    });
    expect(JSON.parse(roleEvents[0].previous_value_json ?? "{}")).toEqual({
      role: "admin",
    });
    expect(JSON.parse(roleEvents[0].new_value_json ?? "{}")).toEqual({
      role: "viewer",
    });
  });

  it("treats an unchanged role as a no-op without revoking sessions or auditing a phantom change", () => {
    const admin = createAdmin("unchanged@example.org");
    const before = getDb()
      .prepare(
        "SELECT role, sessions_valid_after FROM users WHERE id = ?",
      )
      .get(admin.id) as { role: string; sessions_valid_after: number };
    const eventsBefore = lifecycleEvents();

    updateUserRole(admin.id, "admin", asActor(admin));

    expect(
      getDb()
        .prepare(
          "SELECT role, sessions_valid_after FROM users WHERE id = ?",
        )
        .get(admin.id),
    ).toEqual(before);
    expect(lifecycleEvents()).toEqual(eventsBefore);
  });

  it("refuses self-delete and missing-target delete with typed errors", () => {
    const admin = createAdmin("self@example.org");
    const other = createAdmin("other@example.org");

    expect(() =>
      deleteUser(admin.id, asActor(admin)),
    ).toThrow(UserLifecycleGuardError);
    expect(() => deleteUser(999_999, asActor(other))).toThrow(
      UserNotFoundError,
    );
    expect(findUserByEmail("self@example.org")).not.toBeNull();
  });

  it("writes a full subject snapshot before deletion and keeps the subject id", () => {
    const first = createAdmin("first@example.org");
    const second = createAdmin("second@example.org");

    deleteUser(first.id, asActor(second));

    expect(findUserByEmail("first@example.org")).toBeNull();
    const deleteEvents = lifecycleEvents().filter(
      (event) => event.event_type === "delete",
    );
    expect(deleteEvents).toHaveLength(1);
    const event = deleteEvents[0];
    // No FK on subject_user_id: the historical reference survives the
    // deletion of the subject row.
    expect(event.subject_user_id).toBe(first.id);
    expect(event.subject_email_snapshot).toBe("first@example.org");
    expect(JSON.parse(event.previous_value_json ?? "{}")).toMatchObject({
      email: "first@example.org",
      role: "admin",
      disabled: false,
    });
    expect(event.actor_email_snapshot).toBe("second@example.org");
  });

  it("audits password resets and self-service changes without hashes", () => {
    const first = createAdmin("first@example.org");
    const record = findUserByEmail("first@example.org");
    expect(record).not.toBeNull();

    updateUserPassword(first.id, "ResetPass!2026", true, asActor(first));
    const afterReset = getDb()
      .prepare("SELECT password_hash FROM users WHERE id = ?")
      .get(first.id) as { password_hash: string };

    const changed = updateUserPasswordIfCurrent(
      first.id,
      afterReset.password_hash,
      "FinalPass!2026",
      false,
      { id: first.id, email: "first@example.org" },
    );
    expect(changed).toBe(true);

    const passwordEvents = lifecycleEvents().filter((event) =>
      ["password_reset", "password_change"].includes(event.event_type),
    );
    expect(passwordEvents.map((event) => event.event_type)).toEqual([
      "password_reset",
      "password_change",
    ]);
    expect(JSON.stringify(passwordEvents)).not.toContain("$2");
    expect(JSON.stringify(passwordEvents)).not.toContain("ResetPass!2026");
    expect(JSON.stringify(passwordEvents)).not.toContain("FinalPass!2026");
  });

  it("audits disable and enable as distinct event types", () => {
    const first = createAdmin("first@example.org");
    const second = createAdmin("second@example.org");

    setUserDisabled(first.id, true, asActor(second));
    setUserDisabled(first.id, false, asActor(second));

    const stateEvents = lifecycleEvents().filter((event) =>
      ["disable", "enable"].includes(event.event_type),
    );
    expect(stateEvents.map((event) => event.event_type)).toEqual([
      "disable",
      "enable",
    ]);
    expect(JSON.parse(stateEvents[0].previous_value_json ?? "{}")).toEqual({
      disabled: false,
    });
    expect(JSON.parse(stateEvents[0].new_value_json ?? "{}")).toEqual({
      disabled: true,
    });
  });

  it("throws UserNotFoundError for password resets against a missing account", () => {
    expect(() =>
      updateUserPassword(999_999, "ResetPass!2026", true, null),
    ).toThrow(UserNotFoundError);
  });
});
