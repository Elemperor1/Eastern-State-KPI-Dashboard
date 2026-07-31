import { describe, expect, it } from "vitest";
import {
  asUtcTimestamp,
  formatUtcDate,
  formatUtcTimestamp,
  parseUtcTimestamp,
} from "./sqlite-timestamp";

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

describe("sqlite timestamp display", () => {
  it("renders a fixed locale and timezone so the server and the browser agree", () => {
    // These tables render inside client components that Next also renders on
    // the server. A machine-dependent locale or timezone would produce
    // different text on each side and trip a hydration mismatch, so the
    // output must not depend on the ambient environment at all. The space
    // before the meridiem is matched loosely because ICU versions disagree
    // on whether it is a narrow no-break space.
    expect(formatUtcTimestamp("2026-07-31 20:13:14")).toMatch(
      /^Jul 31, 2026, 4:13\sPM$/u,
    );
    expect(formatUtcDate("2026-07-08 02:30:00")).toBe("7/7/2026");
  });

  it("displays the instant in the organization's clock, not UTC", () => {
    // 02:30 UTC is still the previous evening in Eastern State's timezone;
    // showing the UTC date would report the wrong day.
    expect(formatUtcDate("2026-07-08T02:30:00.000Z")).toBe("7/7/2026");
    expect(formatUtcDate("2026-07-08T12:30:00.000Z")).toBe("7/8/2026");
  });

  it("falls back to the raw stored text when it cannot be parsed", () => {
    expect(formatUtcTimestamp("not a timestamp")).toBe("not a timestamp");
    expect(formatUtcDate("not a timestamp")).toBe("not a timestamp");
  });
});
