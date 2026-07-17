import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { getDb, transaction } from "@/lib/db";
import type { Role, SessionUser } from "@/lib/types";
import {
  createUser,
  findUserCredentialRecordByEmail,
} from "@/features/users/server";

const SALT_ROUNDS = 10;

/**
 * Reserved account identifiers that must never be reachable through the
 * normal login flow. These rows exist for internal use (FK targets, dev
 * bypass, system tasks) and have password hashes that no caller can match.
 * Centralized so verifyCredentials(), the seed routine, and any future
 * admin UI can agree on the same list.
 */
const RESERVED_EMAILS: ReadonlySet<string> = new Set(
  ["auth-disabled@local"].map((e) => e.toLowerCase()),
);

/** Public for callers that need to detect the bypass identity (UI, session, tests). */
export const BYPASS_USER_EMAIL = "auth-disabled@local";

function isReservedEmail(email: string): boolean {
  return RESERVED_EMAILS.has(email.toLowerCase().trim());
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  if (isReservedEmail(email)) {
    // Reserved accounts (dev bypass, system tasks) must never be reachable
    // through the login route. Return null without consulting the DB so
    // timing/leak surface is identical to "no such user".
    return null;
  }
  const row = findUserCredentialRecordByEmail(email);
  if (!row) return null;
  // A disabled account cannot log in (D8AD-CAN-003). Return null with
  // the same generic shape used for "no such user" / "wrong password"
  // so the login response does not leak that the account exists but is
  // disabled — the caller sees the identical "Invalid email or password."
  // 401 either way.
  if (row.disabled) return null;
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    must_change_password: row.must_change_password,
  };
}

/**
 * Bcrypt hash of a per-process random 64-byte secret. Stored on the bypass
 * row so that even if `verifyCredentials()` were ever extended to look it
 * up, the chance of an attacker guessing the value is negligible. The
 * plaintext is held only in this process's memory for the duration of
 * `ensureSeedAdmin()` and is not persisted.
 */
function newBypassHash(): string {
  return bcrypt.hashSync(crypto.randomBytes(64).toString("base64"), SALT_ROUNDS);
}

/**
 * Stable id reserved for the AUTH_DISABLED bypass user. Picked so the row exists
 * before any seed-admin insert assigns autoincrement ids 1..N — when the bypass
 * row is upserted with this id, FK references from `monthly_entries.updated_by`
 * and `breakdown_entries.updated_by` resolve cleanly.
 */
const BYPASS_USER_ID = -1;

/**
 * Generate a per-install random password. 24 chars from a 64-symbol
 * base64 alphabet ≈ 144 bits of entropy, well past any practical
 * brute-force threshold.
 *
 * Used as the FALLBACK temporary credential for a bootstrap account
 * when the operator did not provide one via the matching env var
 * (BOOTSTRAP_*_PASSWORD). The plaintext is NEVER written to stdout,
 * stderr, logs, or any persistent store — it is held only in process
 * memory for the duration of ensureSeedAdmin() and then discarded. An
 * account provisioned with a random fallback credential is effectively
 * locked until an operator sets a known password with the operator-only
 * `npm run setup:admin` command (see scripts/setup-admin.ts).
 *
 * Implementation: encode 18 random bytes as base64 and take the first
 * 24 chars. 18 bytes is a multiple of 3, so the base64 output is
 * exactly 24 chars with no `=` padding. The 24 chars may include
 * `+` and `/` (base64's two non-alphanumeric chars) — these are
 * safe in JSON / form fields / password managers, even if not as
 * "URL-safe" as a pure alphanumeric would be. The trade-off is
 * guaranteed length: a previous implementation that filtered `+/=`
 * produced passwords of 17-24 chars depending on the random input.
 */
function generateSeedPassword(): string {
  return crypto.randomBytes(18).toString("base64").slice(0, 24);
}

/** Bootstrap accounts provisioned on a fresh database. The `envVar`
 *  names the operator-provided secret used as the temporary password
 *  when present; otherwise a random unguessable password is generated
 *  and the account is left locked until `npm run setup:admin` sets a
 *  known password. */
const BOOTSTRAP_ACCOUNTS = [
  {
    email: "kerry@easternstate.org",
    name: "Kerry Sautner",
    role: "admin" as Role,
    envVar: "BOOTSTRAP_ADMIN_PASSWORD",
  },
  {
    email: "zach@easternstate.org",
    name: "Zach Palmer",
    role: "viewer" as Role,
    envVar: "BOOTSTRAP_VIEWER_PASSWORD",
  },
];

/**
 * Resolve the temporary credential for a bootstrap account.
 *
 * Source priority:
 *   1. The operator-provided secret in `envVar` (explicit operator
 *      secret — the operator already knows it, so it never needs to be
 *      communicated via logs).
 *   2. A random unguessable password (fallback when no secret was
 *      provided). The plaintext is never logged and never communicated;
 *      the account is locked until the operator runs `setup:admin`.
 *
 * Returns the plaintext plus a non-sensitive `source` label for the
 * status line (the env-var name, or "random temporary credential").
 * The plaintext is used only to hash into the users row and is then
 * discarded by the caller.
 */
function resolveBootstrapPassword(envVar: string): {
  password: string;
  source: string;
} {
  const provided = process.env[envVar];
  if (provided && provided.trim().length > 0) {
    return { password: provided, source: envVar };
  }
  return { password: generateSeedPassword(), source: "random temporary credential" };
}

export function ensureSeedAdmin(): void {
  const db = getDb();

  // Idempotent bypass-row upsert: a real `users` row whose id we can return
  // from getSession() while AUTH_DISABLED=true so FK constraints on
  // `*.updated_by` succeed. The hash is regenerated on every seed run so
  // (a) the value is never persisted to source control, and (b) any
  // pre-existing DB with the previously-documented hash is rotated to an
  // unguessable value on next startup. The plaintext is discarded.
  //
  // We use INSERT OR IGNORE then UPDATE so two concurrent calls (e.g.
  // during a Next.js dev hot reload) cannot both try to insert the
  // fixed `id: -1` row. The first call wins; the second becomes a
  // no-op insert that still triggers the UPDATE branch below and
  // rotates the hash, which is idempotent at the data level.
  const bypassHash = newBypassHash();
  db.prepare(
    `INSERT OR IGNORE INTO users (id, email, name, password_hash, role, must_change_password, disabled, sessions_valid_after)
     VALUES (?, ?, ?, ?, 'admin', 0, 0, 0)`,
  ).run(BYPASS_USER_ID, BYPASS_USER_EMAIL, "Auth Disabled", bypassHash);
  db.prepare(
    "UPDATE users SET password_hash = ?, role = 'admin', name = ? WHERE email = ?",
  ).run(bypassHash, "Auth Disabled", BYPASS_USER_EMAIL);

  const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as
    | Record<string, unknown>
    | undefined;
  const count = Number(row?.count ?? 0);
  // The bypass row above is always present; the named bootstrap accounts
  // are only created on a fresh DB (no users at all). Subsequent startups
  // hit this guard and do NOT regenerate the accounts, so retries against
  // an already-seeded DB are no-ops (no credential regeneration, no
  // logging). Partial-failure consistency is handled by the transaction
  // below: a torn seed rolls both accounts back so the count stays at 1
  // and the next run re-provisions cleanly.
  if (count > 1) return;

  // Fresh DB: provision the named bootstrap accounts. Each gets a
  // TEMPORARY credential (operator-provided env secret, or a random
  // fallback) and must_change_password = 1, forcing rotation at first
  // login before normal app use. NO PLAINTEXT IS EVER LOGGED — only the
  // non-sensitive account list and credential source are emitted.
  //
  // The two inserts run in a single transaction so a partial startup
  // failure (e.g. the second insert throws) cannot leave a half-seeded
  // DB where one bootstrap account exists with a credential the
  // operator cannot reproduce. On rollback, the count stays at 1 and
  // the next ensureSeedAdmin() call re-provisions both accounts
  // atomically. With env-provided secrets the retry reuses the same
  // plaintext (deterministic); with random fallback the retry generates
  // fresh values but — crucially — never logs them, so no inconsistency
  // is observable in logs.
  const provisions = BOOTSTRAP_ACCOUNTS.map((spec) => ({
    spec,
    ...resolveBootstrapPassword(spec.envVar),
  }));

  transaction(() => {
    for (const p of provisions) {
      createUser({
        email: p.spec.email,
        name: p.spec.name,
        password: p.password,
        role: p.spec.role,
        mustChangePassword: true,
      });
    }
  });

  // Non-sensitive status only: which accounts were provisioned and where
  // each temporary credential came from. The plaintext itself is never
  // emitted. The operator rotates each credential at first login (via
  // the forced /setup-password page) or, for random fallback accounts,
  // sets a known password with `npm run setup:admin`.
  console.log(
    `[seed] provisioned ${provisions.length} bootstrap account(s) on first run. ` +
      `Each was given a temporary credential that must be rotated at first login.`,
  );
  for (const p of provisions) {
    console.log(
      `[seed]   ${p.spec.email}  (${p.spec.role})  credential source: ${p.source}`,
    );
    if (p.source === "random temporary credential") {
      // Non-sensitive warning to stderr: the account is locked until the
      // operator provisions a known password. No secret is included.
      console.warn(
        `[seed]   ${p.spec.email} has no operator-provided secret ` +
          `(${p.spec.envVar} was unset). It was given a random temporary ` +
          `credential that is NOT recorded anywhere. Run ` +
          `\`npm run setup:admin\` (or set ${p.spec.envVar} and reseed) to ` +
          `set a known password before login.`,
      );
    }
  }
}
