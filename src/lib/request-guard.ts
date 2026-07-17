import { type NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

/**
 * D8AD-CAN-004 hardening: the shared request guard applied to every
 * cookie-authenticated administrative mutation.
 *
 * The guard is a single chokepoint (`assertMutationRequest`) invoked by
 * every POST/PATCH/PUT/DELETE handler on the in-scope endpoints AFTER
 * authorization (`requireAdmin` / `getCurrentUser`) has already run.
 * It enforces three independent, layered controls:
 *
 *   1. Origin / Referer same-origin check  -> 403 (csrf-origin)
 *      Rejects cross-site AND same-site-sibling forgeries: a sibling
 *      subdomain is the same *site* but a different *origin*, and the
 *      `Origin` header the browser attaches therefore does not match
 *      the application's canonical origin. Missing/opaque/`null`/
 *      malformed Origin falls back to `Referer`, then to a hard deny.
 *
 *   2. Exact `application/json` content-type  -> 415 (unsupported)
 *      Closes the D8AD-CAN-004 `text/plain` bypass: `req.json()`
 *      parses a JSON body regardless of Content-Type, so a
 *      `text/plain` (CORS-safelisted, no preflight) request carrying
 *      JSON used to land. Now only `application/json` is accepted;
 *      `text/plain`, `application/x-www-form-urlencoded`,
 *      `multipart/form-data`, and any other media type are rejected
 *      with 415 before the body is parsed.
 *
 *   3. Double-submit CSRF token           -> 403 (csrf-token)
 *      Defense-in-depth that does not rely on Origin being present or
 *      correct (e.g. an upstream proxy that strips it). On login and
 *      on /api/auth/me the server sets a host-only, non-HttpOnly,
 *      SameSite=Lax cookie `eastern_state_kpi_csrf` with a 256-bit
 *      random value; the client echoes that value in the
 *      `X-CSRF-Token` request header. The guard compares header to
 *      cookie in constant time. A cross-site or same-site-sibling
 *      attacker cannot read the host-only cookie (different origin)
 *      and cannot set it (host-only, no `Domain`), so it cannot forge
 *      the header. See docs/csrf-hardening.md.
 *
 * Authorization (401/403 from `requireAdmin`) runs first by design:
 * an unauthenticated forge gets a 401, an authenticated-but-unauthorized
 * forge gets a 403 authz, and an authenticated authorized forge gets a
 * 403 csrf / 415. The three CSRF failure reasons are distinguishable
 * in server logs (each emits a distinct `[csrf]` reason) but all
 * return a generic `{error:"Forbidden"}` (403) or
 * `{error:"Unsupported Media Type"}` (415) to the client, so a client
 * cannot probe the boundary any more precisely than the HTTP status.
 */

const CSRF_HEADER = "x-csrf-token";
const CSRF_COOKIE_NAME = "eastern_state_kpi_csrf";

/** Reasons are for SERVER LOGS ONLY; never serialize them to the client. */
export type CsrfFailReason =
  | "origin-mismatch"
  | "origin-opaque"
  | "origin-malformed"
  | "origin-missing"
  | "referer-mismatch"
  | "referer-malformed"
  | "bad-content-type"
  | "csrf-token-missing"
  | "csrf-cookie-missing"
  | "csrf-token-mismatch";

function logCsrf(reason: CsrfFailReason, req: NextRequest): void {
  // Structured, server-side only. No cookie values, no auth details.
  // The request URL is safe (it is the app's own route) and helps
  // operators see which endpoint was probed.
  console.warn(`[csrf] ${reason}`, {
    reason,
    method: req.method,
    path: req.nextUrl?.pathname ?? new URL(req.url).pathname,
  });
}

/** Allowed origins for the deployment. */
function canonicalOrigins(req: NextRequest): string[] {
  const configured = process.env.APP_CANONICAL_ORIGIN;
  if (configured && configured.trim()) {
    return configured
      .split(",")
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean)
      .map((o) => o.toLowerCase());
  }
  // Zero-config secure default: the request's own origin. A forged
  // request from any other origin (cross-site or same-site sibling)
  // is therefore rejected. Behind a trusted reverse proxy (Fly),
  // honor the forwarded scheme/host the same way the login throttle
  // honors x-forwarded-for — and only when TRUST_PROXY=true, because
  // these headers are attacker-controllable on a bare origin.
  let proto = req.nextUrl.protocol.replace(":", ""); // 'http' | 'https'
  // Next's development adapter can construct nextUrl with an internal
  // localhost origin even when the incoming request used 127.0.0.1 and a
  // different port. The Host header is the request's actual authority and is
  // therefore the correct zero-config same-origin fallback.
  let host = req.headers.get("host")?.trim() || req.nextUrl.host;
  if (process.env.TRUST_PROXY === "true") {
    const xfProto = req.headers.get("x-forwarded-proto")?.trim();
    const xfHost = req.headers.get("x-forwarded-host")?.trim();
    if (xfProto) proto = xfProto;
    if (xfHost) host = xfHost;
  }
  return [`${proto}://${host}`.toLowerCase()];
}

/** Parse an origin string ("scheme://host[:port]") or null if malformed. */
function parseOrigin(value: string): string | null {
  try {
    const u = new URL(value);
    if (!u.protocol || !u.host) return null;
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return null;
  }
}

function sameOrigin(origin: string, allowed: string[]): boolean {
  const o = origin.toLowerCase();
  return allowed.some((a) => a === o);
}

/**
 * Validate Origin (with Referer fallback) for a mutation request.
 * Returns null when acceptable, or a CsrfFailReason to deny.
 */
export function checkOriginOrReferer(req: NextRequest): CsrfFailReason | null {
  const allowed = canonicalOrigins(req);
  const origin = req.headers.get("origin");

  if (origin !== null && origin !== "") {
    if (origin.trim().toLowerCase() === "null") {
      // Opaque origin (sandboxed iframe, data: URL). Treat as hostile.
      return "origin-opaque";
    }
    const parsed = parseOrigin(origin);
    if (!parsed) return "origin-malformed";
    if (!sameOrigin(parsed, allowed)) return "origin-mismatch";
    return null;
  }

  // Missing Origin: fall back to Referer. A legitimate same-origin
  // browser mutation almost always sends Origin; Referer covers the
  // rare same-origin case where it doesn't. A cross-site forge cannot
  // suppress Origin, so missing-Origin is suspicious — but we allow
  // it through Referer rather than denying outright, because denying
  // a valid Referer would break legitimate traffic. Referer is ONLY a
  // fallback, never a substitute for Origin when Origin is present.
  const referer = req.headers.get("referer");
  if (referer !== null && referer !== "") {
    const parsed = parseOrigin(referer);
    if (!parsed) return "referer-malformed";
    if (!sameOrigin(parsed, allowed)) return "referer-mismatch";
    return null;
  }

  // Both absent: deny. Mutations are never navigations, so a
  // well-behaved same-origin browser always provides at least one.
  return "origin-missing";
}

/**
 * Validate that the request body's media type is exactly
 * `application/json`. Parameters (e.g. `;charset=utf-8`) are ignored;
 * any other media type is rejected with 415.
 */
export function checkJsonContentType(req: NextRequest): boolean {
  const ct = req.headers.get("content-type");
  if (!ct) return false;
  // RFC 7231: the media type is the first token before any `;`.
  const mediaType = ct.split(";")[0].trim().toLowerCase();
  return mediaType === "application/json";
}

/** Constant-time string compare. Returns false on length mismatch. */
function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Validate the double-submit CSRF token: the `X-CSRF-Token` request
 * header must equal the `eastern_state_kpi_csrf` cookie value.
 */
export function checkCsrfToken(req: NextRequest): CsrfFailReason | null {
  const cookie = req.cookies.get(CSRF_COOKIE_NAME)?.value;
  const header = req.headers.get(CSRF_HEADER);
  if (!cookie) return "csrf-cookie-missing";
  if (!header) return "csrf-token-missing";
  if (!constantTimeEqual(header, cookie)) return "csrf-token-mismatch";
  return null;
}

/** Issue a fresh 256-bit CSRF token (base64url). */
export function issueCsrfToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Set the CSRF cookie on a response if the request did not already
 * carry a valid one. Cookie attributes mirror the session cookie's
 * host-only / SameSite=Lax posture, except this cookie is non-HttpOnly
 * so the client's own JS can read it to echo back in the header.
 */
export function ensureCsrfCookie(
  req: NextRequest,
  res: NextResponse,
): { token: string; set: boolean } {
  const existing = req.cookies.get(CSRF_COOKIE_NAME)?.value;
  if (existing && existing.length >= 16) {
    return { token: existing, set: false };
  }
  const token = issueCsrfToken();
  res.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.SESSION_SECURE !== "false",
    path: "/",
  });
  return { token, set: true };
}

/**
 * The shared guard. Returns a NextResponse (rejection) when the
 * request must be denied, or null when it may proceed to body
 * parsing. Call this AFTER authorization has succeeded.
 */
export function assertMutationRequest(
  req: NextRequest,
): NextResponse | null {
  // 1. Origin / Referer
  const originReason = checkOriginOrReferer(req);
  if (originReason) {
    logCsrf(originReason, req);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // 2. Content-Type must be exactly application/json
  if (!checkJsonContentType(req)) {
    logCsrf("bad-content-type", req);
    return NextResponse.json(
      { error: "Unsupported Media Type" },
      { status: 415 },
    );
  }
  // 3. Double-submit CSRF token
  const tokenReason = checkCsrfToken(req);
  if (tokenReason) {
    logCsrf(tokenReason, req);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
