import { describe, expect, it } from "vitest";
import { readJsonObject } from "./api-client";

describe("readJsonObject", () => {
  it("returns a parsed object without exposing an any-typed payload", async () => {
    const response = Response.json({ error: "Invalid request" });

    await expect(readJsonObject(response)).resolves.toEqual({
      error: "Invalid request",
    });
  });

  it.each([null, [], "text", 42])(
    "rejects non-object JSON payload %j",
    async (payload) => {
      const response = Response.json(payload);
      await expect(readJsonObject(response)).resolves.toEqual({});
    },
  );

  it("returns an empty object for malformed JSON", async () => {
    const response = new Response("not-json", {
      headers: { "content-type": "application/json" },
    });

    await expect(readJsonObject(response)).resolves.toEqual({});
  });
});
