import { afterEach, describe, expect, it, vi } from "vitest";
import { runEventHandler } from "./async-event";

describe("runEventHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs synchronous handlers without reporting an error", () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = vi.fn();

    runEventHandler(handler, "value");

    expect(handler).toHaveBeenCalledWith("value");
    expect(report).not.toHaveBeenCalled();
  });

  it("handles rejected promises without logging rejection details", async () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => {});

    runEventHandler(async () => {
      throw new Error("sensitive response detail");
    });
    await Promise.resolve();

    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(
      "An async UI action failed unexpectedly.",
    );
  });

  it("handles synchronous exceptions with the same generic report", () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => {});

    runEventHandler(() => {
      throw new Error("sensitive response detail");
    });

    expect(report).toHaveBeenCalledWith(
      "An async UI action failed unexpectedly.",
    );
  });
});
