import { type NextRequest, NextResponse } from "next/server";

/**
 * Request-body byte cap for JSON route handlers (S004-C1 body axis,
 * NOV-C4, S019-C2, S020-C1).
 *
 * Next.js App Router route handlers have no platform body-size limit
 * (the 1 MB default applies only to Server Actions) and this repo has
 * no middleware, so historically every mutation handler buffered and
 * parsed the full request body via `req.json()` before zod validation.
 * On the single-process/single-container deployment a megabyte-scale
 * body is synchronous event-loop parse work — measured on the login
 * route as a ~0.7 s health-probe delay during a 10×5 MB burst, paid
 * even by requests that were already throttle-rejected.
 *
 * `readJsonBody` replaces the bare `req.json()` read: it pre-screens
 * the declared Content-Length, then accounts every byte while
 * streaming, so chunked requests without Content-Length and bodies
 * that outgrow their declared length are still bounded. An oversized
 * body is refused with 413 before any parse/allocation work; an
 * under-sized but malformed body keeps the historical contract — the
 * caller receives `{}` and the zod schema produces the same 400 the
 * previous `req.json().catch(() => ({}))` pattern produced.
 *
 * Authorization and the mutation/CSRF guard still run BEFORE this read
 * on every cookie-authenticated route (NOV-C4 verified the ordering),
 * so the cap bounds post-auth buffering; on the pre-auth login route
 * the per-IP throttle check runs before this read so a locked-out
 * source cannot force even a capped parse.
 */

/**
 * Default byte cap for administrative JSON mutation bodies. Matches the
 * framework's 1 MB Server Actions default; the largest legitimate
 * payload (a multi-input Data Entry batch) is orders of magnitude
 * smaller.
 */
export const MAX_JSON_BODY_BYTES = 1_048_576;

/**
 * Tighter cap for credential payloads (pre-auth login, authenticated
 * change-password): a bounded email plus one or two bounded passwords
 * never legitimately exceeds a few kilobytes.
 */
export const CREDENTIAL_BODY_MAX_BYTES = 16 * 1024;

/**
 * Result of a bounded JSON body read. `ok: false` carries a ready-made
 * 413 response the handler returns unchanged; `ok: true` carries the
 * parsed body (`{}` when the body was absent, unreadable, or not valid
 * JSON, mirroring the previous `.catch(() => ({}))` contract).
 */
export type JsonBodyRead =
  | { ok: true; body: unknown }
  | { ok: false; response: NextResponse };

/** Builds the uniform 413 refusal for an oversized JSON body. */
function payloadTooLargeResponse(): NextResponse {
  return NextResponse.json(
    { error: "Request body too large." },
    { status: 413 },
  );
}

/**
 * Reads and parses a JSON request body under a hard byte cap. The
 * declared Content-Length is checked first (fast refusal without any
 * stream work); the stream is then read with per-byte accounting so
 * chunked or under-declared bodies are still bounded. Returns 413 via
 * the result's `response` when the cap is exceeded, otherwise the
 * parsed JSON value — or `{}` for absent/malformed bodies so the zod
 * schema layer produces the same 400 as before.
 */
export async function readJsonBody(
  req: NextRequest,
  maxBytes: number = MAX_JSON_BODY_BYTES,
): Promise<JsonBodyRead> {
  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const declaredBytes = Number(declared);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      return { ok: false, response: payloadTooLargeResponse() };
    }
  }

  const stream = req.body;
  if (!stream) {
    return { ok: true, body: {} };
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, response: payloadTooLargeResponse() };
      }
      chunks.push(value);
    }
  } catch {
    // A broken stream is treated like a malformed body: the schema
    // layer reports the same 400 the previous pattern produced.
    return { ok: true, body: {} };
  }

  try {
    const text = Buffer.concat(chunks).toString("utf8");
    return { ok: true, body: JSON.parse(text) as unknown };
  } catch {
    return { ok: true, body: {} };
  }
}
