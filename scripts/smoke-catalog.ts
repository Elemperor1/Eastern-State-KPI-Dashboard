import { listKPIs } from "../src/features/catalog/server";

type SmokeCatalogIds = {
  monthlyKpi: number;
  annualKpi: number;
  breakdownKpi: number;
  bypassKpi: number;
};

function fixtureIds(): SmokeCatalogIds {
  return {
    monthlyKpi: 1,
    annualKpi: 2,
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
    monthlyKpi: idFor("video-views"),
    annualKpi: idFor("programs-offered"),
    breakdownKpi: idFor("donor-categories"),
    bypassKpi: idFor("video-views"),
  };
}

const ids = process.env.SMOKE_CATALOG_FIXTURE === "true" ? fixtureIds() : realIds();
process.stdout.write(`${JSON.stringify({ ids })}\n`);
