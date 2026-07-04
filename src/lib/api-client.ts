/**
 * D8AD-CAN-004 hardening: client-side fetch wrapper for state-changing
 * API calls. Mirrors the server-side request guard
 * (`src/lib/request-guard.ts`):
 *
 *   - Sends `Content-Type: application/json` (the only media type the
 *     guard accepts) for any request with a body.
 *   - Reads the double-submit CSRF cookie (`eastern_state_kpi_csrf`,
 *     set by /api/auth/login and /api/auth/me) and echoes its value
 *     in the `X-CSRF-Token` header. The guard compares header to
 *     cookie in constant time.
 *
 * Read-only GET calls do not need this wrapper; only POST/PATCH/PUT/
 * DELETE to the guarded mutation endpoints do. The wrapper still
 * works for GETs (it just sets the header), but callers are free to
 * use plain `fetch` for reads.
 */

export const CSRF_HEADER = "x-csrf-token";
export const CSRF_COOKIE_NAME =
  (typeof process !== "undefined" && process.env?.CSRF_COOKIE_NAME) ||
  "eastern_state_kpi_csrf";

/** Read a cookie value from document.cookie by name (browser only). */
export function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${CSRF_COOKIE_NAME}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

interface ApiFetchInit extends Omit<RequestInit, "body"> {
  /** Omit to send no body. A string body is sent as-is; an object is
   *  JSON-stringified. */
  body?: BodyInit | Record<string, unknown> | null;
}

/**
 * Fetch wrapper that adds the CSRF header and JSON content-type.
 * Pass the same arguments you would to `fetch`; `body` may be a plain
 * object (it is JSON-encoded) or a pre-serialized string.
 */
export async function apiFetch(
  input: string,
  init: ApiFetchInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = readCsrfToken();
  if (token) headers.set(CSRF_HEADER, token);

  let body: BodyInit | undefined;
  if (init.body !== undefined && init.body !== null) {
    if (typeof init.body === "string") {
      body = init.body;
    } else {
      body = JSON.stringify(init.body);
    }
    // Only set Content-Type if the caller hasn't already (a caller
    // streaming a custom body may want full control).
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  }

  return fetch(input, {
    ...init,
    headers,
    body,
    // Same-origin mutations must send the cookie. `same-origin` is the
    // browser default for same-origin fetches, but we set it explicitly
    // so a caller who copied an `init` with `credentials: "omit"` does
    // not silently break the authenticated request.
    credentials: init.credentials ?? "same-origin",
  });
}