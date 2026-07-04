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
import { findUserByEmail, updateUserPassword } from "../src/lib/auth";
import { getDb, resetDb } from "../src/lib/db";

const MIN_PASSWORD_LENGTH = 8;

function fail(message: string): never {
  console.error(`[setup:admin] ${message}`);
  process.exit(1);
}

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

  // Touch the DB connection so a missing/corrupt database fails loudly
  // here rather than inside findUserByEmail.
  getDb();

  const user = findUserByEmail(email);
  if (!user) {
    fail(
      `No account found for ${email}. Ensure the database has been seeded ` +
        "(the app creates bootstrap accounts on first run) and the email is correct.",
    );
  }

  // Set the operator-chosen password and clear the rotation requirement.
  // mustChange=false marks this as a permanent credential (the operator
  // chose it), so the user is not forced through /setup-password.
  updateUserPassword(user.id, password, false);

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