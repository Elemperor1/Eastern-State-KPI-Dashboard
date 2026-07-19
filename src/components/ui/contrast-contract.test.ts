import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  new URL("../../app/globals.css", import.meta.url),
  "utf8",
);

/** Supports the css token test scenario. */
function cssToken(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`Missing CSS color token --${name}`);
  return match[1];
}

/** Supports the luminance test scenario. */
function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Supports the contrast test scenario. */
function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

describe("shared color contrast contract", () => {
  it("keeps the focus indicator at 3:1 on both product canvases", () => {
    const focus = cssToken("color-focus");

    expect(contrast(focus, cssToken("color-canvas-light"))).toBeGreaterThanOrEqual(3);
    expect(contrast(focus, cssToken("color-canvas-dark"))).toBeGreaterThanOrEqual(3);
  });

  it("keeps placeholder ink at body-text contrast on white", () => {
    expect(css).toContain("placeholder:text-ink-500");
    expect(
      contrast(cssToken("color-text-tertiary"), cssToken("color-canvas-light")),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
