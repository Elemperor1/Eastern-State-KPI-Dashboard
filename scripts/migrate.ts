/** Apply the application's idempotent SQLite migration without seeding data. */
import { getDb, resetDb, SCHEMA_VERSION } from "../src/lib/db";
import { ensureStrategicPlanConfiguration } from "../src/features/strategy/server";

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
  const strategicConfigCount = Number(
    (
      db
        .prepare("SELECT COUNT(*) AS count FROM kpi_measurement_configs")
        .get() as { count: number }
    ).count,
  );
  if (kpiCount > 0 && strategicConfigCount === 0) {
    const configured = ensureStrategicPlanConfiguration();
    console.log(
      `[migrate] strategic configuration ready (${configured.goals.created + configured.goals.updated + configured.goals.unchanged} goals, ${configured.measurement_configs.created + configured.measurement_configs.updated + configured.measurement_configs.unchanged} KPI configs).`,
    );
  }
  console.log(`[migrate] schema ${actual} ready; existing data left intact.`);
  resetDb();
}

main();
