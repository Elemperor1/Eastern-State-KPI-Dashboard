/**
 * In-memory login throttling.
 *
 * Tracks failed login attempts by two key spaces:
 *   - `ip:<address>` — slows online guessing from a single source.
 *   - `acct:<email>` — slows credential stuffing against a known
 *     account, even when the attacker rotates source IPs.
 *
 * When *either* counter for a given login attempt exceeds the
 * threshold within the failure window, subsequent attempts for that
 * key are rejected with HTTP 429 for the lockout window. A successful
 * login clears that account's counter while preserving the source-IP
 * budget, which may represent spraying against other accounts.
 *
 * State is held in a per-process Map. The single-process Next.js
 * deployment model used by this app makes that adequate. If the app
 * is ever scaled horizontally, move this table to a shared store
 * (e.g. SQLite or Redis) so all replicas see the same counters.
 *
 * Configuration via environment variables:
 *   LOGIN_LOCKOUT_THRESHOLD  failures per window before lockout
 *                            (default 10)
 *   LOGIN_LOCKOUT_WINDOW_MS  rolling window in ms (default 5 min)
 *   LOGIN_LOCKOUT_DURATION_MS  how long the lockout lasts
 *                              (default 5 min)
 *   LOGIN_THROTTLE_MAX_ENTRIES maximum retained identity counters
 *                              (default 4096)
 *
 * The defaults are deliberately lenient for a small-staff internal
 * dashboard: 10 wrong attempts in 5 minutes → 5-minute lockout. A
 * determined online attacker faces a per-IP+per-account throttle
 * that makes online guessing economically uninteresting; a determined
 * credential-stuffing attack still gets slowed by the per-account
 * leg. The bcrypt cost on top of this is the durable backstop.
 */

interface ThrottleEntry {
  /** Failures within the current rolling window. */
  failures: number;
  /** Timestamp (ms since epoch) of the first failure in the window. */
  windowStart: number;
  /** Timestamp (ms since epoch) at which the lockout expires, or 0. */
  lockedUntil: number;
}

const store = new Map<string, ThrottleEntry>();
// Unlocked entries are the only safe capacity-eviction candidates. Keep a
// second insertion-ordered index so admission remains O(1) without ever
// sacrificing an active lockout to attacker-controlled key flooding.
const evictionCandidates = new Map<string, true>();
const PRUNE_BATCH_SIZE = 64;

/** Retrieves number. */
function readNumber(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

/**
 * Resolve the throttle config at call time. We re-read the env on
 * every call (rather than capturing at module load) so the tests
 * can use `vi.stubEnv` to pin a deterministic config and so a
 * deployed process picks up config changes via SIGHUP or process
 * restart without an extra build step.
 */
function resolvedConfig() {
  return {
    threshold: readNumber("LOGIN_LOCKOUT_THRESHOLD", 10, 1, 1000),
    windowMs: readNumber(
      "LOGIN_LOCKOUT_WINDOW_MS",
      5 * 60 * 1000,
      1000,
      24 * 60 * 60 * 1000,
    ),
    lockoutMs: readNumber(
      "LOGIN_LOCKOUT_DURATION_MS",
      5 * 60 * 1000,
      1000,
      24 * 60 * 60 * 1000,
    ),
    maxEntries: readNumber("LOGIN_THROTTLE_MAX_ENTRIES", 4096, 1, 100_000),
  };
}

/** Throttle config for tests and operator introspection. */
export function throttleConfig() {
  return resolvedConfig();
}

/** Implements the fresh entry operation. */
function freshEntry(): ThrottleEntry {
  return { failures: 0, windowStart: 0, lockedUntil: 0 };
}

/** Updates eviction candidate. */
function refreshEvictionCandidate(
  key: string,
  entry: ThrottleEntry,
  now: number,
): void {
  evictionCandidates.delete(key);
  if (entry.lockedUntil <= now) evictionCandidates.set(key, true);
}

/** Implements the evict oldest unlocked operation. */
function evictOldestUnlocked(now: number): boolean {
  while (evictionCandidates.size > 0) {
    const key = evictionCandidates.keys().next().value as string | undefined;
    if (key === undefined) return false;
    evictionCandidates.delete(key);
    const entry = store.get(key);
    if (!entry || entry.lockedUntil > now) continue;
    store.delete(key);
    return true;
  }
  return false;
}

/**
 * If the entry is in a current lockout, return the ms remaining (≥ 0).
 * Otherwise return 0. A lockout is treated as expired once its
 * `lockedUntil` is in the past; the entry's failure counter is not
 * reset at that point — that happens on the next recordFailure or
 * clearFailures call.
 */
export function lockedMsRemaining(key: string, now: number = Date.now()): number {
  const entry = store.get(key);
  if (!entry) return 0;
  if (entry.lockedUntil > now) return entry.lockedUntil - now;
  // A lockout that expired since the last write is now safe to evict.
  refreshEvictionCandidate(key, entry, now);
  return 0;
}

/**
 * Record a failed login attempt against `key`. Returns the new
 * failure count within the current window. If the count reaches
 * `THRESHOLD` for the first time in the window, also stamp a lockout
 * expiry.
 */
export function recordFailure(key: string, now: number = Date.now()): {
  failures: number;
  lockedUntil: number;
} {
  const { threshold, windowMs, lockoutMs, maxEntries } = resolvedConfig();
  let entry = store.get(key);
  if (!entry) {
    if (store.size >= maxEntries && !evictOldestUnlocked(now)) {
      // Every retained identity is actively locked. Decline to admit this
      // attacker-controlled key rather than deleting a lockout early or
      // exceeding the configured memory bound.
      return { failures: 1, lockedUntil: 0 };
    }
    entry = freshEntry();
    store.set(key, entry);
  }
  // If the current window has elapsed, reset the counter and start a
  // new window. We reset regardless of whether a lockout is still
  // active: the counter reflects "recent activity", and during a
  // long lockout it should not grow unboundedly. The active lockout
  // is preserved so the throttled response is unchanged.
  if (now - entry.windowStart > windowMs) {
    entry.failures = 0;
    entry.windowStart = now;
  }
  entry.failures += 1;
  if (entry.failures >= threshold && entry.lockedUntil <= now) {
    entry.lockedUntil = now + lockoutMs;
  }
  // Refresh insertion order so bounded eviction favors identities that
  // have not recorded a recent failure. This is O(1); no request scans
  // the full attacker-controlled store.
  store.delete(key);
  store.set(key, entry);
  refreshEvictionCandidate(key, entry, now);
  return { failures: entry.failures, lockedUntil: entry.lockedUntil };
}

/** Clear any tracking for `key`. Called on a successful login. */
export function clearFailures(key: string): void {
  store.delete(key);
  evictionCandidates.delete(key);
}

/**
 * Sweep expired lockouts and aged window entries so the in-memory
 * store does not grow unbounded under sustained probing. Called by
 * the route opportunistically (not on a timer — Next.js's runtime
 * model does not give us a clean place to host a long-lived timer
 * that survives serverless cold starts).
 */
export function pruneExpired(now: number = Date.now()): number {
  const { windowMs } = resolvedConfig();
  const toInspect = Math.min(PRUNE_BATCH_SIZE, store.size);
  let inspected = 0;
  while (inspected < toInspect) {
    const oldest = store.entries().next().value as
      | [string, ThrottleEntry]
      | undefined;
    if (!oldest) break;
    const [key, entry] = oldest;
    store.delete(key);
    evictionCandidates.delete(key);
    const lockoutOver = entry.lockedUntil <= now;
    const windowOver = now - entry.windowStart > windowMs;
    if (!(lockoutOver && windowOver)) {
      store.set(key, entry);
      refreshEvictionCandidate(key, entry, now);
    }
    inspected += 1;
  }
  return inspected;
}

/** Test-only: clear the entire store. */
export function _resetForTests(): void {
  store.clear();
  evictionCandidates.clear();
}

/** Test-only: expose cardinality without exposing mutable entries. */
export function _storeSizeForTests(): number {
  return store.size;
}
