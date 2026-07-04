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

/** @type {import('next').NextConfig} */
const nextConfig = {
  // node:sqlite is a built-in module. No bundler externalization needed.
};

export default nextConfig;