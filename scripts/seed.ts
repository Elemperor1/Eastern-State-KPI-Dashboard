/**
 * Resets KPI-owned sample data and seeds the canonical strategic plan.
 * Users are preserved; audit history is reset with the replaced sample rows.
 */
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
import { ensureStrategicPlanConfiguration } from "../src/features/strategy/server";
import {
  seedLegacyBreakdown,
  seedLegacyGoal,
  seedLegacyScalar,
} from "./legacy-seed";
import { EASTERN_STATE_INSTALLATION_FIXTURE } from "./bootstrap/installation-fixture";

function resetStrategicPlanData(): void {
  const db = getDb();
  // Schema-10 strategy sidecars use RESTRICT foreign keys so no strategic
  // history or definition can disappear through an ordinary entity delete.
  // `db:seed` is the one explicit disposable-data reset, so clear those rows
  // deliberately in dependency order before replacing the legacy sample set.
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
  db.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('sample_data', '1');");
}

function main(): void {
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

  const strategicConfiguration = ensureStrategicPlanConfiguration();
  ensureSeedAdmin();
  const kpis = listKPIs();
  console.log(
    `\nSeed complete. ${kpis.length} KPIs and ${strategicConfiguration.goals.created + strategicConfiguration.goals.updated + strategicConfiguration.goals.unchanged} strategic goals ready across ${STRATEGIC_PLAN_YEARS[0]}–${STRATEGIC_PLAN_YEARS[STRATEGIC_PLAN_YEARS.length - 1]} (${entryCount} values, ${goalCount} legacy KPI targets).`,
  );
}

main();
