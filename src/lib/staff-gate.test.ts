/**
 * S024-C1 (R-08) — the staff gate is an ALLOWLIST, not a denylist.
 *
 * requireStaffSession historically rejected only role === "board", so any
 * future role added to the users table would have silently inherited staff
 * read access (e.g. GET /api/strategy/distribution-bands). The gate now
 * admits exactly the roles in the STAFF_ROLES allowlist (admin, viewer) and
 * rejects everything else — including roles that do not exist yet.
 *
 * The wired behavior for the three current roles is exercised end-to-end by
 * src/lib/auth-regression.test.ts (Board sessions get 403 on the staff-only
 * distribution-band read; admin/viewer pass). This suite pins the
 * discriminating invariant the route matrix cannot express through the DB
 * CHECK constraint: an unrecognized role must be refused.
 */
import { describe, expect, it } from "vitest";
import { isStaffRole } from "@/lib/session";

describe("isStaffRole (S024-C1: staff-gate allowlist)", () => {
  it("allows exactly the admin and viewer roles", () => {
    expect(isStaffRole("admin")).toBe(true);
    expect(isStaffRole("viewer")).toBe(true);
  });

  it("rejects the board role", () => {
    expect(isStaffRole("board")).toBe(false);
  });

  it.each(["auditor", "superadmin", "editor", "", "ADMIN", "Viewer", "board "])(
    "rejects the unrecognized role %j so a future role cannot silently inherit staff access",
    (role) => {
      expect(isStaffRole(role)).toBe(false);
    },
  );
});
