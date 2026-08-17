/**
 * Golden fixtures — AUTHORITATIVE, hand-computed before the engine existed
 * (fixtures/golden/fuel-emissions/golden-fixtures.json). If the engine
 * disagrees with a fixture, the ENGINE is wrong. Never regenerated.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  evaluateFuelEmissions,
  fuelIntensity,
  parseRefDataset,
  type FuelEmissionsResult,
} from "../src";

const ds = parseRefDataset(
  JSON.parse(
    readFileSync(
      new URL("../../../data/fuel-emissions-ref/2026-08-17-ets-carbon-4.json", import.meta.url),
      "utf8",
    ),
  ),
);
const fixtures = JSON.parse(
  readFileSync(
    new URL(
      "../../../fixtures/golden/fuel-emissions/golden-fixtures.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { datasetVersion: string; fixtures: { id: string }[] };

function ok(r: ReturnType<typeof evaluateFuelEmissions>): FuelEmissionsResult {
  if ("notParameterised" in r && r.notParameterised) {
    throw new Error(`unexpected notParameterised: ${JSON.stringify(r)}`);
  }
  return r as FuelEmissionsResult;
}

describe("golden fixtures (hand-computed, authoritative)", () => {
  it("fixture file targets the loaded dataset version", () => {
    expect(fixtures.datasetVersion).toBe(ds.datasetVersion);
  });

  it("F1 — energy equivalence: a tonne of green fuel is NOT a tonne of fossil", () => {
    const r = ok(
      evaluateFuelEmissions(
        {
          candidateFuelId: "e-ammonia",
          quantityTonnes: 1000,
          candidateWtwGco2ePerMj: 15.0,
          baselineFuelId: "hfo",
          frameworkId: "fueleu",
          pilotShare: 0,
          n2oSlipGPerG: 0,
          efficiencyRatio: 1.0,
        },
        ds,
      ),
    );
    expect(r.candidateEnergyMj).toBeCloseTo(18_600_000, 0);
    expect(r.equivalentBaselineMassTonnes).toBeCloseTo(459.3, 1);
    expect(r.wellToWake.candidate.emissionsTco2e).toBeCloseTo(279.0, 1);
    expect(r.wellToWake.baseline.emissionsTco2e).toBeCloseTo(1706.4, 1);
    expect(r.wellToWake.avoidedTco2e).toBeCloseTo(1427.4, 1);
    expect(r.wellToWake.reductionPercent).toBeCloseTo(83.7, 1);
    // The failure mode this fixture exists to catch: tonne-for-tonne
    // arithmetic returns 3,436.6 tCO2e (2.41x). Assert we are nowhere near.
    expect(Math.abs(r.wellToWake.avoidedTco2e - 3436.6)).toBeGreaterThan(1000);
  });

  it("F2 — BetterSea reproduction: 7,000 t HFO under AR4, to 0.001", () => {
    const i = fuelIntensity(ds, "hfo", "AR4");
    if ("notParameterised" in i) throw new Error("hfo missing");
    expect(Math.abs(i.ttwGco2ePerMj - 78.244)).toBeLessThan(0.001);
    expect(Math.abs(i.wtwGco2ePerMj - 91.744)).toBeLessThan(0.001);
  });

  it("F3 — pilot fuel: floor on avoided, headline shift in blend intensity", () => {
    const r = ok(
      evaluateFuelEmissions(
        {
          candidateFuelId: "e-ammonia",
          quantityTonnes: 1000,
          candidateWtwGco2ePerMj: 15.0,
          baselineFuelId: "hfo",
          frameworkId: "fueleu",
          pilotShare: 0.05,
          pilotFuelId: "mgo",
          n2oSlipGPerG: 0,
          efficiencyRatio: 1.0,
        },
        ds,
      ),
    );
    expect(r.totalEnergyMj).toBeCloseTo(19_578_947, 0);
    expect(r.pilotEnergyMj).toBeCloseTo(978_947, 0);
    expect(r.equivalentBaselineMassTonnes).toBeCloseTo(483.4, 1);
    expect(r.wellToWake.avoidedTco2e).toBeCloseTo(1428.4, 1);
    expect(r.wellToWake.blendIntensityGco2ePerMj).toBeCloseTo(18.79, 2);
    // ZNZ tests the FUEL's own WtW intensity (15.0 here, slip 0) — not
    // the 18.79 blend: under 19.0 (to 2034), above 14.0 (from 2035).
    expect(r.znz.compliantTo2034).toBe(true);
    expect(r.znz.compliantFrom2035).toBe(false);
  });

  it("F4 — N2O sensitivity: three published scenarios, slip priced at 273", () => {
    // Fixture convention: the framework stays FuelEU/AR4 (baseline
    // 91.744, the HFO row); ONLY the slip term is priced at GWP 273 —
    // the sensitivity the dataset's scenarios were derived with. Avoided
    // values were hand-derived from the ROUNDED adds intermediates
    // (1.0 / 3.23 / 36.69); the exact engine lands within the tolerance.
    const cases = [
      { slip: 0.0000681, intensity: 16.0, avoided: 1408.8, tol: 0.1, znz: true },
      { slip: 0.00022, intensity: 18.23, avoided: 1367.4, tol: 0.1, znz: true },
      { slip: 0.0025, intensity: 51.69, avoided: 745.0, tol: 0.15, znz: false },
    ] as const;
    for (const c of cases) {
      const r = ok(
        evaluateFuelEmissions(
          {
            candidateFuelId: "e-ammonia",
            quantityTonnes: 1000,
            candidateWtwGco2ePerMj: 15.0,
            baselineFuelId: "hfo",
            frameworkId: "fueleu",
            pilotShare: 0,
            n2oSlipGPerG: c.slip,
            n2oSlipGwpOverride: 273,
            efficiencyRatio: 1.0,
          },
          ds,
        ),
      );
      expect(r.wellToWake.candidate.intensityGco2ePerMj).toBeCloseTo(c.intensity, 1);
      expect(Math.abs(r.wellToWake.avoidedTco2e - c.avoided)).toBeLessThan(c.tol);
      expect(r.znz.compliantTo2034).toBe(c.znz);
    }
  });

  it("F5 — GWP-set switch moves CH4/N2O-bearing results only", () => {
    const ar4 = fuelIntensity(ds, "hfo", "AR4");
    const ar5 = fuelIntensity(ds, "hfo", "AR5");
    if ("notParameterised" in ar4 || "notParameterised" in ar5) throw new Error("hfo");
    expect(Math.abs(ar4.ttwGco2ePerMj - 78.244)).toBeLessThan(0.001);
    expect(Math.abs(ar5.ttwGco2ePerMj - 78.101)).toBeLessThan(0.001);
    expect(Math.abs(ar4.wtwGco2ePerMj - 91.744)).toBeLessThan(0.001);
    expect(Math.abs(ar5.wtwGco2ePerMj - 91.601)).toBeLessThan(0.001);
    // Structural half of the fixture: a pure-CO2 fuel would not move at
    // all — the CO2 GWP is 1 in every set, so the delta is entirely the
    // CH4/N2O terms.
    const delta = ar4.ttwGco2ePerMj - ar5.ttwGco2ePerMj;
    const hfo = ds.fuels.find((f) => f.id === "hfo")!;
    const expected =
      ((hfo.ttw.ch4GPerG! * (25 - 28) + (hfo.ttw.n2oGPerG as number) * (298 - 265)) /
        hfo.lcvMjPerG);
    expect(delta).toBeCloseTo(expected, 9);
  });

  it("reverse direction: replacing 1,000 t HFO needs 2,177.4 t e-ammonia", () => {
    // Hand-computed: 1,000 t HFO × 40,500 MJ/t = 40.5e6 MJ; at pilot 0
    // and ratio 1.0 that is 40.5e6 / 18,600 = 2,177.4 t of e-ammonia —
    // with the SAME 83.7% reduction as F1 (intensities are per-MJ).
    const r = ok(
      evaluateFuelEmissions(
        {
          candidateFuelId: "e-ammonia",
          quantityTonnes: 1000,
          quantityBasis: "baseline",
          candidateWtwGco2ePerMj: 15.0,
          baselineFuelId: "hfo",
          frameworkId: "fueleu",
          pilotShare: 0,
          n2oSlipGPerG: 0,
          efficiencyRatio: 1.0,
        },
        ds,
      ),
    );
    expect(r.candidateMassTonnes).toBeCloseTo(2177.4, 1);
    expect(r.equivalentBaselineMassTonnes).toBeCloseTo(1000, 9);
    expect(r.wellToWake.reductionPercent).toBeCloseTo(83.7, 1);
  });

  it("F7 — IMO's own fossil WtT: sulphur-binned 16.8, not FuelEU's 13.5", () => {
    // Hand values from the round-2 verification report: the substitution
    // was UNDERSTATING avoided emissions by 64.6 t (+4.7%), because the
    // IMO assigns fossil fuels a heavier upstream burden than FuelEU.
    const r = ok(
      evaluateFuelEmissions(
        {
          candidateFuelId: "e-ammonia",
          quantityTonnes: 1000,
          candidateWtwGco2ePerMj: 15.0,
          baselineFuelId: "hfo",
          baselineSulphurPercent: 0.5,
          frameworkId: "imo",
          pilotShare: 0.05,
          pilotFuelId: "mgo",
          n2oSlipGPerG: 0.00022,
          efficiencyRatio: 1.0,
        },
        ds,
      ),
    );
    expect(r.gwpSetId).toBe("AR5");
    expect(r.baselineLabel).toBe("Residual fuel oil, 0.10\u20130.50% S");
    expect(r.wellToWake.baseline.intensityGco2ePerMj).toBeCloseTo(94.9, 2);
    expect(r.equivalentBaselineMassTonnes).toBeCloseTo(483.4, 1);
    expect(r.wellToWake.baseline.emissionsTco2e).toBeCloseTo(1858.1, 1);
    expect(r.wellToWake.candidate.emissionsTco2e).toBeCloseTo(426.0, 1);
    expect(r.wellToWake.avoidedTco2e).toBeCloseTo(1432.0, 1);
    expect(r.wellToWake.reductionPercent).toBeCloseTo(77.1, 1);
    expect(r.znz.fuelWtwGco2ePerMj).toBeCloseTo(18.13, 2);
    // Disclosed substitutions: the unconfirmed IMO LCVs (fix D — LCVs
    // demonstrably diverge, LNG 0.0480 vs 0.0491) and the distillate
    // pilot's WtT. The residual baseline's WtT itself is IMO-native.
    expect(r.substitutedFactors).toEqual([
      "baseline LCV (Heavy fuel oil)",
      "pilot LCV (Marine gas oil / diesel)",
      "pilot WtT (Marine gas oil / diesel)",
    ]);
  });

  it("F6 — identity: avoided(X vs X) === 0 for every parameterised fuel", () => {
    for (const fuel of ds.fuels) {
      for (const gwpSetId of Object.keys(ds.gwpSets)) {
        const r = evaluateFuelEmissions(
          {
            candidateFuelId: fuel.id,
            quantityTonnes: 500,
            baselineFuelId: fuel.id,
            frameworkId: "fueleu",
            gwpSetOverride: gwpSetId,
            // Pathway fuels get an arbitrary certified value; identity
            // must hold regardless... for the WtW basis the baseline uses
            // the row (null wtt -> notParameterised), so identity applies
            // to fully-parameterised fuels only.
            pilotShare: 0,
            n2oSlipGPerG: 0,
            efficiencyRatio: 1.0,
          },
          ds,
        );
        if ("notParameterised" in r && r.notParameterised) continue;
        expect(r.wellToWake.avoidedTco2e).toBe(0);
        expect(r.tankToWake.avoidedTco2e).toBe(0);
      }
    }
  });
});
