import { z } from "@/lib/zod";

/**
 * Shared credential length policy (F-04/F-17 remediation R-06: S004-C1,
 * S025-C1). bcrypt silently truncates its input at 72 bytes, and the
 * bcryptjs pre-hash UTF-8 encode cost grows linearly with input length on
 * the single Node event loop — an unbounded password field is a
 * synchronous-CPU and heap amplifier on every credential path. Every
 * password-accepting schema therefore shares one UTF-8 byte ceiling.
 * 256 bytes is far beyond any passphrase a human legitimately uses while
 * bounding the encode work a single request can cause. Note bcrypt still
 * reads only the first 72 bytes of whatever it is given: entropy past byte
 * 72 does not strengthen the credential (documented bcrypt behavior, not
 * a collision this policy introduces), and the resource ceiling does not
 * redefine that accepted primitive.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 256;

/** Returns the byte length bcrypt's UTF-8 encoding assigns to a password. */
export function passwordUtf8ByteLength(password: string): number {
  return new TextEncoder().encode(password).byteLength;
}

/** Determines whether a password fits the shared UTF-8 resource ceiling. */
export function passwordFitsByteLimit(password: string): boolean {
  return passwordUtf8ByteLength(password) <= PASSWORD_MAX_BYTES;
}

/**
 * Password supplied to VERIFY an existing credential (login, change-password
 * reauthentication). The floor stays at min(1) so the verification path never
 * leaks the setting policy for legacy credentials.
 */
export const PasswordVerifySchema = z
  .string()
  .min(1)
  .refine(passwordFitsByteLimit, {
    error: `Password must be at most ${PASSWORD_MAX_BYTES} UTF-8 bytes.`,
  });

/**
 * Password that SETS a new credential (admin create, admin reset,
 * self-service change, operator provisioning).
 */
export const NewPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .refine(passwordFitsByteLimit, {
    error: `Password must be at most ${PASSWORD_MAX_BYTES} UTF-8 bytes.`,
  });
