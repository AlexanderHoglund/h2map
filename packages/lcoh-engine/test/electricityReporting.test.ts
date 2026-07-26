import { describe, expect, it } from "vitest";
import { simulateLCOH } from "../src/index";
import type { LCOHInputs } from "../src/types";

function inputs(pvCapacityMw: number): LCOHInputs {
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
    pv: {
      capacityMw: pvCapacityMw,
      pricing: { mode: "capex", capexUsdPerKw: 800, opexFractionPerYear: 0.015 },
    },
    water: {
      priceUsdPerM3: 0.5,
      transportUsdPerM3Per100Km: 0.09,
      transportDistanceKm: 0,
      desalinated: false,
      pumpingHeadM: 0,
    },
  };
}

const flatPv = new Array<number>(8760).fill(0.5);

describe("P0 #7 — reconcilable electricity cost", () => {
  it("effective per-consumed cost equals mix when there is no curtailment", () => {
    // PV 100 MW × 0.5 CF = 50 MW ≤ 100 MW electrolyzer: never curtailed.
    const r = simulateLCOH(inputs(100), { pv: flatPv });
    expect(r.performance.utilization.pv).toBeCloseTo(1, 12);
    expect(r.lcoe.effectivePerConsumedMwh).toBeCloseTo(r.lcoe.mix, 9);
  });

  it("effective = mix / utilization under curtailment (CAPEX cost is fixed)", () => {
    // PV 300 MW × 0.5 = 150 MW > 100 MW electrolyzer → s = 2/3, util = 2/3.
    const r = simulateLCOH(inputs(300), { pv: flatPv });
    expect(r.performance.utilization.pv).toBeCloseTo(2 / 3, 6);
    // In CAPEX mode plant cost is independent of curtailment, so per-consumed
    // cost is per-generated cost divided by utilization — the exact
    // reconciliation the user's `mix × consumed` check would otherwise miss.
    expect(r.lcoe.effectivePerConsumedMwh).toBeCloseTo(
      r.lcoe.mix / r.performance.utilization.pv!,
      6,
    );
    expect(r.lcoe.effectivePerConsumedMwh).toBeGreaterThan(r.lcoe.mix);
  });

  it("electricity decomposition reconciles to effective × consumed energy", () => {
    const r = simulateLCOH(inputs(300), { pv: flatPv });
    // Electricity USD/kg = effective [USD/MWh] × consumed MWh per kg H₂.
    // With no degradation, H₂/consumed is constant, so the ratio collapses to
    // efficiency ÷ LHV — i.e. consumed MWh per kg = 1 / (η/33.33) / 1000.
    const consumedMwhPerKg = 33.33 / 0.6 / 1000;
    const elecPerKg =
      r.decomposition.electricityPv +
      r.decomposition.electricityWind +
      r.decomposition.electricityGrid;
    expect(r.lcoe.effectivePerConsumedMwh * consumedMwhPerKg).toBeCloseTo(
      elecPerKg,
      6,
    );
  });
});
