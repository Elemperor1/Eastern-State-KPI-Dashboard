import { describe, expect, it } from "vitest";
import { planRasterPdfPages } from "./raster-layout";

describe("raster PDF page planning", () => {
  it("fits a short canvas on one page without changing its aspect ratio", () => {
    expect(planRasterPdfPages({
      sourceWidth: 1000,
      sourceHeight: 500,
      pageWidth: 792,
      pageHeight: 612,
      margin: 24,
    })).toEqual([
      {
        sourceY: 0,
        sourceHeight: 500,
        renderWidth: 744,
        renderHeight: 372,
      },
    ]);
  });

  it("covers every source pixel exactly once across tall pages", () => {
    const pages = planRasterPdfPages({
      sourceWidth: 1000,
      sourceHeight: 2000,
      pageWidth: 792,
      pageHeight: 612,
      margin: 24,
    });

    expect(pages).toEqual([
      {
        sourceY: 0,
        sourceHeight: 758,
        renderWidth: 744,
        renderHeight: 563.952,
      },
      {
        sourceY: 758,
        sourceHeight: 758,
        renderWidth: 744,
        renderHeight: 563.952,
      },
      {
        sourceY: 1516,
        sourceHeight: 484,
        renderWidth: 744,
        renderHeight: 360.096,
      },
    ]);

    expect(
      pages.reduce((total, page) => total + page.sourceHeight, 0),
    ).toBe(2000);
    expect(pages.every((page) => page.renderHeight <= 564)).toBe(true);
    for (let index = 1; index < pages.length; index += 1) {
      expect(pages[index].sourceY).toBe(
        pages[index - 1].sourceY + pages[index - 1].sourceHeight,
      );
    }
  });

  it("moves page cuts to keep-together boundaries without dropping pixels", () => {
    const pages = planRasterPdfPages({
      sourceWidth: 1000,
      sourceHeight: 2000,
      pageWidth: 792,
      pageHeight: 612,
      margin: 24,
      avoidBreakRanges: [
        { start: 650, end: 900 },
        { start: 1350, end: 1550 },
      ],
    });

    expect(pages.map(({ sourceY, sourceHeight }) => ({
      sourceY,
      sourceHeight,
    }))).toEqual([
      { sourceY: 0, sourceHeight: 650 },
      { sourceY: 650, sourceHeight: 700 },
      { sourceY: 1350, sourceHeight: 650 },
    ]);
    expect(
      pages.reduce((total, page) => total + page.sourceHeight, 0),
    ).toBe(2000);
  });

  it("rejects dimensions that cannot produce a readable page", () => {
    expect(() =>
      planRasterPdfPages({
        sourceWidth: 0,
        sourceHeight: 500,
        pageWidth: 792,
        pageHeight: 612,
        margin: 24,
      }),
    ).toThrow("positive");
    expect(() =>
      planRasterPdfPages({
        sourceWidth: 1000,
        sourceHeight: 500,
        pageWidth: 40,
        pageHeight: 40,
        margin: 24,
      }),
    ).toThrow("margin");
  });
});
