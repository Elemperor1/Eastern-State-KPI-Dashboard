import { describe, expect, it } from "vitest";
import {
  EXPORT_ACTIONS_SELECTOR,
  EXPORT_ONLY_SELECTOR,
  EXPORT_TEXT_SELECTOR,
  getPageBackground,
  hideActionsForExport,
  prepareRasterExportTarget,
  relaxTextForExport,
  showExportOnly,
} from "./dom-capture";

class FakeStyle {
  private values = new Map<string, string>();
  private priorities = new Map<string, string>();

  constructor(display?: string, priority = "") {
    if (display !== undefined) {
      this.setProperty("display", display, priority);
    }
  }

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? "";
  }

  getPropertyPriority(name: string): string {
    return this.priorities.get(name) ?? "";
  }

  setProperty(name: string, value: string, priority = ""): void {
    this.values.set(name, value);
    this.priorities.set(name, priority);
  }

  removeProperty(name: string): void {
    this.values.delete(name);
    this.priorities.delete(name);
  }
}

function element(display?: string, priority?: string): HTMLElement {
  return { style: new FakeStyle(display, priority) } as unknown as HTMLElement;
}

function target({
  exportOnly = [],
  actions = [],
  exportText = [],
}: {
  exportOnly?: HTMLElement[];
  actions?: HTMLElement[];
  exportText?: HTMLElement[];
}): HTMLElement {
  return {
    querySelectorAll(selector: string) {
      if (selector === EXPORT_ONLY_SELECTOR) return exportOnly;
      if (selector === EXPORT_ACTIONS_SELECTOR) return actions;
      if (selector === EXPORT_TEXT_SELECTOR) return exportText;
      return [];
    },
  } as unknown as HTMLElement;
}

describe("export DOM capture helpers", () => {
  it("reveals export-only report chrome and restores original display styles", () => {
    const hidden = element();
    const flex = element("flex");
    const root = target({ exportOnly: [hidden, flex] });

    const restore = showExportOnly(root);

    expect(hidden.style.getPropertyValue("display")).toBe("block");
    expect(hidden.style.getPropertyPriority("display")).toBe("important");
    expect(flex.style.getPropertyValue("display")).toBe("block");
    expect(flex.style.getPropertyPriority("display")).toBe("important");

    restore();

    expect(hidden.style.getPropertyValue("display")).toBe("");
    expect(hidden.style.getPropertyPriority("display")).toBe("");
    expect(flex.style.getPropertyValue("display")).toBe("flex");
    expect(flex.style.getPropertyPriority("display")).toBe("");
  });

  it("hides page actions during capture and preserves important display priorities", () => {
    const actions = element("grid", "important");
    const root = target({ actions: [actions] });

    const restore = hideActionsForExport(root);

    expect(actions.style.getPropertyValue("display")).toBe("none");
    expect(actions.style.getPropertyPriority("display")).toBe("important");

    restore();

    expect(actions.style.getPropertyValue("display")).toBe("grid");
    expect(actions.style.getPropertyPriority("display")).toBe("important");
  });

  it("relaxes marked text metrics during capture and restores existing inline styles", () => {
    const clipped = element();
    clipped.style.setProperty("line-height", "1.25");
    clipped.style.setProperty("overflow", "hidden", "important");
    clipped.style.setProperty("padding-block", "2px");
    const root = target({ exportText: [clipped] });

    const restore = relaxTextForExport(root);

    expect(clipped.style.getPropertyValue("line-height")).toBe("1.75");
    expect(clipped.style.getPropertyPriority("line-height")).toBe("important");
    expect(clipped.style.getPropertyValue("overflow")).toBe("visible");
    expect(clipped.style.getPropertyPriority("overflow")).toBe("important");
    expect(clipped.style.getPropertyValue("padding-block")).toBe("0.2em");
    expect(clipped.style.getPropertyPriority("padding-block")).toBe("important");
    expect(clipped.style.getPropertyValue("white-space")).toBe("normal");
    expect(clipped.style.getPropertyPriority("white-space")).toBe("important");
    expect(clipped.style.getPropertyValue("text-overflow")).toBe("clip");
    expect(clipped.style.getPropertyPriority("text-overflow")).toBe("important");

    restore();

    expect(clipped.style.getPropertyValue("line-height")).toBe("1.25");
    expect(clipped.style.getPropertyPriority("line-height")).toBe("");
    expect(clipped.style.getPropertyValue("overflow")).toBe("hidden");
    expect(clipped.style.getPropertyPriority("overflow")).toBe("important");
    expect(clipped.style.getPropertyValue("padding-block")).toBe("2px");
    expect(clipped.style.getPropertyPriority("padding-block")).toBe("");
    expect(clipped.style.getPropertyValue("white-space")).toBe("");
    expect(clipped.style.getPropertyPriority("white-space")).toBe("");
    expect(clipped.style.getPropertyValue("text-overflow")).toBe("");
    expect(clipped.style.getPropertyPriority("text-overflow")).toBe("");
  });

  it("prepares report chrome, actions, and text through one cleanup function", () => {
    const exportOnly = element();
    const actions = element("flex");
    const exportText = element();
    const root = target({
      exportOnly: [exportOnly],
      actions: [actions],
      exportText: [exportText],
    });

    const restore = prepareRasterExportTarget(root);

    expect(exportOnly.style.getPropertyValue("display")).toBe("block");
    expect(actions.style.getPropertyValue("display")).toBe("none");
    expect(exportText.style.getPropertyValue("line-height")).toBe("1.75");

    restore();

    expect(exportOnly.style.getPropertyValue("display")).toBe("");
    expect(actions.style.getPropertyValue("display")).toBe("flex");
    expect(exportText.style.getPropertyValue("line-height")).toBe("");
  });

  it("uses white as the server/test fallback page background", () => {
    expect(getPageBackground()).toBe("white");
  });
});
