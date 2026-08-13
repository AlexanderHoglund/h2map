/**
 * Property tests: the decomposition is exhaustive, quantity is monotone,
 * GWP sets never mix, and missing parameters refuse rather than default.
 */

import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  evaluateFuelEmissions,
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

const arbInput = fc.record({
  quantityTonnes: fc.double({ min: 1, max: 100_000, noNaN: true }),
  candidateWtw: fc.double({ min: 0.1, max: 28.2, noNaN: true }),
  pilotShare: fc.double({ min: 0, max: 0.08, noNaN: true }),
  n2oSlip: fc.double({ min: 0, max: 0.0025, noNaN: true }),
  efficiencyRatio: fc.double({ min: 0.8, max: 1.2, noNaN: true }),
  baseline: fc.constantFrom("vlsfo", "hfo", "mgo"),
  gwpSet: fc.constantFrom("AR4", "AR5", "AR6"),
});

function run(a: {
  quantityTonnes: number;
  candidateWtw: number;
  pilotShare: number;
  n2oSlip: number;
  efficiencyRatio: number;
  baseline: string;
  gwpSet: string;
}): FuelEmissionsResult {
  const r = evaluateFuelEmissions(
    {
      candidateFuelId: "e-ammonia",
      quantityTonnes: a.quantityTonnes,
      candidateWtwGco2ePerMj: a.candidateWtw,
      baselineFuelId: a.baseline,
      frameworkId: "fueleu",
      gwpSetOverride: a.gwpSet,
      pilotShare: a.pilotShare,
      n2oSlipGPerG: a.n2oSlip,
      efficiencyRatio: a.efficiencyRatio,
    },
    ds,
  );
  if ("notParameterised" in r && r.notParameterised) throw new Error("unexpected gap");
  return r as FuelEmissionsResult;
}

const relClose = (a: number, b: number, tol = 1e-9): boolean =>
  a === b || Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300) <= tol;

describe("fuel-emissions properties", () => {
  it("decomposition sums exactly on both sides and both bases (1e-9)", () => {
    fc.assert(
      fc.property(arbInput, (a) => {
        const r = run(a);
        for (const basis of [r.wellToWake, r.tankToWake]) {
          for (const side of [basis.candidate, basis.baseline]) {
            const p = side.parts;
            const sum =
              p.wttTco2e + p.ttwCo2Tco2e + p.ttwCh4Tco2e + p.ttwN2oTco2e +
              p.n2oSlipTco2e + p.pilotTco2e;
            if (!relClose(side.emissionsTco2e, sum)) return false;
          }
          if (
            !relClose(
              basis.avoidedTco2e,
              basis.baseline.emissionsTco2e - basis.candidate.emissionsTco2e,
            )
          ) {
            return false;
          }
        }
        return true;
      }),
    );
  });

  it("avoided emissions scale linearly (hence monotonically) with quantity", () => {
    fc.assert(
      fc.property(arbInput, fc.double({ min: 1.1, max: 5, noNaN: true }), (a, k) => {
        const r1 = run(a);
        const r2 = run({ ...a, quantityTonnes: a.quantityTonnes * k });
        return relClose(r2.wellToWake.avoidedTco2e, r1.wellToWake.avoidedTco2e * k, 1e-9);
      }),
    );
  });

  it("GWP-set isolation: switching sets moves only CH4/N2O-bearing terms", () => {
    fc.assert(
      fc.property(arbInput, (a) => {
        const ar4 = run({ ...a, gwpSet: "AR4" });
        const ar5 = run({ ...a, gwpSet: "AR5" });
        // The candidate's certified WtT and CO2 terms are GWP-independent.
        const c4 = ar4.wellToWake.candidate.parts;
        const c5 = ar5.wellToWake.candidate.parts;
        if (!relClose(c4.wttTco2e, c5.wttTco2e)) return false;
        if (!relClose(c4.ttwCo2Tco2e, c5.ttwCo2Tco2e)) return false;
        const b4 = ar4.wellToWake.baseline.parts;
        const b5 = ar5.wellToWake.baseline.parts;
        return relClose(b4.ttwCo2Tco2e, b5.ttwCo2Tco2e) && relClose(b4.wttTco2e, b5.wttTco2e);
      }),
    );
  });

  it("round trip: reverse(forward's baseline mass) reproduces the candidate mass", () => {
    fc.assert(
      fc.property(arbInput, (a) => {
        const fwd = run(a);
        const rev = evaluateFuelEmissions(
          {
            candidateFuelId: "e-ammonia",
            quantityTonnes: fwd.equivalentBaselineMassTonnes,
            quantityBasis: "baseline",
            candidateWtwGco2ePerMj: a.candidateWtw,
            baselineFuelId: a.baseline,
            frameworkId: "fueleu",
            gwpSetOverride: a.gwpSet,
            pilotShare: a.pilotShare,
            n2oSlipGPerG: a.n2oSlip,
            efficiencyRatio: a.efficiencyRatio,
          },
          ds,
        );
        if ("notParameterised" in rev && rev.notParameterised) return false;
        const r = rev as FuelEmissionsResult;
        return (
          relClose(r.candidateMassTonnes, a.quantityTonnes, 1e-9) &&
          relClose(r.wellToWake.avoidedTco2e, fwd.wellToWake.avoidedTco2e, 1e-9)
        );
      }),
    );
  });

  it("LNG refuses: missing WtT + per-engine slip requirement, never zeroed", () => {
    const r = evaluateFuelEmissions(
      { candidateFuelId: "lng", quantityTonnes: 1000, baselineFuelId: "vlsfo", frameworkId: "fueleu" },
      ds,
    );
    expect("notParameterised" in r && r.notParameterised).toBe(true);
    if (!("notParameterised" in r) || !r.notParameterised) throw new Error("unreachable");
    expect(r.missing.join(" ")).toMatch(/wtt/i);
    expect(r.missing.join(" ")).toMatch(/engineType/);
    expect(r.reviewNote).toMatch(/ICCT/);
  });

  it("e-methanol refuses: pathway rows pending", () => {
    const r = evaluateFuelEmissions(
      {
        candidateFuelId: "e-methanol",
        quantityTonnes: 1000,
        baselineFuelId: "vlsfo",
        frameworkId: "fueleu",
      },
      ds,
    );
    expect("notParameterised" in r && r.notParameterised).toBe(true);
  });

  it("a pathway fuel without a certified value refuses — zero is not a default", () => {
    const r = evaluateFuelEmissions(
      {
        candidateFuelId: "e-ammonia",
        quantityTonnes: 1000,
        baselineFuelId: "vlsfo",
        frameworkId: "fueleu",
      },
      ds,
    );
    expect("notParameterised" in r && r.notParameterised).toBe(true);
    if (!("notParameterised" in r) || !r.notParameterised) throw new Error("unreachable");
    expect(r.missing[0]).toMatch(/certified pathway/);
  });

  it("dataset hygiene: every fuel row carries source + derivation + verified", () => {
    for (const fuel of ds.fuels) {
      expect(fuel.source.length).toBeGreaterThan(0);
      expect(fuel.derivation.length).toBeGreaterThan(0);
      expect(typeof fuel.verified).toBe("boolean");
    }
  });
});
