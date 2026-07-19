import { bootstrapInstallation } from "./server";

/** Test-only installation fixture for suites that create isolated databases. */
export function bootstrapTestInstallation() {
  return bootstrapInstallation({
    organization: {
      slug: "test-organization",
      name: "Test Organization",
      shortName: "Test",
    },
    plan: {
      slug: "test-plan-2025-2029",
      name: "Test Strategic Plan",
      description: null,
      startYear: 2025,
      endYear: 2029,
      sourceReference: "Test fixture",
    },
  }).installation;
}
