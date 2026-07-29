/**
 * Operator-only bootstrap password provisioning.
 *
 * Run with:  SETUP_ADMIN_PASSWORD=... npm run setup:admin
 *   (optionally SETUP_ADMIN_EMAIL=... to target a different account)
 *
 * Purpose: `ensureSeedAdmin()` creates the named bootstrap accounts on a
 * fresh database with TEMPORARY credentials. When the operator provided
 * the matching BOOTSTRAP_*_PASSWORD env var at seed time, they already
 * know the temp password and can log in to rotate it through the forced
 * /setup-password page. When that env var was NOT set, the account was
 * given a random unguessable password that is recorded NOWHERE — so the
 * operator cannot log in at all. This command is the recovery path: it
 * sets a known password on a bootstrap account and clears the
 * must_change_password flag (the operator chose this password, so it is
 * treated as permanent rather than temporary).
 *
 * SECURITY: the password is read from the SETUP_ADMIN_PASSWORD env var
 * and is NEVER written to stdout, stderr, or any log. Only a
 * non-sensitive confirmation is printed. The password is not accepted
 * as a CLI argument so it cannot leak through shell history, process
 * listings, or CI logs.
 */
import {
  createUser,
  findUserByEmail,
  setUserDisabled,
  updateUserPassword,
} from "../src/features/users/server";
import { getDb, resetDb } from "../src/lib/db";
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  passwordUtf8ByteLength,
} from "../src/lib/password-policy";
import { BYPASS_USER_EMAIL } from "../src/features/auth/server";

const MIN_PASSWORD_LENGTH = PASSWORD_MIN_LENGTH;

/** Implements the fail operation. */
function fail(message: string): never {
  console.error(`[setup:admin] ${message}`);
  process.exit(1);
}

/** Runs the main workflow. */
function main() {
  const email = (
    process.env.SETUP_ADMIN_EMAIL ?? "kerry@easternstate.org"
  )
    .toLowerCase()
    .trim();
  const password = process.env.SETUP_ADMIN_PASSWORD;

  if (!password || password.trim().length === 0) {
    fail(
      "SETUP_ADMIN_PASSWORD is required. Set it in the environment " +
        "(e.g. `SETUP_ADMIN_PASSWORD=... npm run setup:admin`) rather than " +
        "passing it on the command line so it does not leak through shell " +
        "history or process listings.",
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(
      `SETUP_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
    );
  }
  // Shared resource ceiling (S025-C1). Measure the exact UTF-8 byte input
  // bcryptjs encodes rather than JavaScript UTF-16 code units. bcrypt's
  // separate 72-byte effective-prefix behavior remains an accepted,
  // documented primitive; this 256-byte ceiling bounds pre-hash work.
  if (passwordUtf8ByteLength(password) > PASSWORD_MAX_BYTES) {
    fail(
      `SETUP_ADMIN_PASSWORD must be at most ${PASSWORD_MAX_BYTES} UTF-8 bytes.`,
    );
  }

  // Touch the DB connection so a missing/corrupt database fails loudly
  // here rather than inside findUserByEmail.
  getDb();

  const user = findUserByEmail(email);
  if (!user) {
    const activeAdminRow = getDb()
      .prepare(
        `SELECT COUNT(*) AS count
         FROM users
         WHERE role = 'admin' AND disabled = 0 AND email != ?`,
      )
      .get(BYPASS_USER_EMAIL) as { count?: number | bigint } | undefined;
    const activeAdminCount = Number(activeAdminRow?.count ?? 0);
    const createConfirmation = (
      process.env.SETUP_ADMIN_CREATE_CONFIRM ?? ""
    )
      .toLowerCase()
      .trim();
    if (activeAdminCount > 0 && createConfirmation !== email) {
      fail(
        `No account found for ${email}, and an active administrator already exists. ` +
          "Use Setup → People for normal account creation. For an intentional " +
          "operator break-glass creation, set SETUP_ADMIN_CREATE_CONFIRM to " +
          `the exact normalized email (${email}).`,
      );
    }

    // Zero-admin recovery path: when the named account does not exist (for
    // example after an accidental admin deletion), CREATE it as an active
    // admin with the operator-chosen password instead of failing. This is
    // automatic only when no usable administrator exists. When one does
    // exist, the exact-email confirmation above makes extra-admin creation
    // explicit. The lifecycle audit event is attributed to System.
    const created = createUser({
      email,
      name: email.split("@")[0] ?? email,
      password,
      role: "admin",
      mustChangePassword: false,
    });
    console.log(
      `[setup:admin] no account existed for ${email}; created a new ACTIVE ADMIN account (id ${created.id}).`,
    );
    console.log(
      "[setup:admin] reminder: share credentials out-of-band, never by email/log.",
    );
    resetDb();
    return;
  }

  // Set the operator-chosen password and clear the rotation requirement.
  // mustChange=false marks this as a permanent credential (the operator
  // chose it), so the user is not forced through /setup-password.
  updateUserPassword(user.id, password, false);
  // A disabled account cannot log in even with the correct password, so the
  // recovery path re-enables it explicitly.
  if (user.disabled) {
    setUserDisabled(user.id, false);
    console.log(`[setup:admin] account ${email} was disabled; re-enabled.`);
  }
  if (user.role !== "admin") {
    console.log(
      `[setup:admin] note: ${email} is a ${user.role}; the role is unchanged. ` +
        "To recover a database with no active administrator, re-run with " +
        "SETUP_ADMIN_EMAIL set to an address that has no account yet and a " +
        "fresh admin will be created.",
    );
  }

  // Non-sensitive status only. The password itself is never emitted.
  console.log(
    `[setup:admin] password updated for ${email} (${user.role}); ` +
      "must_change_password cleared. The account is ready for login.",
  );
  console.log(
    "[setup:admin] reminder: share credentials out-of-band, never by email/log.",
  );

  resetDb();
}

main();
