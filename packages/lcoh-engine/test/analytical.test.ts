/**
 * Analytical validation cases: constant-profile configurations whose LCOH
 * has a closed form reproducible in a spreadsheet. Parity requirement from
 * the plan: relative error ≤ 1e-6.
 *
 * Shared closed-form pieces (Case A base):
 *   E        = 100 MW × 8760 h            = 876 000 MWh/yr consumed
 *   H₂       = 876e6 kWh × 0.6 / 33.33    ≈ 15 769 877 kg/yr
 *   AF       = (1 − 1.08⁻²⁰) / 0.08       ≈ 9.818147
 *   LCOH_A   = [100e6 + AF·(26.28e6 + 3.0e6 + water)] / (AF·H₂) ≈ 2.507 USD/kg
 */
import { describe, expect, it } from "vitest";
import {
  HOURS_PER_YEAR,
  LHV_H2_KWH_PER_KG,
  WATER_L_PER_KG_H2,
  simulateLCOH,
} from "../src/index";
import {
  annuityFactor,
  constantProfile,
  expectRel,
  pvOnlyInputs,
} from "./helpers";

const E_KWH = 100_000 * HOURS_PER_YEAR; // 876e6 kWh consumed per year
const H2_KG = (E_KWH * 0.6) / LHV_H2_KWH_PER_KG; // ≈ 15.77e6 kg/yr
const AF = annuityFactor(0.08, 20);
const ELEC_USD = (E_KWH / 1000) * 30; // 26.28e6
const OPEX_USD = 0.03 * 100e6; // 3.0e6
const WATER_USD = (H2_KG * WATER_L_PER_KG_H2 * 0.5) / 1000; // ≈ 70 964

describe("Case A — full-CF PV, LCOE-priced, no degradation, no stack events", () => {
  const results = simulateLCOH(pvOnlyInputs(), { pv: constantProfile(1) });

  it("matches the closed-form LCOH (≈ 2.507 USD/kg)", () => {
    const expected =
      (100e6 + AF * (ELEC_USD + OPEX_USD + WATER_USD)) / (AF * H2_KG);
    expectRel(results.lcohUsdPerKg, expected, 1e-6);
    expect(results.lcohUsdPerKg).toBeGreaterThan(2.5);
    expect(results.lcohUsdPerKg).toBeLessThan(2.52);
  });

  it("decomposition components match their closed forms and sum exactly", () => {
    const d = results.decomposition;
    expectRel(d.electricityPv, (AF * ELEC_USD) / (AF * H2_KG), 1e-6);
    expectRel(d.electrolyzerCapex, 100e6 / (AF * H2_KG), 1e-6);
    expectRel(d.electrolyzerOpex, (AF * OPEX_USD) / (AF * H2_KG), 1e-6);
    expectRel(d.water, WATER_USD / H2_KG, 1e-6);
    expect(d.electricityWind).toBe(0);
    expect(d.electricityGrid).toBe(0);
    expect(d.stackReplacements).toBe(0);
    const sum =
      d.electricityPv +
      d.electricityWind +
      d.electricityGrid +
      d.electrolyzerCapex +
      d.stackReplacements +
      d.electrolyzerOpex +
      d.water;
    expect(sum).toBe(results.lcohUsdPerKg);
  });

  it("reports ideal performance and no curtailment or grid use", () => {
    expect(results.performance.electrolyzerCapacityFactor).toBeCloseTo(1, 12);
    expect(results.performance.fullLoadHoursPerYear).toBeCloseTo(
      HOURS_PER_YEAR,
      6,
    );
    expect(results.totals.curtailedPvKwh).toBe(0);
    expect(results.totals.curtailedWindKwh).toBe(0);
    expect(results.annual[0]!.eGridKwh).toBe(0);
    expect(results.totals.emissionsTco2e).toBe(0);
    expect(results.meta.referenceMode).toBe(true);
  });
});

describe("Case B — Case A plus 1 %/yr degradation (doc-literal η₀(1−d)^t)", () => {
  const inputs = pvOnlyInputs();
  inputs.electrolyzer.degradationPerYear = 0.01;
  const results = simulateLCOH(inputs, { pv: constantProfile(1) });

  it("matches the geometric-annuity closed form", () => {
    // H2_t = H2_base·0.99^t; discounted H2 = H2_base·Σ (0.99/1.08)^t
    let h2Pv = 0;
    let waterPv = 0;
    for (let t = 1; t <= 20; t++) {
      const g = Math.pow(0.99, t) / Math.pow(1.08, t);
      h2Pv += H2_KG * g;
      waterPv += ((H2_KG * Math.pow(0.99, t) * WATER_L_PER_KG_H2) / 1000) *
        0.5 / Math.pow(1.08, t);
    }
    const expected =
      (100e6 + AF * (ELEC_USD + OPEX_USD) + waterPv) / h2Pv;
    expectRel(results.lcohUsdPerKg, expected, 1e-6);
  });

  it("leaves the electricity cost (efficiency-independent) unchanged in PV terms", () => {
    // electricity component × discounted H2 = AF · annual electricity cost, as in Case A
    let h2Pv = 0;
    for (let t = 1; t <= 20; t++) {
      h2Pv += (H2_KG * Math.pow(0.99, t)) / Math.pow(1.08, t);
    }
    expectRel(
      results.decomposition.electricityPv * h2Pv,
      AF * ELEC_USD,
      1e-6,
    );
  });

  it("applies the doc-literal first-year efficiency 0.6·0.99", () => {
    expectRel(results.annual[0]!.efficiencyLhv, 0.6 * 0.99, 1e-12);
  });

  it("nameplate flag shifts the exponent to t−1", () => {
    const flagged = pvOnlyInputs();
    flagged.electrolyzer.degradationPerYear = 0.01;
    flagged.referenceFlags = { nameplateEfficiencyInFirstYear: true };
    const r = simulateLCOH(flagged, { pv: constantProfile(1) });
    expectRel(r.annual[0]!.efficiencyLhv, 0.6, 1e-12);
    expectRel(r.annual[19]!.efficiencyLhv, 0.6 * Math.pow(0.99, 19), 1e-9);
    expect(r.meta.referenceMode).toBe(false);
  });
});

describe("Case C — half-CF PV plus grid backfill", () => {
  const inputs = pvOnlyInputs();
  inputs.grid = {
    maxImportMw: 100,
    priceUsdPerMwh: 30,
    emissionFactorTco2PerMwh: 0.4,
  };
  const results = simulateLCOH(inputs, { pv: constantProfile(0.5) });

  it("grid supplies exactly the 438 000 MWh/yr shortfall", () => {
    expectRel(results.annual[0]!.ePvKwh, E_KWH / 2, 1e-9);
    expectRel(results.annual[0]!.eGridKwh, E_KWH / 2, 1e-9);
    expectRel(results.annual[0]!.eConsumedKwh, E_KWH, 1e-9);
  });

  it("with equal PV and grid prices, LCOH equals Case A", () => {
    const caseA = simulateLCOH(pvOnlyInputs(), { pv: constantProfile(1) });
    expectRel(results.lcohUsdPerKg, caseA.lcohUsdPerKg, 1e-9);
  });

  it("reports the consumed-energy-weighted mix of 30 USD/MWh", () => {
    expectRel(results.lcoe.mix, 30, 1e-9);
  });

  it("emissions come from grid energy only, at 0.4 tCO2/MWh", () => {
    // 438 000 MWh/yr × 0.4 t/MWh × 20 yr (water electricity is zero here)
    expectRel(results.totals.emissionsTco2e, (E_KWH / 2 / 1000) * 0.4 * 20, 1e-9);
    expectRel(
      results.totals.emissionsKgCo2ePerKgH2,
      ((E_KWH / 2 / 1000) * 0.4 * 1000) / H2_KG,
      1e-9,
    );
  });
});

describe("Case D — Case A plus 40 000 h stack life", () => {
  const inputs = pvOnlyInputs();
  inputs.electrolyzer.stackLifetimeHours = 40_000;
  const results = simulateLCOH(inputs, { pv: constantProfile(1) });

  it("adds four discounted 30 M USD replacements (years 5, 10, 14, 19) to Case A", () => {
    const caseA = simulateLCOH(pvOnlyInputs(), { pv: constantProfile(1) });
    const stackPv = [5, 10, 14, 19]
      .map((t) => 30e6 / Math.pow(1.08, t))
      .reduce((a, b) => a + b, 0);
    const expected = caseA.lcohUsdPerKg + stackPv / (AF * H2_KG);
    expectRel(results.lcohUsdPerKg, expected, 1e-6);
    expectRel(results.decomposition.stackReplacements, stackPv / (AF * H2_KG), 1e-6);
  });

  it("marks the replacement years in the annual series", () => {
    const replacementYears = results.annual
      .filter((row) => row.stackReplacement)
      .map((row) => row.year);
    expect(replacementYears).toEqual([5, 10, 14, 19]);
    expect(results.totals.stackReplacementsUsd).toBe(4 * 30e6);
  });
});
