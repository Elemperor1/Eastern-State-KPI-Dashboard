import type { FullConfig } from "@playwright/test";
import {
  cleanupE2EDatabaseRun,
  e2eDatabaseRunFromMetadata,
} from "../scripts/e2e-database";

/** Implements the global teardown operation. */
export default async function globalTeardown(
  config: FullConfig,
): Promise<void> {
  await cleanupE2EDatabaseRun(
    e2eDatabaseRunFromMetadata(config.metadata),
  );
}
