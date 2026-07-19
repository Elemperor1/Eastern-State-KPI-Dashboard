import { STRATEGIC_PLAN_SOURCE_REFERENCE } from "../../src/features/catalog/strategic-config";

/**
 * Fresh-install fixture only. Persisted organization and plan rows become the
 * sole authority after this input is applied once by the explicit seed path.
 */
export const EASTERN_STATE_INSTALLATION_FIXTURE = {
  organization: {
    slug: "eastern-state-penitentiary-historic-site",
    name: "Eastern State Penitentiary Historic Site",
    shortName: "Eastern State",
  },
  plan: {
    slug: "strategic-plan-2025-2029",
    name: "Strategic Plan",
    description: null,
    startYear: 2025,
    endYear: 2029,
    sourceReference: STRATEGIC_PLAN_SOURCE_REFERENCE,
  },
} as const;
