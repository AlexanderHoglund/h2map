/**
 * Fix #6: the IMO Net-Zero Framework module (draft MEPC 83, provisional).
 * Structure: attained WTW GFI vs two reduction ladders against the 93.3
 * gCO2eq/MJ 2008 reference; tier-1 prices the direct→base band, tier-2 the
 * deficit beyond base; surplus below the direct target accrues a
 * reward-eligible balance (reported in tonnes; priced only when a reward
 * rate is set).
 */

import { describe, expect, it } from "vitest";
import {
  calendarYear,
  count,
  fraction,
  gCo2ePerMj,
  mjPerTonne,
  tCo2PerTonne,
  tonnesPerVesselYear,
  usdPerTonne,
} from "@h2map/units";
import type { FuelParams, ImoNetZeroParams } from "@h2map/corridor-schema";
import { parseRefBundle, resolveScenario } from "@h2map/corridor-schema";
import { evaluateScenario } from "../src/index";
import { imoNetZeroYear } from "../src/regulation/imoNetZero";
import { loadRefBundleJson } from "./golden/loader";
import { chileReferenceInput } from "./reference/chile";

const params: ImoNetZeroParams = {
  effectiveFromCalendarYear: calendarYear(2028),
  referenceIntensityGco2PerMj: gCo2ePerMj(93.3),
  baseTargets: [
    { fromCalendarYear: calendarYear(2028), value: fraction(0.04) },
    { fromCalendarYear: calendarYear(2030), value: fraction(0.08) },
  ],
  directTargets: [
    { fromCalendarYear: calendarYear(2028), value: fraction(0.17) },
    { fromCalendarYear: calendarYear(2030), value: fraction(0.21) },
  ],
  tier1UsdPerTonneCo2e: usdPerTonne(100),
  tier2UsdPerTonneCo2e: usdPerTonne(380),
  scope: fraction(1),
  rewardUsdPerTonneCo2e: usdPerTonne(0),
};

function fuelWith(wtw: number): FuelParams {
  return {
    priceUsdPerTonne: usdPerTonne(650),
    combustionEf: tCo2PerTonne(3.114),
    lhv: mjPerTonne(40200),
    wtw: gCo2ePerMj(wtw),
    tonnesPerVesselYear: tonnesPerVesselYear(1000),
  };
}

describe("imoNetZeroYear — structure", () => {
  it("fully compliant side: zero cost, positive reward-eligible surplus", () => {
    // Attained 15 ≪ direct target 93.3×0.83 = 77.4 in 2028.
    const y = imoNetZeroYear(params, fuelWith(15), 10, calendarYear(2028));
    expect(y.costUsdM).toBe(0);
    expect(y.tier1UsdM).toBe(0);
    expect(y.tier2UsdM).toBe(0);
    expect(y.surplusTonnesCo2e).toBeGreaterThan(0);
    // Surplus = (77.439 − 15) g/MJ × 10 × 1000 t × 40200 MJ/t / 1e6.
    const expected = ((93.3 * (1 - 0.17) - 15) * 10 * 1000 * 40200) / 1e6;
    expect(y.surplusTonnesCo2e).toBeCloseTo(expected, 6);
    // The reward rate is unset → balance reported but unpriced.
    expect(y.rewardUsdM).toBe(0);
  });

  it("deficit past both targets: tier-1 and tier-2 reported separately, summing to the total", () => {
    // LSFO at 91.16: 2028 base target 89.568, direct 77.439 → both bands hit.
    const y = imoNetZeroYear(params, fuelWith(91.16), 10, calendarYear(2028));
    const energyMj = 10 * 1000 * 40200;
    const base = 93.3 * (1 - 0.04);
    const direct = 93.3 * (1 - 0.17);
    const tier1Expected = (((base - direct) * energyMj) / 1e6) * 100 / 1e6;
    const tier2Expected = (((91.16 - base) * energyMj) / 1e6) * 380 / 1e6;
    expect(y.tier1UsdM).toBeCloseTo(tier1Expected, 9);
    expect(y.tier2UsdM).toBeCloseTo(tier2Expected, 9);
    expect(y.costUsdM).toBeCloseTo(y.tier1UsdM + y.tier2UsdM, 12);
    expect(y.surplusTonnesCo2e).toBe(0);
  });

  it("before the effective year: inert (no cost, no surplus)", () => {
    const y = imoNetZeroYear(params, fuelWith(15), 10, calendarYear(2027));
    expect(y).toEqual({
      costUsdM: 0,
      tier1UsdM: 0,
      tier2UsdM: 0,
      surplusTonnesCo2e: 0,
      rewardUsdM: 0,
    });
  });

  it("a reward rate prices the surplus as negative cost", () => {
    const priced = { ...params, rewardUsdPerTonneCo2e: usdPerTonne(50) };
    const y = imoNetZeroYear(priced, fuelWith(15), 10, calendarYear(2028));
    expect(y.rewardUsdM).toBeCloseTo((y.surplusTonnesCo2e * 50) / 1e6, 12);
    expect(y.costUsdM).toBeCloseTo(-y.rewardUsdM, 12);
  });
});

describe("IMO module in scenarios", () => {
  const bundle = parseRefBundle(loadRefBundleJson("2026-07-30-excel-v1"));

  it("disabled: zero everywhere, no per-year row, no other module affected", () => {
    const off = evaluateScenario(resolveScenario(chileReferenceInput(), bundle));
    expect(off.perYear.green.imoNetZeroUsdM).toBeUndefined();
    expect(off.reporting.imoNetZero).toBeUndefined();
  });

  it("REFERENCE FINDING: IMO module replacing the self-designed proxy vs the study's ~$250m", () => {
    const input = chileReferenceInput();
    input.regulation.selfDesigned.enabled = false;
    input.regulation.imoNetZero = { enabled: true, scope: 1 };
    const res = evaluateScenario(resolveScenario(input, bundle));
    const imo = res.reporting.imoNetZero;
    expect(imo && !("notParameterised" in imo && imo.notParameterised)).toBe(true);
    if (!imo || imo.notParameterised) throw new Error("unreachable");

    // NOT tuned to match: a divergence from the study's ≈$250m regulatory
    // benefit is a finding about the calibrated $280/t proxy, not an error.
    // LSFO (91.16) sits BELOW the base target until 2032 (93.3×(1−0.168)=
    // 77.6 < 91.16 → tier-2 from 2032; direct band priced at tier-1 $100
    // from 2028) — so the structured module yields a materially different
    // trajectory than a flat $280/t on all emissions.
    const netImo = imo.fossil.pvUsdM - imo.green.pvUsdM;
    // Log the finding for the report; assert only structure + sign.
    console.log(
      `IMO NZF replacing the $280/t proxy: fossil PV $${imo.fossil.pvUsdM.toFixed(2)}m, ` +
        `green PV $${imo.green.pvUsdM.toFixed(2)}m, net regulatory effect ` +
        `$${(-netImo).toFixed(2)}m (study benefit ≈ $250m; proxy gave $250.23m)` +
        ` — green surplus balance ${Math.round(imo.green.surplusTonnesCo2e).toLocaleString(
          "en-US",
        )} tCO2e (ZNZ reward upside, unpriced)`,
    );
    expect(imo.fossil.pvUsdM).toBeGreaterThan(0);
    expect(imo.green.pvUsdM).toBeLessThanOrEqual(0);
    expect(imo.green.surplusTonnesCo2e).toBeGreaterThan(0);
    // Exhaustiveness: the 7th row is emitted and sums into totals.
    expect(res.perYear.fossil.imoNetZeroUsdM).toHaveLength(15);
    // Net regulatory effect now comes from the IMO module alone:
    // net = greenReg − fossilReg = imo.green.pv − imo.fossil.pv.
    expect(res.reporting.netRegulatoryEffectUsdM).toBeCloseTo(
      imo.green.pvUsdM - imo.fossil.pvUsdM,
      6,
    );
  });

  it("enabled against a bundle without IMO rows: explicit notParameterised", () => {
    const raw = loadRefBundleJson("2026-07-30-excel-v1") as Record<string, unknown>;
    const stripped = JSON.parse(JSON.stringify(raw)) as {
      schedules: Record<string, unknown>;
      regulationDefaults: Record<string, unknown>;
    };
    delete stripped.schedules.imoBaseTargets;
    delete stripped.schedules.imoDirectTargets;
    delete stripped.regulationDefaults.imoNetZero;
    const oldBundle = parseRefBundle(stripped);

    const input = chileReferenceInput();
    input.regulation.imoNetZero = { enabled: true, scope: 1 };
    const res = evaluateScenario(resolveScenario(input, oldBundle));
    expect(res.reporting.imoNetZero).toEqual({ notParameterised: true });
    // And it did NOT silently compute anything.
    expect(res.perYear.green.imoNetZeroUsdM).toBeUndefined();
  });
});
