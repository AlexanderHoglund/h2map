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
      new URL("../../../data/fuel-emissions-ref/2026-08-14-seed-2.json", import.meta.url),
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
  baseline: fc.constantFrom("hfo", "lfo", "mgo"),
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

  it("LNG: engine type is explicit — refuses without one, slip dominates with one", () => {
    // No engine type → refuse (Cslip differs per technology).
    const no = evaluateFuelEmissions(
      { candidateFuelId: "lng", quantityTonnes: 1000, baselineFuelId: "hfo", frameworkId: "fueleu" },
      ds,
    );
    expect("notParameterised" in no && no.notParameterised).toBe(true);
    if (!("notParameterised" in no) || !no.notParameterised) throw new Error("unreachable");
    expect(no.missing.join(" ")).toMatch(/engineType/);

    // Otto DF medium-speed under FuelEU AR4, hand-computed: per g of fuel
    // (1−0.031) combusts and 0.031 escapes as CH4 —
    // (2.750×0.969 + 0.031×25 + 0.00011×0.969×298) / 0.0491 = 70.703 TtW;
    // + WtT 18.5 = 89.203 WtW, below HFO's 91.744 by only ~2.5.
    const run = (engineType: string) => {
      const r = evaluateFuelEmissions(
        {
          candidateFuelId: "lng",
          quantityTonnes: 1000,
          baselineFuelId: "hfo",
          frameworkId: "fueleu",
          engineType,
          pilotShare: 0,
        },
        ds,
      );
      if ("notParameterised" in r && r.notParameterised) throw new Error("refused");
      return r as FuelEmissionsResult;
    };
    const otto = run("lng-otto-df-medium-speed");
    expect(otto.wellToWake.candidate.intensityGco2ePerMj).toBeCloseTo(89.203, 2);
    // Diesel DF slow-speed (Cslip 0.2%): 76.081 — slip is THE lever.
    const diesel = run("lng-diesel-df-slow-speed");
    expect(diesel.wellToWake.candidate.intensityGco2ePerMj).toBeCloseTo(76.081, 2);
    expect(otto.wellToWake.avoidedTco2e).toBeLessThan(diesel.wellToWake.avoidedTco2e);

    // The IMO path still refuses: no default upstream factor (ICCT) — the
    // FuelEU WtT must not be borrowed.
    const imo = evaluateFuelEmissions(
      {
        candidateFuelId: "lng",
        quantityTonnes: 1000,
        baselineFuelId: "hfo",
        frameworkId: "imo",
        engineType: "lng-otto-df-medium-speed",
      },
      ds,
    );
    expect("notParameterised" in imo && imo.notParameterised).toBe(true);
    if (!("notParameterised" in imo) || !imo.notParameterised) throw new Error("unreachable");
    expect(imo.reviewNote).toMatch(/ICCT/);
  });

  it("e-methanol refuses without a certified value; computes with one", () => {
    const refused = evaluateFuelEmissions(
      {
        candidateFuelId: "e-methanol",
        quantityTonnes: 1000,
        baselineFuelId: "hfo",
        frameworkId: "fueleu",
      },
      ds,
    );
    expect("notParameterised" in refused && refused.notParameterised).toBe(true);
    if (!("notParameterised" in refused) || !refused.notParameterised)
      throw new Error("unreachable");
    expect(refused.missing[0]).toMatch(/certified pathway/);

    // With a certified E-value it is a pathway fuel like e-ammonia:
    // 1,000 t @ 19,900 MJ/t = 19.9e6 MJ replaces 491.4 t HFO; avoided
    // WtW = 19.9e6 x (91.744 - 10) x 1e-6 = 1,626.71 tCO2e. The TtW basis
    // stays chemical: methanol is a carbon molecule, so the candidate's
    // tank-to-wake intensity is 1.375 / 0.0199 = 69.10 gCO2/MJ even
    // though the certified WtW is 10.
    const r = evaluateFuelEmissions(
      {
        candidateFuelId: "e-methanol",
        quantityTonnes: 1000,
        baselineFuelId: "hfo",
        frameworkId: "fueleu",
        candidateWtwGco2ePerMj: 10,
        pilotShare: 0,
      },
      ds,
    );
    if ("notParameterised" in r && r.notParameterised) throw new Error("refused");
    const ok = r as FuelEmissionsResult;
    expect(ok.equivalentBaselineMassTonnes).toBeCloseTo(491.36, 1);
    expect(ok.wellToWake.avoidedTco2e).toBeCloseTo(1626.71, 1);
    expect(ok.wellToWake.candidate.intensityGco2ePerMj).toBeCloseTo(10, 9);
    expect(ok.tankToWake.candidate.intensityGco2ePerMj).toBeCloseTo(69.095, 2);
    // Chemical TtW decomposition parts carry the combustion CO2.
    expect(ok.tankToWake.candidate.parts.ttwCo2Tco2e).toBeCloseTo(
      (19.9e6 * (1.375 / 0.0199)) / 1e6,
      6,
    );
  });

  it("a pathway fuel without a certified value refuses — zero is not a default", () => {
    const r = evaluateFuelEmissions(
      {
        candidateFuelId: "e-ammonia",
        quantityTonnes: 1000,
        baselineFuelId: "hfo",
        frameworkId: "fueleu",
      },
      ds,
    );
    expect("notParameterised" in r && r.notParameterised).toBe(true);
    if (!("notParameterised" in r) || !r.notParameterised) throw new Error("unreachable");
    expect(r.missing[0]).toMatch(/certified pathway/);
  });

  it("row atomicity: every fossil fuel's five factors come from ONE Annex II row", () => {
    // Independent copy of the confirmed Annex II table (DG MOVE FuelEU
    // guidance document; ESSF SAPS WS1 working document — both reproduce
    // it verbatim; retrieved 2026-08-14). The former "VLSFO" row mixed
    // the LFO LCV/WtT with the HFO carbon factor — a combination in
    // neither row. This test makes that class of bug impossible to
    // reintroduce: a fossil row must match a single Annex II row on ALL
    // five factors at once, or name its exception explicitly (LNG's WtT
    // is a secondary-source value pending Annex II verification).
    const ANNEX_II = [
      { lcv: 0.0405, wtt: 13.5, co2: 3.114, ch4: 0.00005, n2o: 0.00018 }, // HFO RME–RMK
      { lcv: 0.041, wtt: 13.2, co2: 3.151, ch4: 0.00005, n2o: 0.00018 }, // LFO RMA–RMD
      { lcv: 0.0427, wtt: 14.4, co2: 3.206, ch4: 0.00005, n2o: 0.00018 }, // MDO/MGO DMX–DMB
      { lcv: 0.0491, wtt: 18.5, co2: 2.75, ch4: 0, n2o: 0.00011 }, // LNG (WtT unverified)
    ];
    for (const fuel of ds.fuels.filter((f) => f.family === "fossil")) {
      const match = ANNEX_II.find(
        (row) =>
          row.lcv === fuel.lcvMjPerG &&
          row.wtt === fuel.wttGco2ePerMj &&
          row.co2 === fuel.ttw.co2GPerG &&
          row.ch4 === fuel.ttw.ch4GPerG &&
          row.n2o === fuel.ttw.n2oGPerG,
      );
      expect(match, `${fuel.id}: factors do not match any single Annex II row`).toBeDefined();
    }
  });

  it("dataset hygiene: every fuel row carries source + derivation + verified", () => {
    for (const fuel of ds.fuels) {
      expect(fuel.source.length).toBeGreaterThan(0);
      expect(fuel.derivation.length).toBeGreaterThan(0);
      expect(typeof fuel.verified).toBe("boolean");
    }
  });
});
