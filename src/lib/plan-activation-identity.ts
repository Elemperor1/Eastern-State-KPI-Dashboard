const PLAN_ACTIVATION_IDENTITY_KEY =
  "eastern-state-kpi:pending-plan-activation";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PlanActivationIdentityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface PendingPlanActivationIdentity {
  planId: number;
  activationId: string;
}

/** Reads one valid browser-persisted activation identity. */
function readPendingIdentity(
  storage: PlanActivationIdentityStorage,
): PendingPlanActivationIdentity | null {
  try {
    const value = storage.getItem(PLAN_ACTIVATION_IDENTITY_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<PendingPlanActivationIdentity>;
    return Number.isSafeInteger(parsed.planId) &&
      Number(parsed.planId) > 0 &&
      typeof parsed.activationId === "string" &&
      UUID_PATTERN.test(parsed.activationId)
      ? {
          planId: Number(parsed.planId),
          activationId: parsed.activationId,
        }
      : null;
  } catch {
    return null;
  }
}

/** Reuses or durably creates the idempotency identity for one exact Draft. */
export function getOrCreatePlanActivationIdentity(
  storage: PlanActivationIdentityStorage,
  planId: number,
  createId: () => string,
): string {
  const pending = readPendingIdentity(storage);
  if (pending?.planId === planId) return pending.activationId;
  const activationId = createId();
  if (!UUID_PATTERN.test(activationId)) {
    throw new Error("Plan activation identity must be a UUID.");
  }
  storage.setItem(
    PLAN_ACTIVATION_IDENTITY_KEY,
    JSON.stringify({ planId, activationId }),
  );
  return activationId;
}

/** Clears only the exact activation whose outcome is now authoritative. */
export function clearPlanActivationIdentity(
  storage: PlanActivationIdentityStorage,
  planId: number,
  activationId: string,
): void {
  const pending = readPendingIdentity(storage);
  if (
    pending?.planId === planId &&
    pending.activationId === activationId
  ) {
    try {
      storage.removeItem(PLAN_ACTIVATION_IDENTITY_KEY);
    } catch {
      // A storage-denied browser will retain the safe, reusable identity.
    }
  }
}

/** Removes a stale identity once the server model confirms its Draft resolved. */
export function clearResolvedPlanActivationIdentity(
  storage: PlanActivationIdentityStorage,
  currentDraftId: number | null,
): void {
  const pending = readPendingIdentity(storage);
  if (pending && pending.planId !== currentDraftId) {
    try {
      storage.removeItem(PLAN_ACTIVATION_IDENTITY_KEY);
    } catch {
      // A storage-denied browser cannot discard the already-safe identity.
    }
  }
}
