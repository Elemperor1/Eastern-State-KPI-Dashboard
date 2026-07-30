import { describe, expect, it } from "vitest";
import { z } from "./zod";

/** Supports the messages test scenario. */
function messages(schema: z.ZodType, input: unknown): string[] {
  const result = schema.safeParse(input);
  expect(result.success).toBe(false);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("Zod 3 public error-message compatibility", () => {
  it("preserves required, type, literal, enum, union, and strict-object text", () => {
    expect(messages(z.object({ value: z.string() }), {})).toEqual(["Required"]);
    expect(messages(z.string(), 1)).toEqual(["Expected string, received number"]);
    expect(messages(z.literal("annual"), "monthly")).toEqual([
      'Invalid literal value, expected "annual"',
    ]);
    expect(messages(z.enum(["annual", "monthly"]), "quarterly")).toEqual([
      "Invalid enum value. Expected 'annual' | 'monthly', received 'quarterly'",
    ]);
    expect(messages(z.enum(["annual", "monthly"]), 1)).toEqual([
      "Expected 'annual' | 'monthly', received number",
    ]);
    expect(messages(z.enum(["annual", "monthly"]), null)).toEqual([
      "Expected 'annual' | 'monthly', received null",
    ]);
    expect(messages(z.enum(["annual", "monthly"]), undefined)).toEqual(["Required"]);
    expect(messages(z.union([z.string(), z.number()]), false)).toEqual([
      "Invalid input",
    ]);
    expect(
      messages(
        z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("count") }),
          z.object({ kind: z.literal("percent") }),
        ]),
        { kind: "currency" },
      ),
    ).toEqual(["Invalid discriminator value. Expected 'count' | 'percent'"]);
    expect(messages(z.object({ id: z.number() }).strict(), { id: 1, extra: true })).toEqual([
      "Unrecognized key(s) in object: 'extra'",
    ]);
  });

  it("preserves range, format, finite-number, and schema-level custom text", () => {
    expect(messages(z.string().min(3), "x")).toEqual([
      "String must contain at least 3 character(s)",
    ]);
    expect(messages(z.array(z.string()).max(1), ["a", "b"])).toEqual([
      "Array must contain at most 1 element(s)",
    ]);
    expect(messages(z.number().positive(), 0)).toEqual([
      "Number must be greater than 0",
    ]);
    expect(messages(z.email(), "invalid")).toEqual(["Invalid email"]);
    expect(messages(z.iso.datetime({ offset: true }), "invalid")).toEqual([
      "Invalid datetime",
    ]);
    expect(messages(z.string().regex(/^ok$/), "no")).toEqual(["Invalid"]);
    expect(messages(z.number().int(), 1.5)).toEqual([
      "Expected integer, received float",
    ]);
    expect(messages(z.number().int(), Number.POSITIVE_INFINITY)).toEqual([
      "Expected integer, received float",
    ]);
    expect(messages(z.number().finite(), Number.POSITIVE_INFINITY)).toEqual([
      "Number must be finite",
    ]);
    expect(messages(z.string().min(3, "Keep this message."), "x")).toEqual([
      "Keep this message.",
    ]);
  });

  it("truncates reflected invalid enum input to a bounded echo (S091-C1)", () => {
    const attacker = "x".repeat(500);
    const [message] = messages(z.enum(["annual", "monthly"]), attacker);
    expect(message).not.toContain(attacker);
    expect(message).toContain("x".repeat(200));
    expect(message).toContain("…");
    expect(message).toMatch(
      /^Invalid enum value\. Expected 'annual' \| 'monthly', received '/,
    );
  });

  it("truncates reflected unrecognized key names and caps the echoed key count (S091-C2)", () => {
    const longKey = "k".repeat(500);
    const [message] = messages(z.object({ id: z.number() }).strict(), {
      id: 1,
      [longKey]: true,
    });
    expect(message).not.toContain(longKey);
    expect(message).toContain("k".repeat(200));
    expect(message).toContain("…");

    const many: Record<string, true> = {};
    for (let i = 0; i < 50; i += 1) many[`key${i}`] = true;
    const [manyMessage] = messages(z.object({ id: z.number() }).strict(), {
      id: 1,
      ...many,
    });
    expect(manyMessage).toContain("'key19'");
    expect(manyMessage).not.toContain("'key20'");
    expect(manyMessage).toContain("(+30 more)");
  });
});
