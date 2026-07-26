import { describe, expect, it } from "vitest";
import { simulateLCOH } from "../src/index";
import type { LCOHInputs } from "../src/types";

const flat = new Array<number>(8760).fill(0.4);

function base(withGrid: boolean): LCOHInputs {
  return {
    finance: { lifetimeYears: 20, discountRate: 0.08 },
    electrolyzer: {
      capacityMw: 100,
      capexUsdPerKw: 1000,
      opexFractionPerYear: 0.03,
      efficiencyLhv: 0.6,
      degradationPerYear: 0,
      stackLifetimeHours: 1e12,
      stackReplacementCostFraction: 0.3,
    },
    pv: { capacityMw: 100, pricing: { mode: "lcoe", usdPerMwh: 30 } },
    ...(withGrid
      ? {
          grid: {
            maxImportMw: 100,
            priceUsdPerMwh: 30,
            emissionFactorTco2PerMwh: 0.4,
          },
        }
      : {}),
    water: {
      priceUsdPerM3: 0.5,
      transportUsdPerM3Per100Km: 0.09,
      transportDistanceKm: 0,
      desalinated: false,
      pumpingHeadM: 0,
    },
  };
}

describe("P0 #9 — renewable matched fraction", () => {
  it("is 1.0 for a renewables-only plant (and emissions are 0)", () => {
    const r = simulateLCOH(base(false), { pv: flat });
    expect(r.performance.renewableMatchedFraction).toBeCloseTo(1, 12);
    expect(r.totals.emissionsKgCo2ePerKgH2).toBe(0);
  });

  it("equals 1 − grid share when the grid tops up the shortfall", () => {
    // PV 100 MW × 0.4 = 40 MW; grid fills 60 MW every hour → matched = 0.4.
    const r = simulateLCOH(base(true), { pv: flat });
    const gridShare =
      r.annual[0]!.eGridKwh / r.annual[0]!.eConsumedKwh;
    expect(r.performance.renewableMatchedFraction).toBeCloseTo(1 - gridShare, 9);
    expect(r.performance.renewableMatchedFraction).toBeCloseTo(0.4, 6);
  });
});
