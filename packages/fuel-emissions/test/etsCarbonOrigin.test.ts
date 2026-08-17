/**
 * EU ETS carbon origin — what the Directive actually charges for.
 *
 * ETS prices a fuel by its FOSSIL carbon. Biomass meeting the RED
 * sustainability criteria carries an emission factor of zero, and RFNBOs
 * meeting the GHG-saving threshold are likewise zero-rated; only the fossil
 * pilot remains chargeable. Before this, the module charged the whole derived
 * combustion factor, so a certified e-methanol was billed for 1.4550 tCO2/t
 * of carbon the model simultaneously netted out of its abatement figure. One
 * of the two had to change, and the certified value is the sourced one.
 *
 * The tests below pin the three things that make this correct rather than
 * merely favourable:
 *
 *   1. CH4 and N2O are NOT zero-rated. They are charged on warming effect
 *      from 2026 whatever the carbon's provenance — so bio-LNG still pays for
 *      methane slip and ammonia still pays for N2O slip. A naive
 *      "green fuel -> zero" would get this wrong in the generous direction.
 *   2. The pilot is DERIVED, not a constant: change the share or the pilot
 *      fuel and the charge moves.
 *   3. A fossil fuel is completely unaffected.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  carbonBalanceError,
  evaluateFuelEmissions,
  impliedCombustionIntensity,
  parseRefDataset,
  type FuelEmissionsResult,
  type RefFuel,
} from "../src/index";

const ds = parseRefDataset(
  JSON.parse(
    readFileSync(
      new URL("../../../data/fuel-emissions-ref/2026-08-17-ets-carbon-4.json", import.meta.url),
      "utf8",
    ),
  ),
);

const run = (o: Partial<Parameters<typeof evaluateFuelEmissions>[0]> = {}) => {
  const r = evaluateFuelEmissions(
    {
      candidateFuelId: "e-methanol",
      quantityTonnes: 1000,
      baselineFuelId: "hfo",
      frameworkId: "fueleu",
      candidateWtwGco2ePerMj: 15,
      pilotShare: 0.05,
      pilotFuelId: "mgo",
      n2oSlipGPerG: 0,
      efficiencyRatio: ds.engineEfficiencyRatio.default,
      ...o,
    },
    ds,
  );
  if ("notParameterised" in r && r.notParameterised) throw new Error(r.missing.join("; "));
  return r as FuelEmissionsResult;
};
/** Per tonne of candidate fuel (the runs above evaluate 1,000 t). */
const perTonne = (r: FuelEmissionsResult) => r.etsChargeable.totalTco2e / 1000;

describe("every fuel row is classified", () => {
  it("carries carbonOrigin, fossilCarbonShare and etsZeroRated with a source", () => {
    // A green fuel left at the fossil default keeps being charged in full,
    // and a fuel wrongly zero-rated is charged nothing. Both fail silently,
    // so the classification is required rather than optional in practice.
    for (const f of ds.fuels) {
      expect(f.carbonOrigin, `${f.id} carbonOrigin`).toBeDefined();
      expect(f.fossilCarbonShare, `${f.id} fossilCarbonShare`).toBeDefined();
      expect(f.etsZeroRated, `${f.id} etsZeroRated`).toBeDefined();
      expect(f.carbonOriginSource, `${f.id} needs a legal basis`).toBeTruthy();
    }
  });

  it("keeps the flag and the share consistent", () => {
    for (const f of ds.fuels) {
      expect(f.etsZeroRated, `${f.id}`).toBe(f.fossilCarbonShare === 0);
    }
  });

  it("classifies every fossil row as fully chargeable", () => {
    for (const f of ds.fuels.filter((x) => x.family === "fossil")) {
      expect(f.carbonOrigin, f.id).toBe("fossil");
      expect(f.fossilCarbonShare, f.id).toBe(1);
    }
  });
});

describe("a certified RFNBO is charged for its pilot only", () => {
  it("charges 0.0800 tCO2/t, not the 1.4550 it burns", () => {
    const r = run();
    // The stack factor is unchanged and still real — this is the whole point
    // of keeping the ETS view separate from tankToWake.
    expect(r.tankToWake.candidate.emissionsTco2e / 1000).toBeCloseTo(1.455, 3);
    expect(perTonne(r)).toBeCloseTo(0.08, 4);
    expect(r.etsChargeable.co2Tco2e).toBe(0);
  });

  it("charges nothing at all without a pilot", () => {
    expect(perTonne(run({ pilotShare: 0 }))).toBe(0);
  });
});

describe("the pilot term is derived, never a constant", () => {
  it("moves with the pilot SHARE", () => {
    // If 0.0800 were hardcoded anywhere, these would be equal.
    const at5 = perTonne(run({ pilotShare: 0.05 }));
    const at8 = perTonne(run({ pilotShare: 0.08 }));
    expect(at8).toBeGreaterThan(at5 * 1.5);
    expect(at8).toBeCloseTo(0.1321, 4);
  });

  it("moves with the pilot FUEL", () => {
    const mgo = perTonne(run({ pilotFuelId: "mgo" }));
    const hfo = perTonne(run({ pilotFuelId: "hfo" }));
    expect(hfo).not.toBeCloseTo(mgo, 6);
  });
});

describe("non-CO2 gases are never zero-rated by carbon origin", () => {
  it("charges ammonia for its N2O slip", () => {
    // The molecule is carbon-free, so its CO2 charge is the pilot alone —
    // but N2O is chargeable, and on the default slip it is the same order as
    // the pilot term. An ammonia corridor with gas coverage off understates
    // its exposure badly.
    const noSlip = run({ candidateFuelId: "e-ammonia", n2oSlipGPerG: 0 });
    const slip = run({ candidateFuelId: "e-ammonia", n2oSlipGPerG: 0.00022 });
    expect(noSlip.etsChargeable.nonCo2Tco2e).toBe(0);
    expect(slip.etsChargeable.nonCo2Tco2e / 1000).toBeCloseTo(0.0656, 4);
    // Comparable to the ~0.0748 pilot term, exactly as the Directive implies.
    expect(slip.etsChargeable.nonCo2Tco2e).toBeGreaterThan(
      slip.etsChargeable.pilotTco2e * 0.5,
    );
  });

  it("charges a zero-rated fuel's CH4/N2O even at fossilCarbonShare 0", () => {
    // The bio-LNG case in miniature: zero-rated CO2 must not zero the gases.
    // Constructed rather than taken from the dataset, because no bio-LNG row
    // exists yet — when one is added this is the behaviour it must have.
    const bioLng: RefFuel = {
      ...ds.fuels.find((f) => f.id === "lng")!,
      id: "bio-lng-probe",
      carbonOrigin: "biogenic",
      fossilCarbonShare: 0,
      etsZeroRated: true,
    };
    const probeDs = { ...ds, fuels: [...ds.fuels, bioLng] };
    const r = evaluateFuelEmissions(
      {
        candidateFuelId: "bio-lng-probe",
        quantityTonnes: 1000,
        baselineFuelId: "hfo",
        frameworkId: "fueleu",
        engineType: "lng-otto-df-medium-speed",
        pilotShare: 0,
      },
      probeDs,
    );
    if ("notParameterised" in r && r.notParameterised) throw new Error(r.missing.join("; "));
    const ok = r as FuelEmissionsResult;
    expect(ok.etsChargeable.co2Tco2e).toBe(0);
    // Methane slip at 3.1% dominates and is still charged in full.
    expect(ok.etsChargeable.nonCo2Tco2e).toBeGreaterThan(0);
    expect(ok.etsChargeable.totalTco2e).toBe(ok.etsChargeable.nonCo2Tco2e);
  });
});

describe("fossil fuels are untouched", () => {
  it("charges HFO its whole combustion factor", () => {
    const r = run({ candidateFuelId: "hfo", candidateWtwGco2ePerMj: undefined, pilotShare: 0 });
    expect(r.etsChargeable.fossilCarbonShare).toBe(1);
    // Chargeable == the full TtW figure for a fossil fuel with no pilot.
    expect(r.etsChargeable.totalTco2e).toBeCloseTo(r.tankToWake.candidate.emissionsTco2e, 9);
  });

  it("defaults an UNCLASSIFIED row to fully chargeable", () => {
    // Over-charging an unclassified green fuel is visible; under-charging an
    // unclassified fossil one is not. The default has to fail loudly.
    const bare: RefFuel = {
      ...ds.fuels.find((f) => f.id === "hfo")!,
      id: "unclassified-probe",
      carbonOrigin: undefined,
      fossilCarbonShare: undefined,
      etsZeroRated: undefined,
    };
    const probeDs = { ...ds, fuels: [...ds.fuels, bare] };
    const r = evaluateFuelEmissions(
      {
        candidateFuelId: "unclassified-probe",
        quantityTonnes: 1000,
        baselineFuelId: "hfo",
        frameworkId: "fueleu",
        pilotShare: 0,
      },
      probeDs,
    );
    if ("notParameterised" in r && r.notParameterised) throw new Error(r.missing.join("; "));
    expect((r as FuelEmissionsResult).etsChargeable.fossilCarbonShare).toBe(1);
  });
});

describe("the carbon-balance gate", () => {
  it("computes the implied combustion intensity from the row", () => {
    // e-methanol: 1.375 g/g over LCV 0.0199 MJ/g = 69.1 gCO2/MJ.
    const m = ds.fuels.find((f) => f.id === "e-methanol")!;
    expect(impliedCombustionIntensity(m)).toBeCloseTo(69.1, 1);
  });

  it("fires on a row stating a WtW below its own stack intensity", () => {
    // THE CONTRADICTION THIS EXISTS TO MAKE UNREPRESENTABLE. A fuel cannot
    // emit less over its whole lifecycle than at the stack alone — unless
    // carbon was captured, which is what zero-rating means.
    const unflagged: RefFuel = {
      ...ds.fuels.find((f) => f.id === "e-methanol")!,
      etsZeroRated: false,
    };
    const err = carbonBalanceError(unflagged, 15);
    expect(err).toBeTruthy();
    expect(err).toMatch(/well-to-wake 15/);
    expect(err).toMatch(/69\.1/);
    expect(err).toMatch(/ttw\.co2GPerG/);
  });

  it("does NOT fire once the row is zero-rated", () => {
    const m = ds.fuels.find((f) => f.id === "e-methanol")!;
    expect(m.etsZeroRated).toBe(true);
    expect(carbonBalanceError(m, 15)).toBeNull();
  });

  it("does not fire on a fossil row's well-to-TANK figure", () => {
    // The bug this caught during implementation: a fixed row's
    // wttGco2ePerMj is UPSTREAM only, so comparing it against combustion
    // intensity refuses every fossil fuel (LNG: WtT 18.5 vs a 57.3 stack).
    // Only a certified well-to-WAKE value is comparable.
    const lng = ds.fuels.find((f) => f.id === "lng")!;
    expect(carbonBalanceError(lng, undefined)).toBeNull();
    expect(
      evaluateFuelEmissions(
        {
          candidateFuelId: "lng",
          quantityTonnes: 1000,
          baselineFuelId: "hfo",
          frameworkId: "fueleu",
          engineType: "lng-otto-df-medium-speed",
          pilotShare: 0,
        },
        ds,
      ),
    ).not.toHaveProperty("notParameterised", true);
  });
});
