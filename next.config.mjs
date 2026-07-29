/**
 * D8AD-CAN-002: refuse to produce a production build with the
 * AUTH_DISABLED anonymous-admin bypass enabled. `next build` runs with
 * NODE_ENV=production, so a truthy AUTH_DISABLED here would bake a
 * fail-open misconfiguration into the deployable artifact.
 *
 * Runtime enforcement (fail-closed in prod/test, loopback-only in dev)
 * and the `process.env.NODE_ENV` inlining that dead-strips the bypass
 * in production server bundles both live in src/lib/auth-flag.ts.
 */
function authFlagIsSet(raw) {
  if (raw == null) return false;
  const v = String(raw).trim().toLowerCase();
  if (v === "" || v === "false" || v === "0" || v === "off" || v === "no") {
    return false;
  }
  return true;
}
if (
  authFlagIsSet(process.env.AUTH_DISABLED) &&
  process.env.NODE_ENV !== "development"
) {
  throw new Error(
    "AUTH_DISABLED is set while building for production (NODE_ENV=" +
      process.env.NODE_ENV +
      "). Refusing to build a deployable artifact with the anonymous " +
      "admin bypass enabled. Unset AUTH_DISABLED before building.",
  );
}

/**
 * S045-C1: baseline security response headers, applied to every route.
 * No route previously set any of these (no middleware, no headers()
 * export), so the absence was systemic. Deliberately minimal:
 *   - frame-ancestors 'none' + X-Frame-Options DENY: clickjacking
 *     defense for the authenticated UI (CSP form + legacy fallback).
 *   - nosniff: blocks MIME confusion on the CSV/PNG/PDF downloads.
 *   - Referrer-Policy strict-origin-when-cross-origin: keeps report
 *     query strings out of cross-origin referrers.
 *   - HSTS: Fly terminates TLS; plain max-age without includeSubDomains
 *     so a future custom domain cannot force HTTPS on sibling
 *     subdomains the site does not control. Ignored by browsers over
 *     plain-HTTP loopback, so local development is unaffected.
 * A full CSP and Permissions-Policy remain backlog until the
 * export/PNG flows are header-tested.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // node:sqlite is a built-in module. No bundler externalization needed.
  // S045-C1: stop advertising the framework in X-Powered-By.
  poweredByHeader: false,
  /** Implements the headers operation. */
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
