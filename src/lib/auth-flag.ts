/**
 * AUTH_DISABLED — temporary login bypass for local development.
 *
 * The flag is ONLY honored when NODE_ENV !== "production". In any production
 * build the constant is forced to `false` regardless of the env var, so a
 * reachable deployment cannot be misconfigured into fail-open admin mode.
 *
 * The throw-at-module-load check uses a strict truthy parser (any non-empty
 * value that isn't "false" / "0" / "off" / "no") so a misconfiguration
 * like `AUTH_DISABLED=1`, `AUTH_DISABLED=yes`, or even `AUTH_DISABLED= `
 * (a single space) cannot silently slip through the guard. The same
 * parser is used by the runtime constant so dev and prod agree on
 * what "the flag is set" means.
 *
 * To restore login in dev: set `AUTH_DISABLED=false` (or unset) in .env.local.
 * No code changes are needed.
 */
function envFlagIsSet(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "") return false;
  if (normalized === "false" || normalized === "0" || normalized === "off" || normalized === "no") {
    return false;
  }
  return true;
}

const envWantsBypass = envFlagIsSet(process.env.AUTH_DISABLED);
const isProductionLike = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test";

if (envWantsBypass && isProductionLike) {
  throw new Error(
    `AUTH_DISABLED is set in NODE_ENV=${process.env.NODE_ENV} (value: ${JSON.stringify(process.env.AUTH_DISABLED)}). ` +
      "Refusing to start: this configuration would grant anonymous admin access. " +
      "Unset AUTH_DISABLED (or set NODE_ENV=development) to run the dev bypass.",
  );
}

export const AUTH_DISABLED = envWantsBypass && !isProductionLike;
