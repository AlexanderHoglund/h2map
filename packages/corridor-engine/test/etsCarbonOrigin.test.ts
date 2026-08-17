/**
 * The ETS carbon-origin correction, at corridor level.
 *
 * The unit behaviour lives in
 * `packages/fuel-emissions/test/etsCarbonOrigin.test.ts`. What this file pins
 * is the WIRING — that the corrected factor actually reaches the ETS module
 * and, just as importantly, that it reaches NOTHING ELSE.
 *
 * That second half is the load-bearing part. `combustionEf` is shared by the
 * ETS module, the self-designed scheme and the abatement delta, so netting
 * the biogenic carbon in place would have moved all three to fix one. Keeping
 * a separate `etsChargeableEf` is only correct if the other consumers still
 * see the full stack factor — which is what the CO2-abated assertion below
 * actually tests.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  migrateScenarioInput,
  parseRefBundle,
  resolveScenario,
  type ScenarioInput,
} from "@h2map/corridor-schema";
import { evaluateScenario } from "../src/index";
import { defaultScenario } from "../../../apps/web/lib/corridor/scenarioDefaults";

const bundle = parseRefBundle(
  JSON.parse(
    readFileSync(
      new URL("../../../data/corridor-ref/2026-08-18-fuel-v4.json", import.meta.url),
      "utf8",
    ),
  ),
);

/**
 * The Skagerrak green box: Gothenburg-Rotterdam, 562 nm, 2 x 1,800 TEU
 * methanol dual-fuel feeder, 60 roundtrips, 2029-2043, WACC 5.5%, EUA EUR100,
 * EUR/USD 1.08, ETS scope 1.0, FuelEU on.
 *
 * Built from the brief's stated parameters rather than restated results: the
 * brief's own absolute figures came from a different corridor configuration
 * and are not reproducible here, so what is pinned below is the MECHANISM and
 * the proportion, not its headline numbers.
 */
function skagerrak(): ScenarioInput {
  const s = JSON.parse(JSON.stringify(defaultScenario())) as Record<string, never>;
  const o = s as unknown as Record<string, Record<string, unknown>>;
  o.cargo = {
    ...o.cargo,
    oneWayDistanceNm: 562,
    startCalendarYear: 2029,
    horizonYears: 15,
    unit: "teu",
    unitTonnes: 14,
    unitsPerYear: 2 * 1800 * 60,
    vessels: 2,
    roundtripsPerYear: 60,
  };
  o.vessel = { ...o.vessel, typeId: "cont-feeder-1800" };
  for (const side of ["green", "fossil"] as const) {
    o[side] = {
      ...o[side],
      // Cleared deliberately: the corrected value must come from the DATASET.
      // A typed factor goes stale silently; a derived one tracks the bundle.
      overrides: {
        ...(o[side].overrides as Record<string, unknown>),
        combustionEfTco2PerTonne: null,
        wtwGco2PerMj: null,
        lhvMjPerTonne: null,
      },
    };
  }
  (o.green as Record<string, unknown>).fuelId = "e-methanol";
  (o.fossil as Record<string, unknown>).fuelId = "lsfo";
  o.discounting = { ...o.discounting, wacc: 0.055 };
  (s as unknown as Record<string, unknown>).inflation = 0.02;
  o.regulation = {
    ...o.regulation,
    eurUsd: 1.08,
    ets: { enabled: true, euaEurPerTonne: 100, scope: 1 },
    emissions: { framework: "fueleu" },
  };
  return migrateScenarioInput(s as never).input;
}

const resolved = () => resolveScenario(skagerrak(), bundle);

describe("the corrected factor reaches ETS", () => {
  it("resolves the green combustion factor as DERIVED, override cleared", () => {
    // The acceptance criterion from the brief: a derived value tracks the
    // reference bundle, a typed one goes stale without saying so.
    const r = resolved();
    expect(r.green.combustionEf.source).toBe("derived");
    expect(r.green.etsChargeableEf.source).toBe("derived");
  });

  it("charges the pilot term, not the stack factor", () => {
    const r = resolved();
    // What the fuel actually burns — unchanged, and still 1.4550.
    expect(r.green.combustionEf.value as number).toBeCloseTo(1.455, 3);
    // What the ETS may charge for: the fossil pilot alone.
    expect(r.green.etsChargeableEf.value as number).toBeCloseTo(0.08, 4);
  });

  it("charges the fossil side its full CO2, and only its CO2", () => {
    // A FOSSIL row is never zero-rated, so its chargeable CO2 is its whole
    // combustion CO2: 3.1140 tCO2/t for HFO, the Annex II factor exactly.
    //
    // It is NOT equal to `combustionEf`, and the gap is deliberate.
    // `combustionEf` is CO2e — it already folds in CH4 and N2O (3.1689,
    // 0.0549 higher). Those gases reach the ETS module through its own
    // `gasCoverage` block, gated on calendar year 2026, so including them
    // here would charge them twice in any run from 2026 on.
    const r = resolved();
    expect(r.fossil.etsChargeableEf.value as number).toBeCloseTo(3.114, 4);
    expect(r.fossil.combustionEf.value as number).toBeCloseTo(3.1689, 4);
    const nonCo2 =
      (r.fossil.combustionEf.value as number) - (r.fossil.etsChargeableEf.value as number);
    expect(nonCo2).toBeGreaterThan(0);
    expect(nonCo2).toBeLessThan(0.1);
  });
});

describe("what the correction moves, and what it must not", () => {
  /** The old behaviour: ETS charged the whole stack factor. */
  const withFullCharge = () => {
    const r = resolved() as unknown as Record<string, Record<string, unknown>>;
    r.green = { ...r.green, etsChargeableEf: r.green.combustionEf };
    return evaluateScenario(r as never);
  };
  const before = withFullCharge();
  const after = evaluateScenario(resolved());

  it("cuts the green ETS charge by ~94%", () => {
    // The brief measured -94.6% on its corridor ($35.910m -> $1.941m); this
    // corridor is priced differently but the PROPORTION is a property of the
    // fuel, not the route, so it should agree closely.
    const ratio = after.summary.etsGreenPvUsdM / before.summary.etsGreenPvUsdM;
    expect(1 - ratio).toBeGreaterThan(0.9);
    expect(1 - ratio).toBeLessThan(0.99);
  });

  it("moves the gap by exactly the green ETS delta and nothing else", () => {
    const gapDelta = after.summary.gapPvUsdM - before.summary.gapPvUsdM;
    const etsDelta = after.summary.etsGreenPvUsdM - before.summary.etsGreenPvUsdM;
    expect(gapDelta).toBeCloseTo(etsDelta, 9);
  });

  it("does NOT move the pre-regulation gap", () => {
    expect(after.reporting.gapPvPreRegulationUsdM).toBeCloseTo(
      before.reporting.gapPvPreRegulationUsdM,
      9,
    );
  });

  it("does NOT move CO2 abated — the abatement delta keeps the FULL factor", () => {
    // THE TEST THAT JUSTIFIES A SEPARATE FIELD. Abatement is computed from
    // `combustionEf`; if the biogenic carbon had been netted there instead,
    // this figure would have moved and the corridor would claim abatement it
    // does not achieve.
    expect(after.summary.co2AbatedTonnes).toBeCloseTo(before.summary.co2AbatedTonnes, 6);
    expect(after.summary.co2AbatedTonnes).toBeGreaterThan(0);
  });

  it("does NOT move the fossil ETS line", () => {
    expect(after.summary.etsFossilPvUsdM).toBeCloseTo(before.summary.etsFossilPvUsdM, 9);
  });
});
