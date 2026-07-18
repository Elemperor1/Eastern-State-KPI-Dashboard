import {
  STRATEGIC_GOAL_DEFINITIONS,
  STRATEGIC_KPI_DEFINITIONS,
  STRATEGIC_PLAN_SOURCE_REFERENCE,
} from "../../src/features/catalog/strategic-config";
import type { StrategicConfigurationBootstrapInput } from "../../src/features/strategy/mutations";
import { EASTERN_STATE_INSTALLATION_FIXTURE } from "./installation-fixture";

/** Explicit fresh-install input. Runtime feature modules never import it. */
export const EASTERN_STATE_STRATEGIC_CONFIGURATION_FIXTURE = {
  planStartYear: EASTERN_STATE_INSTALLATION_FIXTURE.plan.startYear,
  planEndYear: EASTERN_STATE_INSTALLATION_FIXTURE.plan.endYear,
  sourceReference: STRATEGIC_PLAN_SOURCE_REFERENCE,
  goals: STRATEGIC_GOAL_DEFINITIONS,
  kpis: STRATEGIC_KPI_DEFINITIONS,
} satisfies StrategicConfigurationBootstrapInput;
