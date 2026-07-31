import { describe, expect, it } from "vitest";
import { asUtcTimestamp, parseUtcTimestamp } from "./sqlite-timestamp";

describe("sqlite timestamp parsing", () => {
  it("reads a stored SQLite timestamp as UTC rather than local time", () => {
    // The shape `datetime('now')` writes. Parsed bare, engines treat it as a
    // local-time literal, shifting every displayed time by the viewer's offset.
    expect(parseUtcTimestamp("2026-07-31 20:13:14").toISOString()).toBe(
      "2026-07-31T20:13:14.000Z",
    );
    expect(asUtcTimestamp("2026-07-31 20:13:14")).toBe("2026-07-31T20:13:14Z");
  });

  it("leaves an already-zoned timestamp alone", () => {
    for (const value of [
      "2026-07-31T20:13:14Z",
      "2026-07-31T20:13:14.000Z",
      "2026-07-31T20:13:14+05:30",
      "2026-07-31T20:13:14-0800",
    ]) {
      expect(asUtcTimestamp(value)).toBe(value);
    }
    expect(parseUtcTimestamp("2026-07-31T20:13:14Z").toISOString()).toBe(
      "2026-07-31T20:13:14.000Z",
    );
  });

  it("returns an invalid Date for unparseable text so callers can fall back", () => {
    expect(Number.isNaN(parseUtcTimestamp("not a timestamp").getTime())).toBe(true);
    expect(asUtcTimestamp("   ")).toBe("");
  });
});
