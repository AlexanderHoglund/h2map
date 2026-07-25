import { describe, expect, it } from "vitest";
import { simulateLCOH } from "../src/index";
import type { LCOHInputs } from "../src/types";

/** Wind-only base case; a constant 0.5 CF makes every operating hour a
 *  half-load hour, so calendar operating hours (8760/yr) are exactly double
 *  the equivalent full-load hours (4380/yr) — the cleanest way to isolate the
 *  P0 #3 stack-life counter. */
const halfLoadWind = new Array<number>(8760).fill(0.5);

function baseInputs(): LCOHInputs {
  return {
    finance: { lifetimeYears: 20, discountRate: 0.08 },
    electrolyzer: {
      capacityMw: 100,
      capexUsdPerKw: 1000,
      opexFractionPerYear: 0.03,
      efficiencyLhv: 0.6,
      degradationPerYear: 0.01,
      stackLifetimeHours: 40000,
      stackReplacementCostFraction: 0.3,
    },
    wind: { capacityMw: 100, pricing: { mode: "lcoe", usdPerMwh: 30 } },
    water: {
      priceUsdPerM3: 0.5,
      transportUsdPerM3Per100Km: 0.09,
      transportDistanceKm: 0,
      desalinated: false,
      pumpingHeadM: 0,
    },
  };
}

describe("P0 #3 — stack life on equivalent full-load hours", () => {
  it("counts fewer replacements than the calendar-hour counter on partial load", () => {
    const ref = simulateLCOH(baseInputs(), { wind: halfLoadWind });
    const improved = simulateLCOH(
      { ...baseInputs(), referenceFlags: { stackLifeOnEquivalentFullLoadHours: true } },
      { wind: halfLoadWind },
    );
    const refReplacements = ref.annual.filter((r) => r.stackReplacement).length;
    const impReplacements = improved.annual.filter((r) => r.stackReplacement).length;
    // Calendar hours: 8760/yr → crosses 40 000 h ~4× in 20 yr. EFLH: 4380/yr
    // → ~2×. Fewer replacements → lower stack-replacement cost and LCOH.
    expect(refReplacements).toBeGreaterThan(impReplacements);
    expect(improved.decomposition.stackReplacements).toBeLessThan(
      ref.decomposition.stackReplacements,
    );
    expect(improved.lcohUsdPerKg).toBeLessThan(ref.lcohUsdPerKg);
  });

  it("is bit-identical to reference when the flag is off", () => {
    const a = simulateLCOH(baseInputs(), { wind: halfLoadWind });
    const b = simulateLCOH(
      { ...baseInputs(), referenceFlags: { stackLifeOnEquivalentFullLoadHours: false } },
      { wind: halfLoadWind },
    );
    expect(b.lcohUsdPerKg).toBe(a.lcohUsdPerKg);
    expect(b.meta.referenceMode).toBe(true);
  });
});

describe("efficiency reset on stack replacement (improved mode)", () => {
  it("ends at higher efficiency than reference and lowers LCOH", () => {
    const ref = simulateLCOH(baseInputs(), { wind: halfLoadWind });
    const reset = simulateLCOH(
      { ...baseInputs(), referenceFlags: { resetEfficiencyOnStackReplacement: true } },
      { wind: halfLoadWind },
    );
    const refFinalEff = ref.annual[ref.annual.length - 1]!.efficiencyLhv;
    const resetFinalEff = reset.annual[reset.annual.length - 1]!.efficiencyLhv;
    expect(resetFinalEff).toBeGreaterThan(refFinalEff);
    expect(reset.lcohUsdPerKg).toBeLessThan(ref.lcohUsdPerKg);
  });
});
