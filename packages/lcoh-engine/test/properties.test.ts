/**
 * Property-based tests over randomized day-shape profiles and parameters.
 * Profiles are 24-value day patterns tiled across the year — cheap to
 * generate, still exercising curtailment, part-supply, and zero hours.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  LHV_H2_KWH_PER_KG,
  simulateLCOH,
  type LCOHInputs,
} from "../src/index";
import { pvOnlyInputs, tiledProfile } from "./helpers";

const dayShape = fc.array(
  fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  { minLength: 24, maxLength: 24 },
);

// At least one strictly positive hour so hydrogen is produced.
const producingDayShape = dayShape.filter((day) =>
  day.some((cf) => cf > 0.01),
);

function hybridInputs(): LCOHInputs {
  const inputs = pvOnlyInputs();
  inputs.electrolyzer.degradationPerYear = 0.01;
  inputs.electrolyzer.stackLifetimeHours = 40_000;
  inputs.wind = { capacityMw: 100, pricing: { mode: "lcoe", usdPerMwh: 30 } };
  inputs.water.desalinated = true;
  inputs.water.pumpingHeadM = 100;
  return inputs;
}

const RUNS = { numRuns: 20 };

describe("engine properties", () => {
  it("higher electrolyzer CAPEX never lowers LCOH", () => {
    fc.assert(
      fc.property(
        producingDayShape,
        fc.double({ min: 200, max: 3000, noNaN: true }),
        fc.double({ min: 1, max: 2, noNaN: true }),
        (day, capex, factor) => {
          const profiles = { pv: tiledProfile(day) };
          const low = hybridInputs();
          delete low.wind;
          low.electrolyzer.capexUsdPerKw = capex;
          const high = structuredClone(low);
          high.electrolyzer.capexUsdPerKw = capex * factor;
          expect(
            simulateLCOH(high, profiles).lcohUsdPerKg,
          ).toBeGreaterThanOrEqual(
            simulateLCOH(low, profiles).lcohUsdPerKg - 1e-9,
          );
        },
      ),
      RUNS,
    );
  });

  it("scaling profiles down (lower capacity factor) never lowers LCOH", () => {
    fc.assert(
      fc.property(
        producingDayShape,
        producingDayShape,
        fc.double({ min: 0.1, max: 1, noNaN: true }),
        (pvDay, windDay, s) => {
          const inputs = hybridInputs();
          const full = {
            pv: tiledProfile(pvDay),
            wind: tiledProfile(windDay),
          };
          const scaled = {
            pv: full.pv.map((cf) => cf * s),
            wind: full.wind.map((cf) => cf * s),
          };
          expect(
            simulateLCOH(inputs, scaled).lcohUsdPerKg,
          ).toBeGreaterThanOrEqual(
            simulateLCOH(inputs, full).lcohUsdPerKg - 1e-9,
          );
        },
      ),
      RUNS,
    );
  });

  it("energy closes: generated = consumed + curtailed per source; consumed = pv + wind + grid", () => {
    fc.assert(
      fc.property(producingDayShape, producingDayShape, (pvDay, windDay) => {
        const inputs = hybridInputs();
        inputs.grid = {
          maxImportMw: 50,
          priceUsdPerMwh: 40,
          emissionFactorTco2PerMwh: 0.3,
        };
        const profiles = {
          pv: tiledProfile(pvDay),
          wind: tiledProfile(windDay),
        };
        const r = simulateLCOH(inputs, profiles);
        const row = r.annual[0]!;
        const pvGenerated = profiles.pv.reduce((a, b) => a + b, 0) * 100_000;
        const windGenerated =
          profiles.wind.reduce((a, b) => a + b, 0) * 100_000;
        expect(
          Math.abs(pvGenerated - (row.ePvKwh + row.curtailedPvKwh)) /
            Math.max(pvGenerated, 1),
        ).toBeLessThan(1e-9);
        expect(
          Math.abs(windGenerated - (row.eWindKwh + row.curtailedWindKwh)) /
            Math.max(windGenerated, 1),
        ).toBeLessThan(1e-9);
        expect(
          Math.abs(
            row.eConsumedKwh - (row.ePvKwh + row.eWindKwh + row.eGridKwh),
          ) / Math.max(row.eConsumedKwh, 1),
        ).toBeLessThan(1e-9);
      }),
      RUNS,
    );
  });

  it("mass balance: H₂ and water follow consumed energy and efficiency exactly", () => {
    fc.assert(
      fc.property(producingDayShape, (day) => {
        const inputs = hybridInputs();
        delete inputs.wind;
        const r = simulateLCOH(inputs, { pv: tiledProfile(day) });
        for (const row of r.annual) {
          const expectedH2 =
            (row.eConsumedKwh * row.efficiencyLhv) / LHV_H2_KWH_PER_KG;
          expect(
            Math.abs(row.h2Kg - expectedH2) / Math.max(expectedH2, 1e-9),
          ).toBeLessThan(1e-12);
          expect(
            Math.abs(row.waterM3 - (row.h2Kg * 9) / 1000) /
              Math.max(row.waterM3, 1e-9),
          ).toBeLessThan(1e-12);
        }
      }),
      RUNS,
    );
  });

  it("decomposition sums exactly to LCOH; outputs are finite and well-ranged", () => {
    fc.assert(
      fc.property(producingDayShape, producingDayShape, (pvDay, windDay) => {
        const inputs = hybridInputs();
        const r = simulateLCOH(inputs, {
          pv: tiledProfile(pvDay),
          wind: tiledProfile(windDay),
        });
        const d = r.decomposition;
        const sum =
          d.electricityPv +
          d.electricityWind +
          d.electricityGrid +
          d.electrolyzerCapex +
          d.stackReplacements +
          d.electrolyzerOpex +
          d.water;
        expect(sum).toBe(r.lcohUsdPerKg);
        expect(Number.isFinite(r.lcohUsdPerKg)).toBe(true);
        expect(r.lcohUsdPerKg).toBeGreaterThan(0);
        expect(r.performance.electrolyzerCapacityFactor).toBeGreaterThanOrEqual(0);
        expect(r.performance.electrolyzerCapacityFactor).toBeLessThanOrEqual(1);
        expect(r.totals.h2Kg).toBeGreaterThan(0);
      }),
      RUNS,
    );
  });

  it("cost structure: capital + operating parts reconcile to LCOH in BOTH electricity pricing modes", () => {
    // Corridor spec §2: Σ capital-tagged + Σ operating-tagged == total LCOH.
    // Run once in LCOE mode (hybrid) and once in CAPEX mode.
    const flat = new Array(24).fill(0.5);
    for (const capexMode of [false, true]) {
      const inputs = hybridInputs();
      if (capexMode) {
        inputs.pv = {
          capacityMw: 100,
          pricing: { mode: "capex", capexUsdPerKw: 800, opexFractionPerYear: 0.015 },
        };
        inputs.wind = {
          capacityMw: 100,
          pricing: { mode: "capex", capexUsdPerKw: 1200, opexFractionPerYear: 0.025 },
        };
      }
      const r = simulateLCOH(inputs, {
        pv: tiledProfile(flat),
        wind: tiledProfile(flat),
      });
      const cs = r.costStructure;
      // Per-component: capital + operatingPv equals the decomposition share.
      let totalPv = 0;
      let h2PvKg = 0;
      // Recover PV(H2) from any nonzero component: share = pv / h2PvKg.
      // electrolyzerCapex is always > 0.
      h2PvKg = cs.components.electrolyzerCapex.capitalUsd / r.decomposition.electrolyzerCapex;
      for (const key of Object.keys(cs.components) as (keyof typeof cs.components)[]) {
        const c = cs.components[key];
        const sharePv = c.capitalUsd + c.operatingPvUsd;
        expect(sharePv / h2PvKg).toBeCloseTo(r.decomposition[key], 10);
        totalPv += sharePv;
        // Nature tags are honest: capital-only entries carry no operating, etc.
        if (c.costNature === "capital") expect(c.operatingPvUsd).toBe(0);
        if (c.costNature === "operating") expect(c.capitalUsd).toBe(0);
      }
      // The reconciliation: totals match the levelized figure exactly.
      expect(cs.capitalUsd + cs.operatingPvUsd).toBeCloseTo(totalPv, 6);
      expect(totalPv / h2PvKg).toBeCloseTo(r.lcohUsdPerKg, 10);
      // CAPEX mode: renewables are the mixed entries with a genuine capital part.
      if (capexMode) {
        expect(cs.components.electricityPv.costNature).toBe("mixed");
        expect(cs.components.electricityPv.capitalUsd).toBeGreaterThan(0);
        expect(cs.components.electricityPv.operatingUsdPerYear).toBeGreaterThan(0);
      } else {
        expect(cs.components.electricityWind.costNature).toBe("operating");
        expect(cs.components.electricityWind.capitalUsd).toBe(0);
      }
      // Year-1 exports are populated and positive.
      expect(cs.annualH2Kg).toBeGreaterThan(0);
      expect(cs.annualOperatingUsd).toBeGreaterThan(0);
      expect(cs.plantLifeYears).toBe(inputs.finance.lifetimeYears);
      expect(cs.discountRate).toBe(inputs.finance.discountRate);
    }
  });

  it("without a grid source there is no grid energy and no emissions", () => {
    fc.assert(
      fc.property(producingDayShape, (day) => {
        const inputs = hybridInputs();
        delete inputs.wind;
        const r = simulateLCOH(inputs, { pv: tiledProfile(day) });
        expect(r.annual[0]!.eGridKwh).toBe(0);
        expect(r.totals.emissionsTco2e).toBe(0);
        expect(r.decomposition.electricityGrid).toBe(0);
      }),
      RUNS,
    );
  });
});
