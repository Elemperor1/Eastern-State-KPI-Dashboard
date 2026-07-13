/** Apply the application's idempotent SQLite migration without seeding data. */
import { getDb, resetDb, SCHEMA_VERSION } from "../src/lib/db";
import {
  ensureStrategicPlanConfiguration,
  reconcileStrategicMigrationData,
} from "../src/features/strategy/server";

function main(): void {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
    .get() as { value?: string } | undefined;
  const actual = Number(row?.value ?? 0);
  if (actual !== SCHEMA_VERSION) {
    throw new Error(
      `Migration stopped at schema ${actual || "missing"}; expected ${SCHEMA_VERSION}.`,
    );
  }
  const kpiCount = Number(
    (db.prepare("SELECT COUNT(*) AS count FROM kpis").get() as { count: number })
      .count,
  );
  if (kpiCount > 0) {
    const strategicEntityCount = Number(
      (db.prepare(
        `SELECT
           (SELECT COUNT(*) FROM strategic_goals) +
           (SELECT COUNT(*) FROM kpi_measurement_configs) +
           (SELECT COUNT(*) FROM goal_kpis) +
           (SELECT COUNT(*) FROM kpi_components) +
           (SELECT COUNT(*) FROM kpi_targets) AS count`,
      ).get() as { count: number }).count,
    );
    if (strategicEntityCount === 0) {
      const configured = ensureStrategicPlanConfiguration();
      console.log(
        `[migrate] initialized strategic configuration (${configured.goals.created} goals, ${configured.measurement_configs.created} KPI configs).`,
      );
    } else {
      const reconciled = reconcileStrategicMigrationData();
      console.log(
        `[migrate] preservation-safe strategic reconciliation (${reconciled.governmentSupportRatio} government-support ratio; ${reconciled.canonicalGoalMetadata} goal metadata, ${reconciled.canonicalMemberships} memberships, ${reconciled.canonicalMeasurementMetadata} measurement metadata, ${reconciled.canonicalTargets} target contracts repaired).`,
      );
    }
  }
  console.log(`[migrate] schema ${actual} ready; existing data left intact.`);
  resetDb();
}

main();
