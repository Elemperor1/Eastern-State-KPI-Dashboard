// @vitest-environment jsdom

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetch: apiFetchMock }));

import { BoardReportingEditorClient } from "./BoardReportingEditorClient";

describe("BoardReportingEditorClient", () => {
  const model = {
    scope: {
      id: 1,
      planId: 2,
      revision: 3,
      priorities: [{
        id: 4,
        priorityId: 5,
        prioritySlug: "visitor",
        priorityName: "Visitor Experience",
        displayTitle: "Board visitor focus",
        displayOrder: 10,
        statements: [{
          id: 6,
          text: "Grow attendance.",
          displayOrder: 10,
          measures: [{ id: 7, slug: "attendance", name: "Attendance" }],
        }],
      }],
    },
    availablePriorities: [{
      id: 5,
      slug: "visitor",
      name: "Visitor Experience",
      measures: [
        { id: 7, slug: "attendance", name: "Attendance" },
        { id: 8, slug: "budget", name: "Budget impact" },
      ],
    }],
  };

  beforeEach(() => apiFetchMock.mockReset());
  afterEach(cleanup);

  /** Returns an API-shaped JSON response for an editor scenario. */
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  it("renders editable persisted scope controls and the saved-result preview", () => {
    const html = renderToStaticMarkup(createElement(BoardReportingEditorClient, {
      initialModel: model,
    }));
    expect(html).toContain("Board visibility");
    expect(html).toContain("Board visitor focus");
    expect(html).toContain("Grow attendance.");
    expect(html).toContain("Attendance ×");
    expect(html).toContain("Budget impact");
    expect(html).toContain("Board preview");
    expect(html).toContain("Save Board visibility");
  });

  it("participates as an independent source in the shared unsaved-change guard", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "src/app/setup/_components/BoardReportingEditorClient.tsx"),
      "utf8",
    );
    expect(source).toContain('setSourceState("board-reporting", { dirty: isDirty, busy })');
    expect(source).toContain('clearSourceState("board-reporting")');
  });

  it("saves a valid edit and adopts the returned revision as its clean baseline", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({
      scope: {
        ...model.scope,
        revision: 4,
        priorities: [{ ...model.scope.priorities[0], displayTitle: "Updated Board focus" }],
      },
    }));
    render(<BoardReportingEditorClient initialModel={model} />);

    fireEvent.change(screen.getByLabelText("Board title"), {
      target: { value: "Updated Board focus" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Board visibility" }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/strategy/board-reporting",
      expect.objectContaining({
        method: "PATCH",
        body: expect.objectContaining({ expectedRevision: 3 }),
      }),
    ));
    expect(await screen.findByText("Board visibility settings saved.")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Save Board visibility" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("rejects an empty focus statement without sending a request", async () => {
    render(<BoardReportingEditorClient initialModel={model} />);
    fireEvent.change(screen.getByLabelText("Focus statement 1"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Board visibility" }));

    expect(await screen.findByText(
      "Every visible priority needs a title, and every focus statement needs text.",
    )).toBeTruthy();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("shows the server conflict instead of replacing a newer Board scope", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({
      error: "The Board visibility settings changed. Refresh and try again.",
    }, 409));
    render(<BoardReportingEditorClient initialModel={model} />);
    fireEvent.change(screen.getByLabelText("Board title"), {
      target: { value: "Conflicting edit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Board visibility" }));

    expect(await screen.findByText(
      "The Board visibility settings changed. Refresh and try again.",
    )).toBeTruthy();
  });

  it("shows a generic error when the server cannot save the scope", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({}, 500));
    render(<BoardReportingEditorClient initialModel={model} />);
    fireEvent.change(screen.getByLabelText("Board title"), {
      target: { value: "Offline edit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Board visibility" }));

    expect(await screen.findByText(
      "The Board visibility settings could not be saved.",
    )).toBeTruthy();
  });
});
