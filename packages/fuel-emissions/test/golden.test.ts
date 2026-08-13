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
      new URL("../../../data/fuel-emissions-ref/2026-08-13-seed-1.json", import.meta.url),
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
          baselineFuelId: "vlsfo",
          frameworkId: "fueleu",
          pilotShare: 0,
          n2oSlipGPerG: 0,
          efficiencyRatio: 1.0,
        },
        ds,
      ),
    );
    expect(r.candidateEnergyMj).toBeCloseTo(18_600_000, 0);
    expect(r.equivalentBaselineMassTonnes).toBeCloseTo(453.7, 1);
    expect(r.wellToWake.candidate.emissionsTco2e).toBeCloseTo(279.0, 1);
    expect(r.wellToWake.baseline.emissionsTco2e).toBeCloseTo(1683.1, 1);
    expect(r.wellToWake.avoidedTco2e).toBeCloseTo(1404.1, 1);
    expect(r.wellToWake.reductionPercent).toBeCloseTo(83.4, 1);
    // The failure mode this fixture exists to catch: tonne-for-tonne
    // arithmetic returns 3,095.1 tCO2e (2.20x). Assert we are nowhere near.
    expect(Math.abs(r.wellToWake.avoidedTco2e - 3095.1)).toBeGreaterThan(1000);
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
          baselineFuelId: "vlsfo",
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
    expect(r.equivalentBaselineMassTonnes).toBeCloseTo(477.5, 1);
    expect(r.wellToWake.avoidedTco2e).toBeCloseTo(1403.8, 1);
    expect(r.wellToWake.blendIntensityGco2ePerMj).toBeCloseTo(18.79, 2);
    // The threshold proximity IS the headline: under 19.0 (to 2034),
    // above 14.0 (from 2035).
    expect(r.znz.compliantTo2034).toBe(true);
    expect(r.znz.compliantFrom2035).toBe(false);
  });

  it("F4 — N2O sensitivity: three published scenarios, slip priced at 273", () => {
    // Fixture convention: the framework stays FuelEU/AR4 (baseline 90.49);
    // ONLY the slip term is priced at GWP 273 — the sensitivity the
    // dataset's scenarios were derived with.
    const cases = [
      { slip: 0.0000681, intensity: 16.0, avoided: 1385.5, tol: 0.05, znz: true },
      // 1344.0 and 721.7 were hand-derived from the ROUNDED adds
      // intermediates (3.23 / 36.69); the exact engine lands within 0.1.
      { slip: 0.00022, intensity: 18.23, avoided: 1344.0, tol: 0.1, znz: true },
      { slip: 0.0025, intensity: 51.69, avoided: 721.7, tol: 0.15, znz: false },
    ] as const;
    for (const c of cases) {
      const r = ok(
        evaluateFuelEmissions(
          {
            candidateFuelId: "e-ammonia",
            quantityTonnes: 1000,
            candidateWtwGco2ePerMj: 15.0,
            baselineFuelId: "vlsfo",
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
