import { listKPIs } from "../src/features/catalog/server";

type SmokeCatalogIds = {
  entryKpi: number;
  currencyKpi: number;
  breakdownKpi: number;
  bypassKpi: number;
};

function fixtureIds(): SmokeCatalogIds {
  return {
    entryKpi: 1,
    currencyKpi: 2,
    breakdownKpi: 3,
    bypassKpi: 1,
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

  return {
    entryKpi: idFor("interpretive-plan-milestones-on-schedule"),
    currencyKpi: idFor("conservation-funds-utilized"),
    breakdownKpi: idFor("revenue-by-stream"),
    bypassKpi: idFor("interpretive-plan-milestones-on-schedule"),
  };
}

const ids = process.env.SMOKE_CATALOG_FIXTURE === "true" ? fixtureIds() : realIds();
process.stdout.write(`${JSON.stringify({ ids })}\n`);
