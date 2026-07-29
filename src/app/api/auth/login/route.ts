import { type NextRequest, NextResponse } from "next/server";
import { z } from "@/lib/zod";
import { PasswordVerifySchema } from "@/lib/password-policy";
import { verifyCredentials } from "@/features/auth/server";
import { getSession, AuthError } from "@/features/auth/session";
import { assertLoginRequest, ensureCsrfCookie } from "@/lib/request-guard";
import { CREDENTIAL_BODY_MAX_BYTES, readJsonBody } from "@/lib/request-body";
import {
  clearFailures,
  lockedMsRemaining,
  pruneExpired,
  recordFailure,
  verifyBudgetAllows,
} from "@/lib/login-throttle";
import { logAuthThrottle } from "@/lib/operational-log";

const LoginSchema = z.object({
  // Bounded so a megabyte-scale body cannot reach the synchronous bcryptjs
  // UTF-8 encode (S004-C1): the schema rejects before throttle accounting
  // and before any credential work.
  email: z.email().max(320),
  password: PasswordVerifySchema,
});

/**
 * Extract a best-effort client IP from the request. Behind a trusted
 * reverse proxy, the leftmost entry of `x-forwarded-for` is the
 * original client (per RFC 7239 spirit). When NOT behind a proxy,
 * the header is attacker-controlled and cannot be trusted for the
 * per-IP throttle key — an attacker could spoof a different IP on
 * every request and bypass the throttle entirely.
 *
 * Set TRUST_PROXY=true to indicate the app is behind a reverse proxy
 * that sanitizes/overwrites any inbound forwarded-IP headers (e.g. nginx with
 * `proxy_set_header X-Forwarded-For $remote_addr;` and without passing through
 * a client-supplied X-Forwarded-For). Without it, the helper
 * returns a constant so all anonymous traffic collapses onto a
 * single throttle key — better to throttle everyone than to let an
 * attacker trivially bypass per-IP throttling.
 */
function clientIp(req: NextRequest): string {
  const trustProxy = process.env.TRUST_PROXY === "true";
  if (trustProxy) {
    const flyClientIp = req.headers.get("fly-client-ip")?.trim();
    if (flyClientIp) return flyClientIp;

    const xff = req.headers.get("x-forwarded-for");
    if (xff) {
      const first = xff.split(",")[0]?.trim();
      if (first) return first;
    }
    const real = req.headers.get("x-real-ip");
    if (real) return real.trim();
  }
  return "unknown";
}

/** Implements the post operation. */
export async function POST(req: NextRequest) {
  // Sweep stale entries opportunistically. The map stays bounded
  // under sustained probing without needing a long-lived timer.
  pruneExpired();

  try {
    // S064-C1: pre-auth CSRF hardening — Origin/Referer same-origin +
    // exact JSON content-type, so a cross-site page cannot drive a
    // forced login through the victim's browser with a CORS-safelisted
    // request. The double-submit token layer starts after auth (the
    // response below is what issues the cookie).
    const guard = assertLoginRequest(req);
    if (guard) return guard;

    // S004-C1 body axis: the per-IP lockout is evaluated BEFORE the body
    // is parsed, so a locked-out source is refused without paying even a
    // capped parse. The account axis is checked after parsing because the
    // account key derives from the submitted email.
    const ip = clientIp(req);
    const ipKey = `ip:${ip}`;
    const ipLockedMs = lockedMsRemaining(ipKey);
    if (ipLockedMs > 0) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil(ipLockedMs / 1000),
      );
      return NextResponse.json(
        {
          error:
            "Too many failed attempts. Please wait a few minutes and try again.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSec) },
        },
      );
    }

    // The credential payload is tiny by contract (bounded email +
    // password), so the tight credential body cap applies before any
    // parse work on the pre-auth surface.
    const bodyResult = await readJsonBody(req, CREDENTIAL_BODY_MAX_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const parsed = LoginSchema.safeParse(bodyResult.body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please provide a valid email and password." },
        { status: 400 },
      );
    }
    const { email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Account-axis throttle check. The route blocks if the target
    // account is currently locked out (the source-IP axis ran before the
    // body parse, above). The check happens before the bcrypt compare so
    // a throttled attempt does not pay the cost of a verification.
    const acctKey = `acct:${normalizedEmail}`;
    const compareKey = `cmpl:${normalizedEmail}`;
    // Evaluate the account lock BEFORE the credential comparison. An
    // already-locked account still admits a bounded number of compares
    // per lockout window (LOGIN_VERIFY_BUDGET) so the legitimate
    // holder's correct password clears the lock, but distributed
    // wrong-password traffic stops paying full bcrypt cost per attempt
    // once the budget is spent.
    const accountNow = Date.now();
    const acctLockedMs = lockedMsRemaining(acctKey, accountNow);
    const acctLockedUntil = accountNow + acctLockedMs;
    if (
      acctLockedMs > 0 &&
      !verifyBudgetAllows(compareKey, acctLockedUntil, accountNow)
    ) {
      logAuthThrottle("login_verify_budget_exceeded");
      return NextResponse.json(
        {
          error:
            "Too many failed attempts. Please wait a few minutes and try again.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.max(1, Math.ceil(acctLockedMs / 1000))),
          },
        },
      );
    }

    const verified = await verifyCredentials(email, password);
    if (!verified) {
      // Record the source-IP failure for EVERY wrong attempt — including
      // attempts against an already account-locked account — so a
      // distributed attacker cannot keep every source IP below its own
      // lockout threshold.
      const { lockedUntil: ipLockedUntil } = recordFailure(ipKey);
      // Account-wide abuse tracking throttles wrong guesses. The account
      // lock was evaluated before the compare (above); the compare still
      // ran within its budget, so a correct password clears the lock and
      // an anonymous actor cannot lock the legitimate holder out with
      // the correct password.
      if (acctLockedMs > 0) {
        return NextResponse.json(
          {
            error:
              "Too many failed attempts. Please wait a few minutes and try again.",
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(
                Math.max(1, Math.ceil(acctLockedMs / 1000)),
              ),
            },
          },
        );
      }
      // Record the account failure. The lockout, if triggered, applies
      // to whichever key first crosses the threshold. Only emit
      // Retry-After if at least one key is now locked — a single failed
      // attempt that hasn't tripped the threshold should look identical
      // to a normal 401.
      const acctResult = recordFailure(acctKey);
      const now = Date.now();
      const lockoutMsLeft = Math.max(
        ipLockedUntil - now,
        acctResult.lockedUntil - now,
      );
      const headers: Record<string, string> = {};
      if (lockoutMsLeft > 0) {
        headers["Retry-After"] = String(
          Math.max(1, Math.ceil(lockoutMsLeft / 1000)),
        );
      }
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401, headers },
      );
    }

    const { user, credentialVersion } = verified;
    // A correct credential clears only its account history. Aggregate
    // source-IP failures may describe spraying against other accounts and
    // must survive an unrelated successful login.
    clearFailures(acctKey);
    clearFailures(compareKey);

    const session = await getSession();
    session.user = user;
    // Stamp the issuance time so getCurrentUser() can invalidate this
    // session when a security-sensitive account change bumps
    // sessions_valid_after past it (D8AD-CAN-003 req 2 + req 5).
    // Date.now() >= the user's current sessions_valid_after watermark
    // by construction (login happens after any prior change), so the
    // session is valid immediately.
    session.issuedAt = Date.now();
    session.credentialVersion = credentialVersion;
    await session.save();
    // Tell the client whether the just-authenticated account still owes
    // a password rotation. The login page routes the user to the forced
    // /setup-password page instead of the dashboard when this is true,
    // so a bootstrap/admin-issued temp credential cannot be used as a
    // permanent login.
    const res = NextResponse.json({
      user,
      mustChangePassword: user.must_change_password,
    });
    // Issue the double-submit CSRF cookie (D8AD-CAN-004 hardening).
    // The client echoes its value in the X-CSRF-Token header on every
    // mutation; the request guard compares header to cookie.
    ensureCsrfCookie(req, res);
    return res;
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("login error", err);
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
