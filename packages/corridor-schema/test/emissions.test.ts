/**
 * v6 refined-factor derivation: the corridor's per-fuel scalars computed
 * from the fuel-emissions dataset (framework-resolved) instead of the
 * workbook table. Anchors mirror the calculator's own pinned numbers —
 * blend 22.14 (e-ammonia, FuelEU/AR4, defaults), HFO 91.744 / IMO 94.90.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  migrateScenarioInput,
  parseRefBundle,
  resolveScenario,
  type ScenarioInput,
} from "../src";

const bundle = parseRefBundle(
  JSON.parse(
    readFileSync(
      new URL("../../../data/corridor-ref/2026-07-30-excel-v1.json", import.meta.url),
      "utf8",
    ),
  ),
);

/** Migrated fixture WITH the injected refined block, factor overrides cleared. */
function refinedInput(): ScenarioInput {
  const input = migrateScenarioInput(
    JSON.parse(
      readFileSync(
        new URL(
          "../../../fixtures/golden/corridor/excel-baseline.input.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  ).input;
  for (const side of ["green", "fossil"] as const) {
    input[side].overrides.wtwGco2PerMj = null;
    input[side].overrides.combustionEfTco2PerTonne = null;
    input[side].overrides.lhvMjPerTonne = null;
  }
  return input;
}

describe("refined emission-factor derivation (v6)", () => {
  it("migration injected FuelEU accounting; factors resolve as derived", () => {
    const input = refinedInput();
    expect(input.regulation.emissions).toEqual({ framework: "fueleu" });
    const r = resolveScenario(input, bundle);
    expect(r.flags.emissionsFramework).toBe("fueleu");
    expect(r.green.wtw.source).toBe("derived");
    expect(r.fossil.wtw.source).toBe("derived");
  });

  it("green e-ammonia at dataset defaults = the calculator's 22.14 blend", () => {
    const r = resolveScenario(refinedInput(), bundle);
    // certified 15 + optimised-injection slip + 5% MGO pilot, AR4.
    expect(r.green.wtw.value).toBeCloseTo(22.14, 2);
    expect(r.green.lhv.value).toBe(18600);
    // TtW CO2e per tonne incl. slip + pilot combustion (impact study V4).
    expect(r.green.combustionEf.value).toBeCloseTo(0.14, 2);
    // User-facing string: rulebook + fuel, no dataset version (the bundle
    // pin carries traceability; the badge is for the reader).
    expect(r.green.emissionsDerivation).toMatch(/FuelEU Maritime accounting \(AR4\)/);
  });

  it("fossil lsfo maps to the Annex II HFO row: 91.744 / 3.169 / 40,500", () => {
    const r = resolveScenario(refinedInput(), bundle);
    expect(r.fossil.wtw.value).toBeCloseTo(91.744, 3);
    expect(r.fossil.combustionEf.value).toBeCloseTo(3.169, 3);
    expect(r.fossil.lhv.value).toBe(40500);
  });

  it("framework switch: IMO resolves the sulphur band (94.90 @0.5%S, 92.20 >0.5%S)", () => {
    const imo = refinedInput();
    imo.regulation.emissions = { framework: "imo" };
    const r = resolveScenario(imo, bundle);
    expect(r.flags.emissionsFramework).toBe("imo");
    expect(r.fossil.wtw.value).toBeCloseTo(94.9, 1);

    const sour = refinedInput();
    sour.regulation.emissions = { framework: "imo" };
    sour.fossil.emissions = {
      certifiedWttGco2ePerMj: null,
      n2oScenarioId: null,
      pilotShare: null,
      pilotFuelId: null,
      engineType: null,
      sulphurPercent: 2.7,
      efficiencyRatio: null,
    };
    const r2 = resolveScenario(sour, bundle);
    // 14.1 WtT band + 78.10 TtW (AR5) = 92.20.
    expect(r2.fossil.wtw.value).toBeCloseTo(92.2, 1);
  });

  it("both frameworks ride along so each module prices with its own", () => {
    const r = resolveScenario(refinedInput(), bundle);
    expect(r.fossil.wtwByFramework?.fueleu).toBeCloseTo(91.744, 3);
    expect(r.fossil.wtwByFramework?.imo).toBeCloseTo(94.9, 1);
    expect(r.green.wtwByFramework?.fueleu).toBeCloseTo(22.14, 2);
    // AR5 prices the slip lower: 21.76 (impact-study/verification table).
    expect(r.green.wtwByFramework?.imo).toBeCloseTo(21.76, 2);
  });

  it("an explicit wtw override governs EVERYTHING — no per-framework attach", () => {
    const input = refinedInput();
    input.green.overrides.wtwGco2PerMj = 5;
    const r = resolveScenario(input, bundle);
    expect(r.green.wtw.source).toBe("override");
    expect(r.green.wtw.value).toBe(5);
    expect(r.green.wtwByFramework).toBeUndefined();
  });

  it("underivable fuel falls back to the legacy scalar, disclosed", () => {
    const input = refinedInput();
    input.fossil.fuelId = "lng"; // baseline LNG: per-engine slip is a
    // candidate-side input — derivation refuses, resolver falls back.
    const r = resolveScenario(input, bundle);
    expect(r.fossil.wtw.source).toBe("benchmark");
    expect(r.fossil.wtw.value).toBe(84);
    expect(r.fossil.emissionsDerivation).toBeUndefined();
  });

  it("scenario certified value + slip scenario move the green factors", () => {
    const input = refinedInput();
    input.green.emissions = {
      certifiedWttGco2ePerMj: 8,
      n2oScenarioId: "tested-two-stroke",
      pilotShare: 0,
      pilotFuelId: null,
      engineType: null,
      sulphurPercent: null,
      efficiencyRatio: null,
    };
    const r = resolveScenario(input, bundle);
    // pilot 0: blend = fuel intensity = 8 + 1.09 slip (AR4) = 9.09.
    expect(r.green.wtw.value).toBeCloseTo(9.09, 2);
  });

  it("legacy path unchanged: no emissions block → workbook scalars", () => {
    const input = refinedInput();
    delete input.regulation.emissions;
    const r = resolveScenario(input, bundle);
    expect(r.flags.emissionsFramework).toBeUndefined();
    expect(r.green.wtw.source).toBe("benchmark");
    expect(r.green.wtw.value).toBe(15);
    expect(r.fossil.wtw.value).toBe(92.4);
  });
});
