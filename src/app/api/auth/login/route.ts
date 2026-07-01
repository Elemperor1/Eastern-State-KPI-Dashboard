import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyCredentials } from "@/lib/auth";
import { getSession, AuthError } from "@/lib/session";
import {
  clearFailures,
  lockedMsRemaining,
  pruneExpired,
  recordFailure,
} from "@/lib/login-throttle";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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
 * that sanitizes the inbound `x-forwarded-for` (e.g. nginx with
 * `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`
 * configured to overwrite, not append). Without it, the helper
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

export async function POST(req: NextRequest) {
  // Sweep stale entries opportunistically. The map stays bounded
  // under sustained probing without needing a long-lived timer.
  pruneExpired();

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please provide a valid email and password." },
        { status: 400 },
      );
    }
    const { email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Throttle check. The route blocks if EITHER the source IP or
    // the target account is currently locked out. The check happens
    // before the bcrypt compare so a throttled attempt does not pay
    // the cost of a verification.
    const ip = clientIp(req);
    const ipKey = `ip:${ip}`;
    const acctKey = `acct:${normalizedEmail}`;
    const ipLockedMs = lockedMsRemaining(ipKey);
    const acctLockedMs = lockedMsRemaining(acctKey);
    if (ipLockedMs > 0 || acctLockedMs > 0) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil(Math.max(ipLockedMs, acctLockedMs) / 1000),
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

    const user = await verifyCredentials(email, password);
    if (!user) {
      // Record the failure on both key spaces. The lockout, if
      // triggered, applies to whichever key first crosses the
      // threshold. Only emit Retry-After if at least one key is
      // now locked — a single failed attempt that hasn't tripped
      // the threshold should look identical to a normal 401.
      const { lockedUntil: ipLockedUntil } = recordFailure(ipKey);
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

    // Successful login: clear any prior failure tracking so a user
    // who just fat-fingered their password a few times is not
    // suddenly throttled.
    clearFailures(ipKey);
    clearFailures(acctKey);

    const session = await getSession();
    session.user = user;
    await session.save();
    return NextResponse.json({ user });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("login error", err);
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
