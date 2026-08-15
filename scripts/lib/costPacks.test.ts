import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COST_PACKS, COST_YEARS } from "./lcohSweep";
import { ROOT } from "./serviceDeps";

/**
 * Guards on the cost packs.
 *
 * The bug these exist to catch is not an arithmetic one: the map ran IRENA
 * 2023 generation costs under a 2024 label for months, and every number it
 * produced was internally consistent. Nothing failed, because nothing
 * checked that the data matched the label. So these tests pin the published
 * anchors to their source values and assert the vintage is declared.
 */

describe("COST_PACKS anchors", () => {
  it("uses IRENA 2024 global weighted-average installed costs for 2024", () => {
    // IRENA, Renewable Power Generation Costs in 2024 (published July 2025):
    // solar PV 691 USD/kW, onshore wind 1,041 USD/kW. Change these only when
    // moving to a newer edition, and move costBasisYear with them.
    expect(COST_PACKS[2024].solarCapexUsdPerKw).toBe(691);
    expect(COST_PACKS[2024].windCapexUsdPerKw).toBe(1041);
    expect(COST_PACKS[2024].costBasisYear).toBe(2024);
  });

  it("declares a generation-cost vintage for every cost year", () => {
    for (const year of COST_YEARS) {
      const pack = COST_PACKS[year];
      expect(pack.costBasisYear, `${year} must declare costBasisYear`).toBeGreaterThan(2000);
      // A future-year pack is a projection FROM a published vintage, so its
      // basis year can never be later than the year it projects.
      expect(pack.costBasisYear).toBeLessThanOrEqual(year);
    }
  });

  it("never lets generation costs rise across cost years", () => {
    // Non-increasing, not strictly falling: IRENA projects onshore wind to
    // STABILISE at 850-1,000 USD/kW rather than keep declining, so a flat
    // late-period wind figure is the sourced behaviour, not a stuck value.
    for (let i = 1; i < COST_YEARS.length; i++) {
      const prev = COST_PACKS[COST_YEARS[i - 1]!];
      const cur = COST_PACKS[COST_YEARS[i]!];
      expect(cur.solarCapexUsdPerKw).toBeLessThan(prev.solarCapexUsdPerKw);
      expect(cur.windCapexUsdPerKw).toBeLessThanOrEqual(prev.windCapexUsdPerKw);
    }
  });

  it("keeps projected wind CAPEX inside IRENA's stabilisation band", () => {
    // IRENA: onshore wind TIC declines ~20% over the coming decade and
    // stabilises at USD 850-1,000/kW. A projection below 850 would be
    // extrapolating past what the source actually says happens.
    for (const year of COST_YEARS) {
      if (year === 2024) continue;
      expect(COST_PACKS[year].windCapexUsdPerKw).toBeGreaterThanOrEqual(850);
    }
  });

  it("keeps solar cheaper per kW than onshore wind in every year", () => {
    // True in every IRENA edition since 2019 and structural to the
    // technologies; a pack that inverts it is a data-entry error.
    for (const year of COST_YEARS) {
      expect(COST_PACKS[year].solarCapexUsdPerKw).toBeLessThan(
        COST_PACKS[year].windCapexUsdPerKw,
      );
    }
  });

  it("improves electrolyser durability and efficiency monotonically", () => {
    for (let i = 1; i < COST_YEARS.length; i++) {
      const prev = COST_PACKS[COST_YEARS[i - 1]!];
      const cur = COST_PACKS[COST_YEARS[i]!];
      expect(cur.stackLifetimeHours).toBeGreaterThan(prev.stackLifetimeHours);
      expect(cur.efficiencyLhv).toBeGreaterThan(prev.efficiencyLhv);
      expect(cur.degradationPerYear).toBeLessThan(prev.degradationPerYear);
    }
  });

  it("starts stack life at the IEA economic optimum of 50,000 h", () => {
    // Not 40,000: the 40k figure appears in an older methodology table and
    // is wrong about what the engine does. Replacement timing depends on it.
    expect(COST_PACKS[2024].stackLifetimeHours).toBe(50_000);
  });
});

describe("the generated documentation table", () => {
  // §33 showed a hand-copied table that drifted from the code: a 2024 stack
  // life of 40k against the engine's 50k, and pre-IRENA CAPEX multipliers.
  // The table is generated now, and this asserts the artifact was
  // regenerated after the packs changed — otherwise the docs go stale again,
  // just more quietly.
  it("matches the current cost packs", () => {
    const table = JSON.parse(
      readFileSync(`${ROOT}data/cost-packs/table.json`, "utf8"),
    ) as {
      years: number[];
      costBasisYear: number;
      rows: { driver: string; values: string[] }[];
    };
    expect(table.years).toEqual([...COST_YEARS]);
    expect(table.costBasisYear).toBe(COST_PACKS[2024].costBasisYear);

    const row = (driver: string): string[] => {
      const found = table.rows.find((r) => r.driver === driver);
      expect(found, `missing row: ${driver}`).toBeDefined();
      return found!.values;
    };
    expect(row("Solar PV CAPEX")).toEqual(
      COST_YEARS.map((y) => COST_PACKS[y].solarCapexUsdPerKw.toString()),
    );
    expect(row("Onshore wind CAPEX")).toEqual(
      COST_YEARS.map((y) => COST_PACKS[y].windCapexUsdPerKw.toString()),
    );
    expect(row("Electrolyser CAPEX")).toEqual(
      COST_YEARS.map((y) => COST_PACKS[y].electrolyzerCapexUsdPerKw.toString()),
    );
    expect(row("Stack life")).toEqual(
      COST_YEARS.map((y) => `${COST_PACKS[y].stackLifetimeHours / 1000}k`),
    );
  });
});
