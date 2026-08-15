/**
 * JSON round-trip completeness: parseScenarioInput (and therefore the
 * import path, project saves and the share viewer — every one of them
 * funnels through the zod schema) must preserve EVERY field of a maximally
 * populated scenario, byte-for-byte on values. zod silently STRIPS keys the
 * schema does not declare — the exact bug class that once ate
 * regulation.imoNetZero on API saves — so this test is the tripwire.
 *
 * The `DeepRequired` mapped type forces the literal below to carry every
 * optional field: adding a field to ScenarioInput without extending this
 * literal is a COMPILE error, and forgetting to add it to validate.ts is a
 * runtime failure here.
 */

import { describe, expect, it } from "vitest";
import {
  SCENARIO_TEMPLATE,
  fromCompleteScenarioJson,
  migrateScenarioInput,
  parseScenarioInput,
  toCompleteScenarioJson,
} from "../src";
import type { ScenarioInput } from "../src";

type DeepRequired<T> = T extends (infer U)[]
  ? DeepRequired<U>[]
  : T extends object
    ? { [K in keyof T]-?: DeepRequired<T[K]> }
    : T;

const component = (derived: number, override: number | null) => ({
  derivedUsdM: derived,
  overrideUsdM: override,
});

/** Every field present, every optional set — incl. ports, lon/lat, route. */
const MAXIMAL: DeepRequired<ScenarioInput> = {
  schemaVersion: 7,
  refBundleId: "2026-07-30-excel-v1",
  cargo: {
    countryId: "australia",
    routeType: "point-to-point",
    oneWayDistanceNm: 3840,
    startYear: 2030,
    horizonYears: 15,
    unitsPerYear: 1_000_000,
    inflation: 0.02,
    vessels: 2,
    roundtripsPerYear: 9,
    waccOverride: 0.075,
    unit: "teu",
    unitWeightTonnes: 14,
    portAName: "Port Hedland",
    portACoords: { lat: -20.31, lon: 118.58 },
    portBName: "Gwangyang",
    countryBId: "south-korea",
    portBCoords: { lat: 34.94, lon: 127.7 },
    routedDistance: { nm: 3840, graphVersion: "marnet-plus-100km@2.2.0", via: "suez" },
  },
  vessel: {
    typeId: "handymax-bulk-58k",
    green: { capexUsdMPerShip: 88, opexUsdMPerShipPerYear: 6.4 },
    fossil: { capexUsdMPerShip: 70, opexUsdMPerShipPerYear: 5.6 },
  },
  green: {
    fuelId: "e-ammonia",
    sourcing: "build-here",
    buildHere: {
      h3: "8a2d5b1e5a97fff",
      lat: -20.5,
      lon: 118.9,
      evaluated: {
        lcohUsdPerKg: 4.1,
        annualH2Kg: 12_000_000,
        capitalUsd: 480_000_000,
        annualOperatingUsd: 31_000_000,
        lcohDiscountRate: 0.08,
        lcohEngineVersion: "1.4.0",
        plantLifeYears: 25,
      },
      components: {
        h2Capital: component(480, 500),
        h2Operating: component(31, null),
        synthCapital: component(120, null),
        synthOperating: component(9, 8.5),
        logisticsOperating: component(4, null),
      },
      firming: {
        evaluatedDuty: 0.42,
        requiredDuty: 0.9,
        strategy: "firm-ppa",
        strategyOverridden: true,
        capitalUsdM: 0,
        operatingUsdMPerYear: 12,
        emissionsTco2PerYear: 0,
      },
      sizing: {
        nameplateTonnesPerYear: 63_000,
        nameplateMargin: 1.05,
        scaleFactor: 2.1,
        archetype: "foak-dedicated",
        foakMultiplier: 1.3,
        surplusTonnesPerYear: 3_000,
        distanceKm: 210,
      },
    },
    overrides: {
      priceUsdPerTonne: 900,
      combustionEfTco2PerTonne: 0,
      lhvMjPerTonne: 18_600,
      wtwGco2PerMj: 8,
      fuelTonnesPerVesselYear: 5_200,
      prodCapexUsdM: 1_050,
      prodOpexUsdMPerYear: 68,
      portStorageCapexUsdM: 140,
      portStorageOpexUsdMPerYear: 7,
      bargeCapexUsdM: 12,
      bargeOpexUsdMPerYear: 1.5,
    },
    emissions: {
      certifiedWttGco2ePerMj: 12,
      n2oScenarioId: "tested-two-stroke",
      pilotShare: 0.04,
      pilotFuelId: "mgo",
      engineType: "lng-otto-df-medium-speed",
      sulphurPercent: 0.5,
      efficiencyRatio: 1.05,
    },
  },
  fossil: {
    fuelId: "lsfo",
    sourcing: "purchase",
    buildHere: null,
    overrides: {
      priceUsdPerTonne: 640,
      combustionEfTco2PerTonne: 3.114,
      lhvMjPerTonne: 40_200,
      wtwGco2PerMj: 91.16,
      fuelTonnesPerVesselYear: 2_500,
      prodCapexUsdM: null,
      prodOpexUsdMPerYear: null,
      portStorageCapexUsdM: 9,
      portStorageOpexUsdMPerYear: 0.8,
      bargeCapexUsdM: 0,
      bargeOpexUsdMPerYear: 0,
    },
    emissions: {
      certifiedWttGco2ePerMj: null,
      n2oScenarioId: null,
      pilotShare: null,
      pilotFuelId: null,
      engineType: null,
      sulphurPercent: 0.5,
      efficiencyRatio: null,
    },
  },
  regulation: {
    eurUsd: 1.09,
    ets: {
      enabled: true,
      euaEurPerTonne: 85,
      euaEscalation: 0.02,
      scope: 0.5,
      gasCoverage: {
        enabled: true,
        fromCalendarYear: 2026,
        gwpCh4: 28,
        gwpN2o: 265,
        green: { ch4TPerTonne: 0.0001, n2oTPerTonne: 0.00002 },
        fossil: { ch4TPerTonne: 0.00005, n2oTPerTonne: 0.00015 },
      },
    },
    fuelEu: {
      enabled: true,
      penaltyEurPerTonne: 2_400,
      vlsfoMjPerTonne: 41_000,
      baselineGco2PerMj: 91.16,
      scope: 0.5,
      credit: {
        enabled: true,
        surplusValueEurPerTonneVlsfoEq: 1_200,
        rfnbo: true,
        rfnboMultiplier: 2,
        rfnboUntil: 2033,
      },
    },
    ira45z: {
      enabled: true,
      usProduced: true,
      creditUsdPerGallon: 1.05,
      effectiveUntil: 2027,
    },
    selfDesigned: {
      enabled: true,
      co2PriceUsdPerTonne: 280,
      co2PriceEscalation: 0.015,
      supportUsdPerKg: 0.4,
      capexSupport: 0.1,
      opexSupport: 0.05,
      otherUsdM: 2,
    },
    imoNetZero: {
      enabled: true,
      scope: 0.8,
      rewardUsdPerTonneCo2e: 20,
      priceEscalation: 0.01,
    },
    emissions: {
      framework: "imo",
    },
  },
  financing: {
    enabled: true,
    greenRate: 0.055,
    baseRate: 0.08,
    debtShare: 0.7,
    tenorYears: 12,
    structure: "bullet",
  },
  capitalPhasing: {
    enabled: true,
    green: { weights: [0.3, 0.4, 0.3] },
    fossil: { weights: [0.5, 0.5] },
  },
  flags: {
    emissionsBasis: "wellToWake",
    rateBasis: "real",
    legacyExcelConstruct: false,
    migratedVesselBenchmarkBurn: false,
  },
};

describe("scenario JSON round-trip is lossless", () => {
  const clone = () => JSON.parse(JSON.stringify(MAXIMAL)) as unknown;

  it("parseScenarioInput preserves every field, including coordinates", () => {
    const parsed = parseScenarioInput(clone());
    // toEqual is bidirectional: a stripped key AND an injected key both fail.
    expect(parsed).toEqual(MAXIMAL);
  });

  it("the import path (migrate) is byte-identical for a current scenario", () => {
    const migrated = migrateScenarioInput(clone());
    expect(migrated.migratedFrom).toBeNull();
    expect(JSON.parse(JSON.stringify(migrated.input))).toEqual(MAXIMAL);
  });

  it("export shape: stringify of the parsed scenario carries the coords", () => {
    const text = JSON.stringify(parseScenarioInput(clone()));
    for (const needle of [
      '"portACoords"',
      '"portBCoords"',
      '"lat":-20.31',
      '"lon":118.58',
      '"routedDistance"',
      '"financing"',
      '"capitalPhasing"',
      '"imoNetZero"',
      '"buildHere"',
    ]) {
      expect(text).toContain(needle);
    }
  });
});

// ---------------------------------------------------------------------------
// Complete-form export/import: the file always carries EVERY field.
// ---------------------------------------------------------------------------

/** A sparse scenario: no coords, no optional blocks — the complaint case. */
const MINIMAL: ScenarioInput = {
  schemaVersion: 7,
  refBundleId: "2026-07-30-excel-v1",
  cargo: {
    countryId: "australia",
    routeType: "point-to-point",
    oneWayDistanceNm: 3840,
    startYear: 2030,
    horizonYears: 15,
    unitsPerYear: 1_000_000,
    inflation: 0.02,
    vessels: 2,
    roundtripsPerYear: 9,
    waccOverride: null,
  },
  vessel: {
    typeId: "handymax-bulk-58k",
    green: { capexUsdMPerShip: null, opexUsdMPerShipPerYear: null },
    fossil: { capexUsdMPerShip: 70, opexUsdMPerShipPerYear: null },
  },
  green: {
    fuelId: "e-ammonia",
    sourcing: "purchase",
    overrides: { ...MAXIMAL.green.overrides, priceUsdPerTonne: 900 },
  },
  fossil: {
    fuelId: "lsfo",
    sourcing: "purchase",
    overrides: JSON.parse(JSON.stringify(MAXIMAL.fossil.overrides)) as never,
  },
  regulation: JSON.parse(
    JSON.stringify({
      ...MAXIMAL.regulation,
      ets: { enabled: false, euaEurPerTonne: 80, scope: 1 },
      fuelEu: {
        enabled: false,
        penaltyEurPerTonne: 2400,
        vlsfoMjPerTonne: 41000,
        baselineGco2PerMj: 91.16,
        scope: 1,
      },
      ira45z: { enabled: false, usProduced: false, creditUsdPerGallon: 1 },
      selfDesigned: {
        enabled: true,
        co2PriceUsdPerTonne: 280,
        supportUsdPerKg: 0,
        capexSupport: 0,
        opexSupport: 0,
        otherUsdM: 0,
      },
    }),
  ) as never,
};
delete (MINIMAL.regulation as { imoNetZero?: unknown }).imoNetZero;

/** Recursive key-path set (arrays treated as leaves). */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("complete-form export/import — every field always present", () => {
  it("the export of a sparse scenario carries the TEMPLATE's full key set", () => {
    const complete = toCompleteScenarioJson(MINIMAL);
    expect(new Set(keyPaths(complete))).toEqual(new Set(keyPaths(SCENARIO_TEMPLATE)));
    // The complaint case, verbatim: coordinates visible even when unset.
    const c = complete.cargo as { portACoords: unknown; countryBId: unknown };
    expect(c.portACoords).toEqual({ lat: null, lon: null });
    expect(c.countryBId).toBeNull();
  });

  it("a maximal scenario round-trips through the complete form losslessly", () => {
    const back = fromCompleteScenarioJson(toCompleteScenarioJson(MAXIMAL));
    // buildHere: null and absent are the same meaning — the complete form
    // canonicalizes the explicit null to absent.
    const expected = JSON.parse(JSON.stringify(MAXIMAL)) as {
      fossil: { buildHere?: unknown };
    };
    delete expected.fossil.buildHere;
    expect(back).toEqual(expected);
    expect(() => parseScenarioInput(back)).not.toThrow();
  });

  it("a sparse scenario round-trips: skeletons vanish, meaningful nulls stay", () => {
    const back = fromCompleteScenarioJson(toCompleteScenarioJson(MINIMAL)) as ScenarioInput;
    expect(back).toEqual(MINIMAL);
    expect(back.cargo.waccOverride).toBeNull(); // benchmark marker survives
    expect("portACoords" in back.cargo).toBe(false); // skeleton pruned
    expect(() => parseScenarioInput(back)).not.toThrow();
  });

  it("the import path accepts complete files AND legacy partial exports", () => {
    for (const file of [
      toCompleteScenarioJson(MINIMAL),
      JSON.parse(JSON.stringify(MINIMAL)),
      toCompleteScenarioJson(MAXIMAL),
    ]) {
      const migrated = migrateScenarioInput(fromCompleteScenarioJson(file));
      expect(migrated.migratedFrom).toBeNull();
    }
  });
});
