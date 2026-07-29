import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import {
  NewPasswordSchema,
  PasswordVerifySchema,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
} from "./password-policy";

describe("shared password length policy (F-04/R-06: S004-C1, S025-C1)", () => {
  it("accepts ordinary credentials on both paths", () => {
    expect(NewPasswordSchema.safeParse("TempPass!2026").success).toBe(true);
    expect(PasswordVerifySchema.safeParse("TempPass!2026").success).toBe(true);
  });

  it("rejects new passwords shorter than the minimum", () => {
    expect(NewPasswordSchema.safeParse("short1").success).toBe(false);
    expect(
      NewPasswordSchema.safeParse("x".repeat(PASSWORD_MIN_LENGTH)).success,
    ).toBe(true);
  });

  it("rejects new passwords beyond the shared maximum", () => {
    expect(
      NewPasswordSchema.safeParse("x".repeat(PASSWORD_MAX_BYTES)).success,
    ).toBe(true);
    expect(
      NewPasswordSchema.safeParse("x".repeat(PASSWORD_MAX_BYTES + 1)).success,
    ).toBe(false);
  });

  it("measures the shared maximum in UTF-8 bytes, not JavaScript characters", () => {
    expect(
      NewPasswordSchema.safeParse("é".repeat(PASSWORD_MAX_BYTES / 2)).success,
    ).toBe(true);
    expect(
      NewPasswordSchema.safeParse("é".repeat(PASSWORD_MAX_BYTES / 2 + 1))
        .success,
    ).toBe(false);
    expect(
      PasswordVerifySchema.safeParse(
        "é".repeat(PASSWORD_MAX_BYTES / 2 + 1),
      ).success,
    ).toBe(false);
  });

  it("keeps the resource ceiling distinct from bcrypt's accepted 72-byte semantics", () => {
    const password = "x".repeat(73);

    expect(bcrypt.truncates(password)).toBe(true);
    expect(NewPasswordSchema.safeParse(password).success).toBe(true);
    expect(PasswordVerifySchema.safeParse(password).success).toBe(true);
  });

  it("rejects verification passwords beyond the shared maximum but keeps the min(1) floor", () => {
    expect(PasswordVerifySchema.safeParse("").success).toBe(false);
    expect(PasswordVerifySchema.safeParse("a").success).toBe(true);
    expect(
      PasswordVerifySchema.safeParse("x".repeat(PASSWORD_MAX_BYTES)).success,
    ).toBe(true);
    expect(
      PasswordVerifySchema.safeParse("x".repeat(PASSWORD_MAX_BYTES + 1))
        .success,
    ).toBe(false);
  });

  it("bounds the megabyte-scale bodies measured in S004-C1", () => {
    expect(
      PasswordVerifySchema.safeParse("x".repeat(1024 * 1024)).success,
    ).toBe(false);
    expect(NewPasswordSchema.safeParse("x".repeat(1024 * 1024)).success).toBe(
      false,
    );
  });
});
