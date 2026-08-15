/**
 * Emit the cost-year table as JSON so the documentation renders the REAL
 * pack values instead of a hand-copied table.
 *
 * This exists because the hand-maintained version drifted: §33 claimed a
 * 2024 stack life of 40 000 h while the engine used 50 000, which changes
 * replacement timing from years 6/12/18 to 8/15 — a visible, checkable
 * difference that nonetheless sat in the docs unnoticed. It also still
 * carried the pre-IRENA CAPEX multipliers. Generating the table removes the
 * copy step that made both possible.
 *
 *   npm run docs:costpacks
 *
 * Re-run after editing COST_PACKS.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { COST_PACKS, COST_YEARS } from "./lcohSweep";
import { ROOT } from "./serviceDeps";

function main(): void {
  const base = COST_PACKS[2024];
  const mult = (get: (y: (typeof COST_YEARS)[number]) => number): string[] =>
    COST_YEARS.map((y) => {
      const v = get(y) / get(2024);
      return v.toFixed(2);
    });

  const rows = [
    {
      driver: "Electrolyser CAPEX",
      unit: "USD/kW",
      values: COST_YEARS.map((y) =>
        COST_PACKS[y].electrolyzerCapexUsdPerKw.toString(),
      ),
      multipliers: mult((y) => COST_PACKS[y].electrolyzerCapexUsdPerKw),
    },
    {
      driver: "Solar PV CAPEX",
      unit: "USD/kWp",
      values: COST_YEARS.map((y) => COST_PACKS[y].solarCapexUsdPerKw.toString()),
      multipliers: mult((y) => COST_PACKS[y].solarCapexUsdPerKw),
    },
    {
      driver: "Onshore wind CAPEX",
      unit: "USD/kW",
      values: COST_YEARS.map((y) => COST_PACKS[y].windCapexUsdPerKw.toString()),
      multipliers: mult((y) => COST_PACKS[y].windCapexUsdPerKw),
    },
    {
      driver: "Efficiency (LHV)",
      unit: "%",
      values: COST_YEARS.map(
        (y) => `${(COST_PACKS[y].efficiencyLhv * 100).toFixed(0)}%`,
      ),
      multipliers: mult((y) => COST_PACKS[y].efficiencyLhv),
    },
    {
      driver: "Stack life",
      unit: "h",
      values: COST_YEARS.map(
        (y) => `${(COST_PACKS[y].stackLifetimeHours / 1000).toFixed(0)}k`,
      ),
      multipliers: mult((y) => COST_PACKS[y].stackLifetimeHours),
    },
    {
      driver: "Degradation",
      unit: "%/yr",
      values: COST_YEARS.map((y) =>
        (COST_PACKS[y].degradationPerYear * 100).toFixed(1),
      ),
      multipliers: mult((y) => COST_PACKS[y].degradationPerYear),
    },
  ];

  const payload = {
    generatedBy: "scripts/lib/gen-cost-packs-doc.ts",
    years: COST_YEARS,
    costBasisYear: base.costBasisYear,
    opex: {
      solarFraction: base.solarOpexFrac,
      windFraction: base.windOpexFrac,
    },
    rows,
  };

  const dir = `${ROOT}data/cost-packs`;
  mkdirSync(dir, { recursive: true });
  const path = `${dir}/table.json`;
  writeFileSync(path, JSON.stringify(payload, null, 1) + "\n", "utf8");
  console.log(`wrote ${path}: ${rows.length} drivers x ${COST_YEARS.length} years`);
}

main();
