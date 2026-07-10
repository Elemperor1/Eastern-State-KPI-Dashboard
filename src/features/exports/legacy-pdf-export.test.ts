import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  addImageMock,
  addPageMock,
  drawImageMock,
  html2canvasMock,
  prepareRasterExportTargetMock,
  restoreTargetMock,
  saveMock,
} = vi.hoisted(() => ({
  addImageMock: vi.fn(),
  addPageMock: vi.fn(),
  drawImageMock: vi.fn(),
  html2canvasMock: vi.fn(),
  prepareRasterExportTargetMock: vi.fn(),
  restoreTargetMock: vi.fn(),
  saveMock: vi.fn(),
}));

vi.mock("html2canvas", () => ({ default: html2canvasMock }));
vi.mock("jspdf", () => ({
  default: class MockJsPdf {
    internal = {
      pageSize: {
        getWidth: () => 792,
        getHeight: () => 612,
      },
    };

    addImage = addImageMock;
    addPage = addPageMock;
    save = saveMock;
  },
}));
vi.mock("./dom-capture", () => ({
  getPageBackground: () => "white",
  prepareRasterExportTarget: prepareRasterExportTargetMock,
}));

import { exportElementToPdf } from "./legacy-pdf-export";

function installDocument({
  target,
}: {
  target: HTMLElement | null;
}) {
  vi.stubGlobal("document", {
    getElementById: vi.fn(() => target),
    createElement: vi.fn(() => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: drawImageMock }),
      toDataURL: () => "data:image/png;base64,slice",
    })),
  });
}

beforeEach(() => {
  addImageMock.mockReset();
  addPageMock.mockReset();
  drawImageMock.mockReset();
  html2canvasMock.mockReset();
  prepareRasterExportTargetMock.mockReset();
  restoreTargetMock.mockReset();
  saveMock.mockReset();
  prepareRasterExportTargetMock.mockReturnValue(restoreTargetMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("legacy raster PDF adapter", () => {
  it("renders every tall-canvas slice in order and restores the target", async () => {
    let rasterized = false;
    const keepTogether = {
      getBoundingClientRect: () => ({
        top: 650,
        height: 250,
      }),
    };
    const clonedTarget = {
      scrollHeight: 2000,
      getBoundingClientRect: () => ({
        top: 0,
        height: 2000,
      }),
      querySelectorAll: () => [keepTogether],
    } as unknown as HTMLElement;
    const target = {
      scrollWidth: 1000,
      scrollHeight: 2000,
      getBoundingClientRect: () => ({
        top: 0,
        height: rasterized ? 1000 : 2000,
      }),
      querySelectorAll: () => [keepTogether],
    } as unknown as HTMLElement;
    const sourceCanvas = {
      width: 1000,
      height: 2000,
      toDataURL: () => "data:image/png;base64,source",
    };
    html2canvasMock.mockImplementation(async (_target, options) => {
      rasterized = true;
      options.onclone({
        getElementById: () => clonedTarget,
      });
      return sourceCanvas;
    });
    installDocument({ target });

    await exportElementToPdf({
      targetId: "dashboard-print-root",
      fileName: "representative-dashboard.pdf",
    });

    expect(prepareRasterExportTargetMock).toHaveBeenCalledWith(target);
    expect(html2canvasMock).toHaveBeenCalledTimes(1);
    expect(html2canvasMock).toHaveBeenCalledWith(target, {
      scale: 1.5,
      backgroundColor: "white",
      logging: false,
      useCORS: true,
      windowWidth: 1000,
      windowHeight: 2000,
      onclone: expect.any(Function),
    });
    expect(addPageMock).toHaveBeenCalledTimes(2);
    expect(addImageMock).toHaveBeenCalledTimes(3);
    expect(addImageMock.mock.calls.every((call) => call[1] === "JPEG")).toBe(true);
    expect(addImageMock.mock.calls.every((call) => call[7] === "FAST")).toBe(true);
    expect(drawImageMock.mock.calls.map((call) => call.slice(1, 5))).toEqual([
      [0, 0, 1000, 650],
      [0, 650, 1000, 758],
      [0, 1408, 1000, 592],
    ]);
    expect(saveMock).toHaveBeenCalledWith("representative-dashboard.pdf");
    expect(restoreTargetMock).toHaveBeenCalledTimes(1);
  });

  it("restores report chrome when rasterization fails", async () => {
    const target = {
      querySelectorAll: () => [],
      scrollWidth: 1000,
      scrollHeight: 500,
    } as unknown as HTMLElement;
    html2canvasMock.mockRejectedValue(new Error("raster failed"));
    installDocument({ target });

    await expect(
      exportElementToPdf({ targetId: "dashboard-print-root" }),
    ).rejects.toThrow("raster failed");
    expect(restoreTargetMock).toHaveBeenCalledTimes(1);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized raster target before the browser creates a blank canvas", async () => {
    const target = {
      querySelectorAll: () => [],
      scrollWidth: 1440,
      scrollHeight: 30_000,
    } as unknown as HTMLElement;
    installDocument({ target });

    await expect(
      exportElementToPdf({ targetId: "strategic-board-export-root" }),
    ).rejects.toThrow("too large for a raster PDF");

    expect(html2canvasMock).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
    expect(restoreTargetMock).toHaveBeenCalledTimes(1);
  });
});
