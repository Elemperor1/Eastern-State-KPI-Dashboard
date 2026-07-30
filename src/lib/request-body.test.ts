import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  CREDENTIAL_BODY_MAX_BYTES,
  MAX_JSON_BODY_BYTES,
  readJsonBody,
} from "@/lib/request-body";

/**
 * S004-C1 body axis / NOV-C4 / S019-C2 / S020-C1: the bounded JSON body
 * reader must refuse oversized bodies with a 413 result before any
 * parse work — whether the oversize is declared up front
 * (Content-Length pre-screen), arrives chunked with no declared length,
 * or outgrows an under-declared length — while preserving the previous
 * `req.json().catch(() => ({}))` contract for absent and malformed
 * bodies so schema validation still produces the same 400s.
 */

/** Builds a streaming request body from the supplied chunks. */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    /** Enqueues every fixture chunk, then closes the stream. */
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

/** Builds a POST NextRequest with a streaming body and no Content-Length. */
function streamingRequest(chunks: string[], headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(
    new Request("http://localhost/api/x", {
      method: "POST",
      headers,
      body: streamOf(chunks),
      duplex: "half",
    } as RequestInit),
  );
}

/** Builds a POST NextRequest with a plain string body. */
function stringRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(
    new Request("http://localhost/api/x", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    }),
  );
}

/** Asserts the read refused the body with a uniform 413 payload. */
async function expect413(result: Awaited<ReturnType<typeof readJsonBody>>) {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.response.status).toBe(413);
  await expect(result.response.json()).resolves.toEqual({
    error: "Request body too large.",
  });
}

describe("readJsonBody", () => {
  it("parses a normal JSON body", async () => {
    const result = await readJsonBody(stringRequest(JSON.stringify({ a: 1 })));
    expect(result).toEqual({ ok: true, body: { a: 1 } });
  });

  it("refuses a declared Content-Length over the cap without reading the stream", async () => {
    const result = await readJsonBody(
      stringRequest("x", { "content-length": String(MAX_JSON_BODY_BYTES + 1) }),
    );
    await expect413(result);
  });

  it("honours the declared cap even when the actual body is small", async () => {
    const result = await readJsonBody(
      stringRequest("{}", { "content-length": String(MAX_JSON_BODY_BYTES + 1) }),
    );
    await expect413(result);
  });

  it("refuses a chunked body with no Content-Length that exceeds the cap", async () => {
    const oversized = "x".repeat(MAX_JSON_BODY_BYTES + 1);
    const result = await readJsonBody(streamingRequest([oversized]));
    await expect413(result);
  });

  it("refuses a body that outgrows its under-declared Content-Length", async () => {
    const oversized = "x".repeat(MAX_JSON_BODY_BYTES + 1);
    const result = await readJsonBody(
      streamingRequest([oversized], { "content-length": "10" }),
    );
    await expect413(result);
  });

  it("parses a chunked body that stays within the cap", async () => {
    const result = await readJsonBody(
      streamingRequest(['{"a":', "1", "}"]),
    );
    expect(result).toEqual({ ok: true, body: { a: 1 } });
  });

  it("accepts a body at the exact byte cap and refuses one byte over", async () => {
    // {"pad":"xx…"} — pad sized so the total length hits the boundary.
    /** Builds a JSON object whose encoded length equals the requested total. */
    const build = (total: number) => `{"pad":"${"x".repeat(total - 10)}"}`;
    const cap = 64;
    const atCap = await readJsonBody(streamingRequest([build(cap)]), cap);
    expect(atCap.ok).toBe(true);
    await expect413(await readJsonBody(streamingRequest([build(cap + 1)]), cap));
  });

  it("accepts a credential body within the tighter credential cap", async () => {
    const body = JSON.stringify({ email: "a@b.test", password: "password123" });
    const result = await readJsonBody(stringRequest(body), CREDENTIAL_BODY_MAX_BYTES);
    expect(result.ok).toBe(true);
  });

  it("refuses a credential body over the tighter credential cap", async () => {
    const body = JSON.stringify({ email: "a@b.test", password: "x".repeat(CREDENTIAL_BODY_MAX_BYTES) });
    const result = await readJsonBody(stringRequest(body), CREDENTIAL_BODY_MAX_BYTES);
    await expect413(result);
  });

  it("returns {} for malformed JSON so the schema layer reports 400 as before", async () => {
    const result = await readJsonBody(stringRequest("not json"));
    expect(result).toEqual({ ok: true, body: {} });
  });

  it("returns {} for an absent body", async () => {
    const req = new NextRequest(
      new Request("http://localhost/api/x", { method: "POST" }),
    );
    const result = await readJsonBody(req);
    expect(result).toEqual({ ok: true, body: {} });
  });
});
