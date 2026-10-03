import type { Study } from "./types";
/** Mature-year scenario, excluding land, taxes, finance, depreciation and salvage. */
export function calculateEconomics(
  study: Study,
  hydraulicCost: number,
  price: number,
  yieldValue: number,
) {
  const e = study.economics,
    capex = hydraulicCost + e.greenhouse_capex;
  const revenue =
    e.yield_kg * (yieldValue / study.inputs.yield_kg_tree) * price;
  const opex = e.operating_cost + capex * e.maintenance_rate,
    net = revenue - opex;
  return {
    capex,
    revenue,
    opex,
    net,
    payback: net > 0 ? capex / net : null,
    cashflow: Array.from({ length: 6 }, (_, i) => -capex + net * i),
    npv:
      -capex +
      Array.from({ length: 5 }, (_, i) => net / 1.08 ** (i + 1)).reduce(
        (a, b) => a + b,
        0,
      ),
    lowNet: revenue * 0.8 - opex,
    highNet: revenue * 1.2 - opex,
  };
}
