import { z } from "zod";

/** Implements the parsed type operation. */
function parsedType(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "number") return Number.isNaN(value) ? "nan" : "number";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  if (value instanceof Map) return "map";
  if (value instanceof Set) return "set";
  if (
    typeof value === "object" &&
    "then" in value &&
    typeof value.then === "function" &&
    "catch" in value &&
    typeof value.catch === "function"
  ) {
    return "promise";
  }
  return typeof value === "object" ? "object" : typeof value;
}

/** Implements the joined values operation. */
function joinedValues(values: readonly unknown[], separator = " | "): string {
  return values
    .map((value) => (typeof value === "string" ? `'${value}'` : String(value)))
    .join(separator);
}

/** Implements the literal value operation. */
function literalValue(value: unknown): string {
  return JSON.stringify(value, (_key, candidate: unknown) =>
    typeof candidate === "bigint" ? candidate.toString() : candidate,
  );
}

/**
 * Preserve the public Zod 3.25 default messages while running Zod 4.
 * Schema-level custom messages still take precedence over this global fallback.
 */
const zod3CompatibleError: z.core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case "invalid_type": {
      if (issue.input === undefined) return "Required";
      const expectedInteger =
        typeof issue.input === "number" &&
        !Number.isNaN(issue.input) &&
        !Number.isInteger(issue.input) &&
        (issue.expected === "int" ||
          (issue.inst instanceof z.ZodNumber && issue.inst.isInt));
      if (
        !expectedInteger &&
        !Number.isFinite(issue.input) &&
        typeof issue.input === "number"
      ) {
        return Number.isNaN(issue.input)
          ? `Expected ${issue.expected}, received nan`
          : "Number must be finite";
      }
      const expected = expectedInteger ? "integer" : issue.expected;
      const received = expectedInteger ? "float" : parsedType(issue.input);
      return `Expected ${expected}, received ${received}`;
    }
    case "invalid_value":
      if (issue.values.length === 1) {
        return `Invalid literal value, expected ${literalValue(issue.values[0])}`;
      }
      if (
        issue.values.every((value) => typeof value === "string") &&
        typeof issue.input !== "string"
      ) {
        return issue.input === undefined
          ? "Required"
          : `Expected ${joinedValues(issue.values)}, received ${parsedType(issue.input)}`;
      }
      return `Invalid enum value. Expected ${joinedValues(issue.values)}, received '${String(issue.input)}'`;
    case "unrecognized_keys":
      return `Unrecognized key(s) in object: ${joinedValues(issue.keys, ", ")}`;
    case "invalid_union":
      if (Array.isArray(issue.options) && issue.options.length > 0) {
        return `Invalid discriminator value. Expected ${joinedValues(issue.options)}`;
      }
      return "Invalid input";
    case "invalid_format":
      if (issue.format === "includes" && "includes" in issue) {
        return `Invalid input: must include "${String(issue.includes)}"`;
      }
      if (issue.format === "starts_with" && "prefix" in issue) {
        return `Invalid input: must start with "${String(issue.prefix)}"`;
      }
      if (issue.format === "ends_with" && "suffix" in issue) {
        return `Invalid input: must end with "${String(issue.suffix)}"`;
      }
      return issue.format === "regex" ? "Invalid" : `Invalid ${issue.format}`;
    case "too_small": {
      const origin = issue.origin === "int" ? "number" : issue.origin;
      if (origin === "array") {
        return `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? "at least" : "more than"} ${issue.minimum} element(s)`;
      }
      if (origin === "string") {
        return `String must contain ${issue.exact ? "exactly" : issue.inclusive ? "at least" : "over"} ${issue.minimum} character(s)`;
      }
      if (origin === "number" || origin === "bigint") {
        return `Number must be ${issue.exact ? "exactly equal to " : issue.inclusive ? "greater than or equal to " : "greater than "}${issue.minimum}`;
      }
      if (origin === "date") {
        return `Date must be ${issue.exact ? "exactly equal to " : issue.inclusive ? "greater than or equal to " : "greater than "}${new Date(Number(issue.minimum)).toString()}`;
      }
      return "Invalid input";
    }
    case "too_big": {
      const origin = issue.origin === "int" ? "number" : issue.origin;
      if (origin === "array") {
        return `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? "at most" : "less than"} ${issue.maximum} element(s)`;
      }
      if (origin === "string") {
        return `String must contain ${issue.exact ? "exactly" : issue.inclusive ? "at most" : "under"} ${issue.maximum} character(s)`;
      }
      if (origin === "number") {
        return `Number must be ${issue.exact ? "exactly" : issue.inclusive ? "less than or equal to" : "less than"} ${issue.maximum}`;
      }
      if (origin === "bigint") {
        return `BigInt must be ${issue.exact ? "exactly" : issue.inclusive ? "less than or equal to" : "less than"} ${issue.maximum}`;
      }
      if (origin === "date") {
        return `Date must be ${issue.exact ? "exactly" : issue.inclusive ? "smaller than or equal to" : "smaller than"} ${new Date(Number(issue.maximum)).toString()}`;
      }
      return "Invalid input";
    }
    case "not_multiple_of":
      return `Number must be a multiple of ${issue.divisor}`;
    case "custom":
    case "invalid_key":
    case "invalid_element":
      return "Invalid input";
  }
};

z.config({ customError: zod3CompatibleError });

export { z };
