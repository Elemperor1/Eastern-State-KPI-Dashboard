/**
 * Resets KPI-owned sample data and seeds the canonical strategic plan.
 * Users are preserved; audit history is reset with the replaced sample rows.
 */
import path from "node:path";
import { ensureSeedAdmin } from "../src/features/auth/server";
import { bootstrapInstallation } from "../src/features/installation/server";
import {
  createCategory,
  createKPI,
  listKPIs,
} from "../src/features/catalog/server";
import {
  STRATEGIC_PLAN_BASELINE_YEAR,
  STRATEGIC_PLAN_CATEGORIES,
  STRATEGIC_PLAN_YEARS,
} from "../src/features/catalog/strategic-plan";
import { getDb, transaction } from "../src/lib/db";
import { initializeStrategicPlanConfiguration } from "../src/features/strategy/mutations";
import {
  seedLegacyBreakdown,
  seedLegacyGoal,
  seedLegacyScalar,
} from "./legacy-seed";
import { EASTERN_STATE_INSTALLATION_FIXTURE } from "./bootstrap/installation-fixture";
import { EASTERN_STATE_STRATEGIC_CONFIGURATION_FIXTURE } from "./bootstrap/strategic-configuration-fixture";

/** Removes or resets strategic plan data. */
function resetStrategicPlanData(): void {
  const db = getDb();
  db.exec(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('seed_reset_internal_write', '1');",
  );
  // S053-C1: tombstone for the destructive reset. `meta` survives the
  // wipe, so the timestamp of the most recent deliberate reset remains
  // auditable after every audit table has been cleared.
  db.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('last_seed_reset_at', datetime('now'));");
  // Schema-10 strategy sidecars use RESTRICT foreign keys so no strategic
  // history or definition can disappear through an ordinary entity delete.
  // `db:seed` is the one explicit disposable-data reset, so clear those rows
  // deliberately in dependency order before replacing the legacy sample set.
  db.exec("DELETE FROM board_reporting_audit_events;");
  db.exec("DELETE FROM board_reporting_scopes;");
  db.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('board_reporting_scope_initialized', '0');");
  db.exec("DELETE FROM strategic_audit_events;");
  db.exec("DELETE FROM distribution_values;");
  db.exec("DELETE FROM distribution_observations;");
  db.exec("DELETE FROM distribution_bands;");
  db.exec("DELETE FROM kpi_component_entries;");
  db.exec("DELETE FROM kpi_targets;");
  db.exec("DELETE FROM kpi_components;");
  db.exec("DELETE FROM kpi_observations;");
  db.exec("DELETE FROM goal_kpis;");
  db.exec("DELETE FROM strategic_goals;");
  db.exec("DELETE FROM kpi_measurement_configs;");
  db.exec("DELETE FROM entry_history;");
  db.exec("DELETE FROM breakdown_entries;");
  db.exec("DELETE FROM monthly_entries;");
  db.exec("DELETE FROM kpi_goals;");
  db.exec("DELETE FROM kpis;");
  db.exec("DELETE FROM categories;");
  db.exec("DELETE FROM installation_audit_events;");
  db.exec("DELETE FROM strategic_plans;");
  db.exec("DELETE FROM organizations;");
  db.exec(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('seed_reset_internal_write', '0');",
  );
  db.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('sample_data', '1');");
}

/**
 * S053-C1: `db:seed` wipes every KPI-owned table — including all audit
 * history — against whatever DATABASE_PATH resolves to, with no
 * confirmation. Require the operator to name the exact database they
 * intend to reset via SEED_CONFIRM (the fully-resolved DATABASE_PATH),
 * and refuse outright under NODE_ENV=production unless `--force` is
 * passed. Production rollout of an existing database is `db:migrate`;
 * the seed remains the explicit disposable-data reset for development,
 * CI, and first-boot container initialization (which passes
 * SEED_CONFIRM itself after its own safety probe).
 */
function assertSeedResetAuthorized(): void {
  const databasePath = path.resolve(
    process.env.DATABASE_PATH ?? "./data/kpi.db",
  );
  if (process.env.SEED_CONFIRM !== databasePath) {
    throw new Error(
      `Refusing to reset KPI data: this deletes every KPI-owned table including all audit history in ${databasePath}. ` +
        `Set SEED_CONFIRM="${databasePath}" to confirm this exact database, or use npm run db:migrate for an existing database.`,
    );
  }
  if (
    process.env.NODE_ENV === "production" &&
    !process.argv.includes("--force")
  ) {
    throw new Error(
      "Refusing to reset KPI data with NODE_ENV=production. Use npm run db:migrate for an existing database; " +
        "pass --force only for a deliberate disposable reset.",
    );
  }
}

/** Runs the main workflow. */
function main(): void {
  assertSeedResetAuthorized();
  console.log("Resetting KPI data...");
  let entryCount = 0;
  let goalCount = 0;

  transaction(() => {
    resetStrategicPlanData();
    bootstrapInstallation(EASTERN_STATE_INSTALLATION_FIXTURE);

    for (const category of STRATEGIC_PLAN_CATEGORIES) {
      const created = createCategory({
        slug: category.slug,
        name: category.name,
        description: category.description,
        sort_order: category.sort_order,
      });

      for (const definition of category.annual) {
        const kpi = createKPI({
          category_id: created.id,
          slug: definition.slug,
          name: definition.name,
          unit: definition.unit,
          unit_type: definition.unit_type,
          reporting_frequency: "annual",
          direction: definition.direction,
          description: definition.description,
          sort_order: definition.sort_order,
        });
        for (const year of STRATEGIC_PLAN_YEARS) {
          seedLegacyScalar({
            kpiId: kpi.id,
            year,
            value: definition.annual[year],
            notes: null,
          });
          entryCount++;
        }
        if (definition.goal) {
          const baselineValue =
            definition.annual[STRATEGIC_PLAN_BASELINE_YEAR];
          seedLegacyGoal({
            kpiId: kpi.id,
            targetYear: definition.goal.target_year,
            baselineYear: STRATEGIC_PLAN_BASELINE_YEAR,
            goalType: "growth_pct" in definition.goal ? "pct" : "number",
            targetValue: "growth_pct" in definition.goal
              ? definition.goal.growth_pct
              : definition.goal.target - baselineValue,
            notes: definition.goal.notes ?? null,
          });
          goalCount++;
        }
      }

      for (const definition of category.breakdown ?? []) {
        const kpi = createKPI({
          category_id: created.id,
          slug: definition.slug,
          name: definition.name,
          unit: definition.unit,
          unit_type: "breakdown",
          reporting_frequency: "annual",
          direction: definition.direction,
          description: definition.description,
          sort_order: definition.sort_order,
        });
        for (const year of STRATEGIC_PLAN_YEARS) {
          const values = definition.breakdown[year];
          for (const [sortOrder, label] of definition.labels.entries()) {
            seedLegacyBreakdown({
              kpiId: kpi.id,
              year,
              label,
              value: values[label] ?? 0,
              sortOrder,
              notes: null,
            });
            entryCount++;
          }
        }
      }
    }
  });

  const strategicConfiguration = initializeStrategicPlanConfiguration(
    EASTERN_STATE_STRATEGIC_CONFIGURATION_FIXTURE,
  );
  ensureSeedAdmin();
  const kpis = listKPIs();
  console.log(
    `\nSeed complete. ${kpis.length} KPIs and ${strategicConfiguration.goals.created + strategicConfiguration.goals.updated + strategicConfiguration.goals.unchanged} strategic goals ready across ${STRATEGIC_PLAN_YEARS[0]}–${STRATEGIC_PLAN_YEARS[STRATEGIC_PLAN_YEARS.length - 1]} (${entryCount} values, ${goalCount} legacy KPI targets).`,
  );
}

main();
