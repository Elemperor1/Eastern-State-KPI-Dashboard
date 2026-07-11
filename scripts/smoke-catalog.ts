import { listKPIs } from "../src/features/catalog/server";
import {
  listEffectiveMeasurementConfigs,
  listStrategyObservations,
} from "../src/features/strategy/server";

type SmokeCatalogIds = {
  entryKpi: number;
  currencyKpi: number;
  breakdownKpi: number;
  bypassKpi: number;
  strategyPercentageKpi: number;
  strategyPercentageYear: number;
};

function fixtureIds(): SmokeCatalogIds {
  return {
    entryKpi: 1,
    currencyKpi: 2,
    breakdownKpi: 3,
    bypassKpi: 1,
    strategyPercentageKpi: 4,
    strategyPercentageYear: 2026,
  };
}

function realIds(): SmokeCatalogIds {
  const bySlug = new Map(listKPIs().map((kpi) => [kpi.slug, kpi.id]));
  const idFor = (slug: string): number => {
    const id = bySlug.get(slug);
    if (id == null) {
      throw new Error(`smoke-catalog: missing required KPI slug ${slug}`);
    }
    return id;
  };

  const strategyPercentageSlot = [2029, 2028, 2027, 2026, 2025]
    .flatMap((year) =>
      listEffectiveMeasurementConfigs(year)
        .filter(
          (configuration) =>
            configuration.measurement_type === "percentage" &&
            configuration.archived_at === null,
        )
        .map((configuration) => ({ year, kpiId: configuration.kpi_id })),
    )
    .find(
      ({ year, kpiId }) =>
        listStrategyObservations({ kpi_id: kpiId, reporting_year: year })
          .length === 0,
    );
  if (!strategyPercentageSlot) {
    throw new Error(
      "smoke-catalog: no unused strategic percentage reporting slot is available",
    );
  }

  return {
    entryKpi: idFor("interpretive-plan-milestones-on-schedule"),
    currencyKpi: idFor("conservation-funds-utilized"),
    breakdownKpi: idFor("revenue-by-stream"),
    bypassKpi: idFor("interpretive-plan-milestones-on-schedule"),
    strategyPercentageKpi: strategyPercentageSlot.kpiId,
    strategyPercentageYear: strategyPercentageSlot.year,
  };
}

const ids = process.env.SMOKE_CATALOG_FIXTURE === "true" ? fixtureIds() : realIds();
process.stdout.write(`${JSON.stringify({ ids })}\n`);
