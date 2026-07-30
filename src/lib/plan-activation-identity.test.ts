import { describe, expect, it, vi } from "vitest";
import {
  clearPlanActivationIdentity,
  clearResolvedPlanActivationIdentity,
  getOrCreatePlanActivationIdentity,
  type PlanActivationIdentityStorage,
} from "./plan-activation-identity";

/** Creates the minimal browser storage seam used by activation identity tests. */
function memoryStorage(): PlanActivationIdentityStorage {
  const values = new Map<string, string>();
  return {
    /** Reads one Draft-bound activation identity. */
    getItem: (key) => values.get(key) ?? null,
    /** Persists one Draft-bound activation identity. */
    setItem: (key, value) => values.set(key, value),
    /** Clears one resolved Draft-bound activation identity. */
    removeItem: (key) => values.delete(key),
  };
}

describe("plan activation browser identity", () => {
  it("reuses one Draft-bound identity across a lost response and refresh", () => {
    const storage = memoryStorage();
    const first = "019c0000-0000-7000-8000-000000000001";
    const createId = vi.fn(() => first);

    expect(getOrCreatePlanActivationIdentity(storage, 42, createId)).toBe(first);
    expect(getOrCreatePlanActivationIdentity(storage, 42, createId)).toBe(first);
    expect(createId).toHaveBeenCalledTimes(1);
  });

  it("clears only a confirmed matching outcome or a server-resolved Draft", () => {
    const storage = memoryStorage();
    const first = "019c0000-0000-7000-8000-000000000001";
    getOrCreatePlanActivationIdentity(storage, 42, () => first);

    clearPlanActivationIdentity(
      storage,
      42,
      "019c0000-0000-7000-8000-000000000002",
    );
    expect(getOrCreatePlanActivationIdentity(storage, 42, vi.fn())).toBe(first);

    clearResolvedPlanActivationIdentity(storage, 42);
    expect(getOrCreatePlanActivationIdentity(storage, 42, vi.fn())).toBe(first);

    clearResolvedPlanActivationIdentity(storage, null);
    const next = "019c0000-0000-7000-8000-000000000003";
    expect(getOrCreatePlanActivationIdentity(storage, 43, () => next)).toBe(next);
  });
});
