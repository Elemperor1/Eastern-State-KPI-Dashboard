/**
 * AUTH_DISABLED — temporary login bypass for LOCAL development only.
 *
 * Hardening (security finding D8AD-CAN-002):
 *
 *   1. Fail-closed in production and test. The constant is forced to
 *      `false` and a startup throw fires whenever the flag is set with
 *      `NODE_ENV` = `production` or `test`.
 *
 *   2. Loopback-only in development. Even with `NODE_ENV=development`,
 *      the bypass is permitted ONLY when the server is bound
 *      exclusively to a loopback address. The declared bind host
 *      (`BIND_HOST`, set by `npm run dev` to match the real `-H`) must
 *      be one of `127.0.0.1`, `::1`, `localhost`. A non-loopback or
 *      unset bind (e.g. `0.0.0.0`, a LAN IP) with the flag set is
 *      refused at startup — the anonymous admin bypass may never be
 *      reachable from another machine.
 *
 *   3. No header trust. Enforcement uses the declared `BIND_HOST` env
 *      var, NEVER the request `Host` or `X-Forwarded-For` headers
 *      (those are attacker-controlled and are not consulted here at
 *      all). `AUTH_DISABLED` is a module-load constant, not a
 *      per-request decision, so spoofed headers cannot enable or
 *      broaden the bypass.
 *
 *   4. Unavailable in production builds. `next build` inlines
 *      `process.env.NODE_ENV` to `"production"` in the server bundle,
 *      so `isProductionLike` is baked to `true` and `AUTH_DISABLED` is
 *      dead-stripped to `false` regardless of runtime env vars.
 *      `next.config.mjs` additionally refuses to produce a build with
 *      the flag set, and the runtime throw below fires if a production
 *      build is ever started with `AUTH_DISABLED` set.
 *
 * Safe-use conditions are documented in `docs/operator-provisioning.md`
 * (section "AUTH_DISABLED — exact safe-use conditions").
 */

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

/** Implements the env flag is set operation. */
function envFlagIsSet(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "") return false;
  if (
    normalized === "false" ||
    normalized === "0" ||
    normalized === "off" ||
    normalized === "no"
  ) {
    return false;
  }
  return true;
}

/** True when the server is declared to bind exclusively to loopback. */
function loopbackBind(): boolean {
  const host = (process.env.BIND_HOST ?? "").trim().toLowerCase();
  return LOOPBACK_HOSTS.has(host);
}

const envWantsBypass = envFlagIsSet(process.env.AUTH_DISABLED);
const isProductionLike =
  process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test";

if (envWantsBypass && isProductionLike) {
  throw new Error(
    `AUTH_DISABLED is set in NODE_ENV=${process.env.NODE_ENV} (value: ${JSON.stringify(process.env.AUTH_DISABLED)}). ` +
      "Refusing to start: this configuration would grant anonymous admin access. " +
      "Unset AUTH_DISABLED (or set NODE_ENV=development) to run the dev bypass.",
  );
}

if (envWantsBypass && !isProductionLike && !loopbackBind()) {
  // Development with the bypass requested but NOT bound to loopback:
  // refuse startup. The bypass grants anonymous admin access, so it
  // must never be reachable on a non-loopback interface (LAN, tunnel,
  // 0.0.0.0, etc.). We rely on the declared BIND_HOST (set by
  // `npm run dev`), not on request headers, because Host / X-Forwarded-
  // For are attacker-controlled and must not be the sole enforcement.
  throw new Error(
    `AUTH_DISABLED is enabled but the server bind is not loopback ` +
      `(BIND_HOST=${JSON.stringify(process.env.BIND_HOST)}; expected one of 127.0.0.1, ::1, localhost). ` +
      "The anonymous admin bypass may only run on a loopback interface. " +
      "Use `npm run dev` (binds 127.0.0.1 when AUTH_DISABLED is set) or set BIND_HOST=127.0.0.1 explicitly.",
  );
}

export const AUTH_DISABLED = envWantsBypass && !isProductionLike && loopbackBind();

if (AUTH_DISABLED) {
  // Conspicuous local-dev warning. Contains NO secrets — no session
  // secret, no passwords, no PII — only the (public) bind host and the
  // fact that the bypass is active.
  const host = (process.env.BIND_HOST ?? "").trim() || "127.0.0.1";
  console.warn(
    [
      "",
      "┌────────────────────────────────────────────────────────────────────┐",
      "│  ⚠  AUTH_DISABLED IS ON — anonymous admin bypass is ACTIVE.       │",
      `│  Local development only. Server bound to loopback (${host}).`,
      "│  Do NOT deploy this configuration. Production builds force this   │",
      "│  flag off and refuse to start if it is set.                       │",
      "└────────────────────────────────────────────────────────────────────┘",
      "",
    ].join("\n"),
  );
}