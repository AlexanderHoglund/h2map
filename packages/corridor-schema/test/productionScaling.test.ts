import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRefBundle } from "../src/ref/bundle";
import { resolveScenario } from "../src/resolve";
import {
  scaleCorrection,
  scaledCapitalUsd,
  specificCapitalScaleFactor,
  SCALE_EXTRAPOLATION_LIMIT,
} from "../src/ref/scale";
import type { RefBundle } from "../src/ref/bundle";
import type { ScenarioInput } from "../src/scenario";

/**
 * Production cost scales with the corridor's own demand.
 *
 * `prodNameplateTonnesPerYear` sat in the schema and in the data for two
 * weeks with ZERO readers, so production capex resolved as a flat scalar: a
 * 15 kt/yr corridor and a 600 kt/yr one were both charged $55m. Fixing the
 * LEVEL without fixing the scaling would only have relocated the error, so
 * these tests pin the scaling itself rather than any particular number.
 *
 * The second half pins the FOAK non-double-count, which is the trap the
 * research note flags hardest: the researched central is already
 * first-of-a-kind (anchored on NEOM at financial close and AM Green at FID),
 * so multiplying it by `foakMultiplier` charges the premium twice.
 */

const RESEARCH = JSON.parse(
  readFileSync(
    new URL("../../../docs/corridor/research/fuel-benchmarks-v1.json", import.meta.url),
    "utf8",
  ),
) as { fuels: { id: string; [k: string]: unknown }[] };

/** v3 with the research block grafted on — what the new bundle will carry. */
function researchedBundle(): RefBundle {
  const raw = JSON.parse(
    readFileSync(
      new URL("../../../data/corridor-ref/2026-08-17-vessel-v3.json", import.meta.url),
      "utf8",
    ),
  ) as { fuels: Record<string, unknown>[] };
  for (const f of raw.fuels) {
    const r = RESEARCH.fuels.find((x) => x.id === f.id);
    if (r) {
      f.research = {
        production: r.production,
        portStorage: r.portStorage,
        bunkering: r.bunkering,
        merchantPrice: r.merchantPrice,
        vesselCapexPremium: r.vesselCapexPremium,
      };
    }
  }
  return parseRefBundle(raw);
}

const bundle = researchedBundle();

describe("the scale primitive", () => {
  it("is flat at the reference scale", () => {
    expect(specificCapitalScaleFactor(100_000, 0.85, 100_000)).toBeCloseTo(1, 12);
  });

  it("charges MORE per tonne below the reference, less above", () => {
    // The whole point of the correction: small dedicated plants are dearer
    // per tpa than world-scale ones.
    expect(specificCapitalScaleFactor(100_000, 0.85, 10_000)).toBeGreaterThan(1);
    expect(specificCapitalScaleFactor(100_000, 0.85, 1_000_000)).toBeLessThan(1);
  });

  it("reproduces the researched exponent end to end", () => {
    // 24x the demand must give 24^0.85 = 14.9x the capital, not 24x.
    const small = scaledCapitalUsd(11_000, 100_000, 0.85, 12_000);
    const large = scaledCapitalUsd(11_000, 100_000, 0.85, 288_000);
    expect(Math.log(large / small) / Math.log(24)).toBeCloseTo(0.85, 6);
  });

  it("flags when the power law is being stretched", () => {
    // A 60 kt corridor plant against a 1.2 Mt reference is 20x — the lineage
    // has to say so rather than quietly extrapolating.
    expect(scaleCorrection(1_200_000, 0.85, 60_000).extrapolated).toBe(true);
    expect(scaleCorrection(100_000, 0.85, 60_000).extrapolated).toBe(false);
    expect(SCALE_EXTRAPOLATION_LIMIT).toBe(5);
  });

  it("degrades safely rather than returning NaN or Infinity", () => {
    // A zero reference is what an unresearched fuel row carries.
    expect(specificCapitalScaleFactor(0, 0.85, 60_000)).toBe(1);
    expect(specificCapitalScaleFactor(100_000, 0.85, 0)).toBe(1);
  });
});

describe("FOAK is not charged twice", () => {
  it("defaults to 1 — the researched central is already first-of-a-kind", () => {
    // Anchored on NEOM at financial close and AM Green at FID, both carrying
    // FOAK contingency inside their published numbers.
    const withoutFoak = scaledCapitalUsd(11_000, 100_000, 0.85, 60_000);
    const explicitOne = scaledCapitalUsd(11_000, 100_000, 0.85, 60_000, 1);
    expect(withoutFoak).toBe(explicitOne);
  });

  it("the resolver does NOT apply the researched foakMultiplier", () => {
    // The band exists for a NOAK or study-derived baseline. If the resolver
    // ever starts multiplying, e-ammonia is charged FOAK twice and this
    // fails — which is the whole reason it is a test and not a comment.
    const eAmmonia = bundle.fuels.find((f) => f.id === "e-ammonia")!;
    const r = eAmmonia.research!.production;
    expect(r.foakMultiplier.central).toBeGreaterThan(1);

    const scenario = buildPlantScenario(3);
    const resolved = resolveScenario(scenario, bundle);
    const demand =
      (resolved.green.tonnesPerVesselYear.value as number) * scenario.cargo.vessels;
    const expected =
      scaledCapitalUsd(
        r.capexUsdPerTpa.central,
        r.referenceNameplateTonnesPerYear,
        r.scaleExponent.central,
      // deliberately NO foak argument
        demand,
      ) / 1e6;
    expect(resolved.green.prodCapexUsdM.value as number).toBeCloseTo(expected, 6);
  });
});

/** Build-plant, benchmarks only, at a given roundtrip count. */
function buildPlantScenario(roundtrips: number): ScenarioInput {
  const s: ScenarioInput = {
    schemaVersion: 7,
    refBundleId: bundle.bundleId,
    cargo: {
      countryId: "chile",
      routeType: "point-to-point",
      oneWayDistanceNm: 9500,
      startYear: 2030,
      horizonYears: 15,
      unitsPerYear: 1_650_000,
      inflation: 0.02,
      vessels: 10,
      roundtripsPerYear: roundtrips,
      unit: "tonne",
      unitWeightTonnes: 1,
      waccOverride: 0.08,
    },
    vessel: {
      typeId: "bulk-handymax-58k",
      green: { capexUsdMPerShip: null, opexUsdMPerShipPerYear: null },
      fossil: { capexUsdMPerShip: null, opexUsdMPerShipPerYear: null },
    },
    green: {
      fuelId: "e-ammonia",
      sourcing: "build-plant",
      overrides: emptyOverrides(),
    },
    fossil: {
      fuelId: "lsfo",
      sourcing: "purchase",
      overrides: emptyOverrides(),
    },
    regulation: {
      eurUsd: 1.08,
      ets: { enabled: false, euaEurPerTonne: 80, scope: 1 },
      fuelEu: {
        enabled: false,
        penaltyEurPerTonne: 2400,
        vlsfoMjPerTonne: 41000,
        baselineGco2PerMj: 91.16,
        scope: 1,
      },
      ira45z: { enabled: false, creditUsdPerGallon: 1, usProduced: false },
      selfDesigned: {
        enabled: false,
        co2PriceUsdPerTonne: 0,
        supportUsdPerKg: 0,
        capexSupport: 0,
        opexSupport: 0,
        otherUsdM: 0,
      },
    },
    flags: { emissionsBasis: "wellToWake", rateBasis: "nominal" },
  };
  return s;
}

function emptyOverrides() {
  return {
    priceUsdPerTonne: null,
    fuelTonnesPerVesselYear: null,
    lhvMjPerTonne: null,
    combustionEfTco2PerTonne: null,
    wtwGco2PerMj: null,
    prodCapexUsdM: null,
    prodOpexUsdMPerYear: null,
    portStorageCapexUsdM: null,
    portStorageOpexUsdMPerYear: null,
    bargeCapexUsdM: null,
    bargeOpexUsdMPerYear: null,
  };
}

describe("build-plant production scales with corridor demand", () => {
  it("a bigger corridor is charged MORE plant, not the same plant", () => {
    // THE REGRESSION THIS FILE EXISTS FOR. Before the fix both of these
    // resolved to the bundle's flat $55m.
    const small = resolveScenario(buildPlantScenario(1), bundle);
    const large = resolveScenario(buildPlantScenario(12), bundle);
    expect(large.green.prodCapexUsdM.value as number).toBeGreaterThan(
      (small.green.prodCapexUsdM.value as number) * 2,
    );
  });

  it("scales sub-linearly — economies of scale, not a per-tonne multiplier", () => {
    const small = resolveScenario(buildPlantScenario(1), bundle);
    const large = resolveScenario(buildPlantScenario(12), bundle);
    const capexRatio =
      (large.green.prodCapexUsdM.value as number) /
      (small.green.prodCapexUsdM.value as number);
    // 12x the demand, so linear would be 12x and the correction must beat it.
    expect(capexRatio).toBeLessThan(12);
    expect(capexRatio).toBeGreaterThan(1);
  });

  it("opex stays LINEAR in demand — no percentage-of-capex compounding", () => {
    // The research note's structural warning: `opex = pct x capex` is
    // wrong-signed under scale, because a small plant carries both a higher
    // capex/tpa and a higher true O&M/tpa. Taking the absolute $/tpa/yr
    // avoids counting the penalty twice.
    const perTpa = (rt: number) => {
      const r = resolveScenario(buildPlantScenario(rt), bundle);
      const demand = (r.green.tonnesPerVesselYear.value as number) * 10;
      return ((r.green.prodOpexUsdMPerYear.value as number) * 1e6) / demand;
    };
    expect(perTpa(1)).toBeCloseTo(perTpa(12), 6);
  });

  it("an override still wins over the scaled benchmark", () => {
    const s = buildPlantScenario(3);
    s.green.overrides.prodCapexUsdM = 42;
    const r = resolveScenario(s, bundle);
    expect(r.green.prodCapexUsdM.value as number).toBe(42);
    expect(r.green.prodCapexUsdM.source).toBe("override");
  });

  it("a bundle WITHOUT research falls back to the flat scalar", () => {
    // Older bundles must keep resolving to their original numbers — the
    // immutability contract depends on it.
    const legacy = parseRefBundle(
      JSON.parse(
        readFileSync(
          new URL("../../../data/corridor-ref/2026-08-17-vessel-v3.json", import.meta.url),
          "utf8",
        ),
      ),
    );
    const s = buildPlantScenario(3);
    s.refBundleId = legacy.bundleId;
    const r = resolveScenario(s, legacy);
    const row = legacy.fuels.find((f) => f.id === "e-ammonia")!;
    expect(r.green.prodCapexUsdM.value as number).toBe(row.prodCapexUsdM);
  });
});
