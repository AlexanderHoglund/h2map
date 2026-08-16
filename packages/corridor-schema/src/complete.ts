import type { ScenarioInput } from "./scenario";
import { SCHEMA_VERSION } from "./scenario";

/**
 * The COMPLETE-form scenario JSON — the interchange format of the Export /
 * Import buttons. The exported file always contains EVERY field of the
 * scenario form, populated or not: unset fields are explicit `null`, and
 * optional blocks (port coordinates, financing, phasing, build-here…)
 * expand to full skeletons so the file documents every field that exists.
 *
 * Internal storage stays absent-style (drafts, API saves, the golden
 * fixtures never carry null-filled keys) — `toCompleteScenarioJson`
 * produces the complete form on the way OUT, `fromCompleteScenarioJson`
 * normalizes it away on the way IN, before the strict zod parse. One spec
 * tree drives both directions.
 */

/** Every key required; every leaf may be null (the skeleton's fill). */
type CompleteJson<T> = T extends (infer U)[]
  ? CompleteJson<U>[] | null
  : T extends object
    ? { [K in keyof T]-?: CompleteJson<NonNullable<T[K]>> }
    : T | null;

export type CompleteScenarioJson = CompleteJson<ScenarioInput>;

/**
 * The canonical skeleton: every ScenarioInput key in canonical order,
 * leaves null. `CompleteJson<ScenarioInput>` makes every key REQUIRED —
 * a schema field missing here is a COMPILE error (same guard idea as the
 * round-trip test's DeepRequired literal).
 */
export const SCENARIO_TEMPLATE: CompleteScenarioJson = {
  schemaVersion: SCHEMA_VERSION,
  refBundleId: null,
  cargo: {
    countryId: null,
    countryBId: null,
    portAName: null,
    portACoords: { lat: null, lon: null },
    portBName: null,
    portBCoords: { lat: null, lon: null },
    routeType: null,
    oneWayDistanceNm: null,
    routedDistance: { nm: null, graphVersion: null, via: null },
    startYear: null,
    horizonYears: null,
    unit: null,
    unitWeightTonnes: null,
    unitsPerYear: null,
    vessels: null,
    roundtripsPerYear: null,
    serviceSpeedKn: null,
    portDaysPerRoundTrip: null,
    inflation: null,
    waccOverride: null,
  },
  vessel: {
    typeId: null,
    green: { capexUsdMPerShip: null, opexUsdMPerShipPerYear: null },
    fossil: { capexUsdMPerShip: null, opexUsdMPerShipPerYear: null },
  },
  green: sideTemplate(),
  fossil: sideTemplate(),
  regulation: {
    eurUsd: null,
    ets: {
      enabled: null,
      euaEurPerTonne: null,
      euaEscalation: null,
      scope: null,
      gasCoverage: {
        enabled: null,
        fromCalendarYear: null,
        gwpCh4: null,
        gwpN2o: null,
        green: { ch4TPerTonne: null, n2oTPerTonne: null },
        fossil: { ch4TPerTonne: null, n2oTPerTonne: null },
      },
    },
    fuelEu: {
      enabled: null,
      penaltyEurPerTonne: null,
      vlsfoMjPerTonne: null,
      baselineGco2PerMj: null,
      scope: null,
      credit: {
        enabled: null,
        surplusValueEurPerTonneVlsfoEq: null,
        rfnbo: null,
        rfnboMultiplier: null,
        rfnboUntil: null,
      },
    },
    ira45z: {
      enabled: null,
      usProduced: null,
      creditUsdPerGallon: null,
      effectiveUntil: null,
    },
    selfDesigned: {
      enabled: null,
      co2PriceUsdPerTonne: null,
      co2PriceEscalation: null,
      supportUsdPerKg: null,
      capexSupport: null,
      opexSupport: null,
      otherUsdM: null,
    },
    imoNetZero: {
      enabled: null,
      scope: null,
      rewardUsdPerTonneCo2e: null,
      priceEscalation: null,
    },
    emissions: {
      framework: null,
    },
  },
  financing: {
    enabled: null,
    greenRate: null,
    baseRate: null,
    debtShare: null,
    tenorYears: null,
    structure: null,
  },
  commercial: {
    willingnessToPayUsdPerTonneCo2: null,
  },
  capitalPhasing: {
    enabled: null,
    green: { weights: null },
    fossil: { weights: null },
  },
  flags: {
    emissionsBasis: null,
    rateBasis: null,
    legacyExcelConstruct: null,
    migratedVesselBenchmarkBurn: null,
    fossilFleetBasis: null,
  },
};

function sideTemplate(): CompleteJson<ScenarioInput["green"]> {
  const comp = () => ({ derivedUsdM: null, overrideUsdM: null });
  return {
    fuelId: null,
    sourcing: null,
    buildHere: {
      h3: null,
      lat: null,
      lon: null,
      evaluated: {
        lcohUsdPerKg: null,
        annualH2Kg: null,
        capitalUsd: null,
        annualOperatingUsd: null,
        lcohDiscountRate: null,
        lcohEngineVersion: null,
        plantLifeYears: null,
      },
      components: {
        h2Capital: comp(),
        h2Operating: comp(),
        synthCapital: comp(),
        synthOperating: comp(),
        logisticsOperating: comp(),
      },
      firming: {
        evaluatedDuty: null,
        requiredDuty: null,
        strategy: null,
        strategyOverridden: null,
        capitalUsdM: null,
        operatingUsdMPerYear: null,
        emissionsTco2PerYear: null,
      },
      sizing: {
        nameplateTonnesPerYear: null,
        nameplateMargin: null,
        scaleFactor: null,
        archetype: null,
        foakMultiplier: null,
        surplusTonnesPerYear: null,
        distanceKm: null,
      },
    },
    overrides: {
      priceUsdPerTonne: null,
      combustionEfTco2PerTonne: null,
      lhvMjPerTonne: null,
      wtwGco2PerMj: null,
      fuelTonnesPerVesselYear: null,
      prodCapexUsdM: null,
      prodOpexUsdMPerYear: null,
      portStorageCapexUsdM: null,
      portStorageOpexUsdMPerYear: null,
      bargeCapexUsdM: null,
      bargeOpexUsdMPerYear: null,
    },
    emissions: {
      certifiedWttGco2ePerMj: null,
      n2oScenarioId: null,
      pilotShare: null,
      pilotFuelId: null,
      engineType: null,
      sulphurPercent: null,
      efficiencyRatio: null,
    },
  };
}

/**
 * Paths where `null` is a LEGAL STORED VALUE (benchmark markers, explicit
 * "no site", "no sunset"). Import keeps these nulls; everywhere else a
 * null means "field not set" and is pruned back to absent. Path segments:
 * literal key, `*` = any key.
 */
const KEEP_NULL_PATHS: string[][] = [
  ["cargo", "waccOverride"],
  ["cargo", "routedDistance", "via"],
  ["vessel", "*", "capexUsdMPerShip"],
  ["vessel", "*", "opexUsdMPerShipPerYear"],
  ["green", "overrides", "*"],
  ["fossil", "overrides", "*"],
  ["green", "buildHere"],
  ["fossil", "buildHere"],
  ["green", "buildHere", "firming"],
  ["fossil", "buildHere", "firming"],
  ["green", "buildHere", "components", "*", "overrideUsdM"],
  ["fossil", "buildHere", "components", "*", "overrideUsdM"],
  // v6 refined-emissions inputs: null = "use the dataset default", a
  // meaningful stored value exactly like the factor overrides above.
  ["green", "emissions", "*"],
  ["fossil", "emissions", "*"],
  // NOT ira45z.effectiveUntil: null and absent both mean "no sunset", so
  // the complete form canonicalizes the null to absent.
];

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Export: deep-merge the scenario over the template — template key order
 * wins (a canonical, stable file layout); scenario values fill in;
 * everything the scenario does not carry stays null.
 */
export function toCompleteScenarioJson(scenario: ScenarioInput): CompleteScenarioJson {
  const merge = (tmpl: unknown, value: unknown): unknown => {
    if (isPlainObject(tmpl)) {
      const src = isPlainObject(value) ? value : {};
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(tmpl)) {
        out[key] = merge(tmpl[key], src[key]);
      }
      // Forward-compat: keys the template does not know yet still export.
      for (const key of Object.keys(src)) {
        if (!(key in out)) out[key] = src[key];
      }
      return out;
    }
    return value === undefined ? tmpl : value;
  };
  return merge(
    SCENARIO_TEMPLATE,
    JSON.parse(JSON.stringify(scenario)),
  ) as CompleteScenarioJson;
}

/**
 * Subtrees where ABSENCE is legal (optional blocks). On import, such a
 * subtree whose every leaf is null is a skeleton, not data — it prunes to
 * absent. A partially-filled optional subtree is kept and the strict parse
 * reports what is missing, loudly.
 */
const OPTIONAL_SUBTREES: string[][] = [
  ["cargo", "portACoords"],
  ["cargo", "portBCoords"],
  ["cargo", "routedDistance"],
  ["regulation", "ets", "gasCoverage"],
  ["regulation", "fuelEu", "credit"],
  ["regulation", "imoNetZero"],
  ["regulation", "emissions"],
  ["green", "emissions"],
  ["fossil", "emissions"],
  ["financing"],
  ["commercial"],
  ["capitalPhasing"],
  ["flags"],
  ["green", "buildHere"],
  ["fossil", "buildHere"],
  ["green", "buildHere", "firming"],
  ["fossil", "buildHere", "firming"],
];

const matchesPath = (patterns: string[][], path: string[]): boolean =>
  patterns.some(
    (p) =>
      p.length === path.length &&
      p.every((seg, i) => seg === "*" || seg === path[i]),
  );

const allLeavesNull = (value: unknown): boolean => {
  if (value === null) return true;
  if (isPlainObject(value)) return Object.values(value).every(allLeavesNull);
  return false; // a scalar, array or anything concrete is data
};

/**
 * Import: prune the complete form back to the internal absent-style shape.
 * Null leaves vanish unless their path is in KEEP_NULL_PATHS; optional
 * subtrees that are pure skeletons (every leaf null) vanish whole. The
 * result feeds migrateScenarioInput → the strict zod parse. Files that
 * never had null-filled keys (old exports) pass through unchanged. Note:
 * an explicitly-null nullable block (e.g. `buildHere: null`) canonicalizes
 * to ABSENT — the two spellings mean the same thing everywhere.
 */
export function fromCompleteScenarioJson(json: unknown): unknown {
  const prune = (value: unknown, path: string[]): unknown => {
    if (value === null) return matchesPath(KEEP_NULL_PATHS, path) ? null : undefined;
    if (Array.isArray(value) || !isPlainObject(value)) return value;
    if (matchesPath(OPTIONAL_SUBTREES, path) && allLeavesNull(value)) {
      return undefined;
    }
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      const pruned = prune(v, [...path, key]);
      if (pruned !== undefined) out[key] = pruned;
    }
    return out;
  };
  return prune(json, []) ?? {};
}
