/**
 * Stable identifier for the development-only AUTH_DISABLED identity.
 *
 * The row is a foreign-key target and bypass principal, never a durable
 * operator account. Keep every authentication and account-governance check
 * on the shared predicate below so this internal row cannot accidentally
 * satisfy a human-administrator safety invariant.
 */
export const BYPASS_USER_EMAIL = "auth-disabled@local";

const RESERVED_AUTH_EMAILS: ReadonlySet<string> = new Set([
  BYPASS_USER_EMAIL,
]);

/** Returns whether an email identifies an internal, non-login auth row. */
export function isReservedAuthEmail(email: string): boolean {
  return RESERVED_AUTH_EMAILS.has(email.toLowerCase().trim());
}
