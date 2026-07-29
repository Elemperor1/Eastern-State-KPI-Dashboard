/**
 * S073-C1: logout request helper extracted from LogoutButton. The
 * previous implementation ignored the fetch result and navigated to
 * /login unconditionally, so a failed sign-out (network drop, proxy
 * error, 5xx) looked successful while the session cookie stayed valid.
 * This helper reports the outcome so the UI navigates only on
 * confirmed success and surfaces failures instead.
 */

export type LogoutOutcome =
  | { ok: true }
  | { ok: false; reason: "http"; status: number }
  | { ok: false; reason: "network" };

/** Implements the logout request operation. */
export async function logoutRequest(
  fetchImpl: typeof fetch = fetch,
): Promise<LogoutOutcome> {
  try {
    const res = await fetchImpl("/api/auth/logout", { method: "POST" });
    if (!res.ok) return { ok: false, reason: "http", status: res.status };
    return { ok: true };
  } catch {
    return { ok: false, reason: "network" };
  }
}
