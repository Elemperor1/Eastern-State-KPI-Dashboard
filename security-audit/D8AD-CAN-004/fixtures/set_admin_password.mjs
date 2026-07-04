// Deterministically set a known password for the seeded admin
// (kerry@easternstate.org) in the baseline revision's SQLite DB, so the
// browser CSRF harness can log in and obtain a host-only session cookie
// without relying on the seed's random printed plaintext.
//
// Why this does NOT weaken the CSRF proof:
//  - The real production deployment provisions the admin credential via
//    `fly secrets set BOOTSTRAP_ADMIN_PASSWORD` (working-tree flow) or
//    the operator reads the random seed password once (baseline flow).
//    Either way an admin logs in and receives a host-only SameSite=Lax
//    cookie with identical attributes. We only reproduce that logged-in
//    cookie state deterministically for the test.
//  - We do NOT change cookie attributes, do NOT add/remove any route
//    gate, and do NOT touch SameSite enforcement. The CSRF-relevant
//    control surface is byte-identical to revision ea7263d.
//
// Usage:
//   DATABASE_PATH=/tmp/eskpi-baseline-data/kpi.db \
//   node security-audit/D8AD-CAN-004/fixtures/set_admin_password.mjs
import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";

const DB_PATH = process.env.DATABASE_PATH;
if (!DB_PATH) {
  console.error("DATABASE_PATH env var is required");
  process.exit(1);
}
const PASSWORD = process.env.ADMIN_PASSWORD || "CsrfTest-AdminPass-123!";
const EMAIL = "kerry@easternstate.org";

const db = new DatabaseSync(DB_PATH);
const row = db.prepare("SELECT id FROM users WHERE email = ?").get(EMAIL);
if (!row) {
  console.error(`No user found with email ${EMAIL}; run the seed first.`);
  process.exit(2);
}
const hash = bcrypt.hashSync(PASSWORD, 10); // baseline SALT_ROUNDS = 10
db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, row.id);
console.log(JSON.stringify({ ok: true, email: EMAIL, id: row.id, password_set: true }));