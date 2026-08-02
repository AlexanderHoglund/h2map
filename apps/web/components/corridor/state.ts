"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  migrateScenarioInput,
  parseRefBundle,
  resolveScenario,
  type RefBundle,
  type ResolvedScenario,
  type ScenarioInput,
} from "@h2map/corridor-schema";
import {
  capitalRecoveryFactor,
  evaluateScenario,
  logisticsLeg,
  resolveFirming,
  synthesizePlant,
} from "@h2map/corridor-engine";
import { getSynthesisBenchmark } from "@h2map/corridor-schema";
import { ENGINE_VERSION as LCOH_ENGINE_VERSION } from "@h2map/lcoh-engine";
import type { ScenarioResult } from "@h2map/corridor-schema";
import bundleJson from "../../../../data/corridor-ref/2026-07-30-excel-v1.json";
import fixtureDefaults from "../../../../fixtures/golden/corridor/excel-baseline.input.json";
import uiManifest from "../../../../data/corridor-sensitivity/ui-manifest.json";

/**
 * Corridor model state. The engine is pure and fast (a 20-year scenario is
 * microseconds), so the FULL evaluation runs synchronously on every change —
 * the results panel updates on keystroke, no server round-trip.
 *
 * Defaults ARE the frozen golden fixture input, so the untouched form
 * reproduces the workbook's numbers exactly (Phase 3 acceptance).
 */

export const DEFAULT_BUNDLE: RefBundle = parseRefBundle(bundleJson);

/** Sensitivity-driven field prominence (build-plan 3.2): id → advanced? */
const ADVANCED = new Set<string>((uiManifest as { advanced: string[] }).advanced);
export function isAdvanced(paramId: string): boolean {
  return ADVANCED.has(paramId);
}

/** The workbook-default scenario (the frozen golden fixture, migrated). */
export function workbookScenario(): ScenarioInput {
  return migrateScenarioInput(JSON.parse(JSON.stringify(fixtureDefaults))).input;
}

/**
 * APP DEFAULT: the Chilean copper-concentrate green corridor — populated
 * from "Chilean Green Corridors — Copper Concentrate Export" (MMMCZCS,
 * 11 Sep 2025; consortium: Sumitomo, Interacid, NYK, Codelco, MMMCZCS).
 * Mejillones → Japan/South Korea, 25 Mt concentrate over 15 years, 10
 * ammonia dual-fuel Handymax bulkers, 60 kt/yr green ammonia from 2030.
 *
 * Provenance per field: stated [S], derived [D], fitted to the study's
 * published totals [F], or assumption [A] — see the documentation's
 * default-scenario section. Key modelling choices:
 * - vessel-benchmark consumption with per-side tonnage overrides (the
 *   study's tonnages; distance-derived GJ/nm would encode an unstated
 *   slow-steaming assumption)
 * - green merchant price OVERRIDDEN TO 0: the study costs the plant as
 *   CAPEX/OPEX with no merchant fuel price (the corrected construct
 *   accounting — no workbook double count)
 * - EU ETS / FuelEU / 45Z all OFF (no EEA leg; Chilean production);
 *   self-designed regulation proxies the IMO Net-Zero Framework at
 *   $280/tCO2 (study's $250m regulatory benefit, TTW-priced here)
 * - emissions basis well-to-wake (the study's implied treatment: green
 *   NH3 at 0, LSFO at 91.16 gCO2e/MJ reproduces its 1.45 Mt exactly)
 *
 * The workbook-default scenario remains available via workbookScenario()
 * and the frozen golden fixture keeps pinning the engine.
 */
export function defaultScenario(): ScenarioInput {
  const input = workbookScenario();

  input.cargo = {
    ...input.cargo,
    countryId: "chile", // [S]
    countryBId: "japan", // [S]
    portAName: "Mejillones",
    portACoords: { lat: -23.1, lon: -70.45 }, // [S]
    portBName: "Japan (Asia)", // [S] study does not name the discharge port
    routeType: "point-to-point", // [S]
    oneWayDistanceNm: 9500, // [D] great-circle 9,072 nm + 5% routing
    startYear: 2030, // [S]
    horizonYears: 15, // [S]
    unit: "tonne", // [S]
    unitWeightTonnes: 1,
    unitsPerYear: 1_650_000, // [S] 1.65 Mt/yr × 15 ≈ 25 Mt
    vessels: 10, // [S]
    roundtripsPerYear: 3, // [S] 165 kt/vessel/yr ÷ 55 kt/voyage
    inflation: 0.02, // [A]
    waccOverride: 0.08, // [F] base rate implied by the financing benefit
  };

  input.vessel = {
    typeId: "handymax-bulk-58k", // [S]
    consumptionMode: "vessel-benchmark", // tonnages entered directly (§6)
    // FLEET totals — the workbook's vessel capex/opex cells are per-fleet
    // (the vessel count multiplies fuel & regulation only): 10 × $44m,
    // 10 × $3.2m/yr ([F], ~25% NH3 dual-fuel premium on a $35m Handymax).
    green: { capexUsdM: 440, opexUsdMPerYear: 32 },
    // [F] NOT zero — the study costs a fossil NEWBUILD fleet, unlike the
    // workbook's retrofit-an-existing-fleet default. 10 × $35m, 10 × $2.8m.
    fossil: { capexUsdM: 350, opexUsdMPerYear: 28 },
  };

  input.green = {
    ...input.green,
    fuelId: "e-ammonia", // [S]
    // v3: build-plant — production CAPEX + OPEX, no merchant price (the
    // mode the study actually uses; no price-0 workaround needed).
    sourcing: "build-plant", // [S] purpose-built plant
    overrides: {
      ...input.green.overrides,
      priceUsdPerTonne: null,
      fuelTonnesPerVesselYear: 5700, // [D] 57,015 t/yr fleet ÷ 10 (pins 1.45 Mt)
      lhvMjPerTonne: 18600,
      combustionEfTco2PerTonne: 0, // [S]
      wtwGco2PerMj: 0, // [D] the study's implied treatment (real RFNBO: 5–15)
      prodCapexUsdM: 1100, // [F] 60 kt/yr plant, no economies of scale
      prodOpexUsdMPerYear: 72, // [F] incl. PPA electricity for 24/7 Haber-Bosch
      portStorageCapexUsdM: 150, // [F] tanks, refrigeration, pumping, jetty
      portStorageOpexUsdMPerYear: 8, // [F]
      bargeCapexUsdM: 0, // [S] jetty-side bunkering at 500 t/h — no barge
      bargeOpexUsdMPerYear: 0, // [S]
    },
  };

  input.fossil = {
    ...input.fossil,
    fuelId: "lsfo", // [S]
    sourcing: "purchase",
    overrides: {
      ...input.fossil.overrides,
      priceUsdPerTonne: 650, // [F]
      fuelTonnesPerVesselYear: 2638, // [D] energy-matched to the NH3 fleet
      lhvMjPerTonne: 40200,
      combustionEfTco2PerTonne: 3.114, // [A]
      wtwGco2PerMj: 91.16, // [D] reproduces the study's 1.45 Mt exactly
      prodCapexUsdM: null, // purchase forces 0
      prodOpexUsdMPerYear: null,
      portStorageCapexUsdM: 10, // [F] existing bunkering infrastructure
      portStorageOpexUsdMPerYear: 1, // [F]
      bargeCapexUsdM: 0,
      bargeOpexUsdMPerYear: 0,
    },
  };

  // Chile → Japan touches no EEA port: ETS, FuelEU and 45Z are all inert.
  // Self-designed proxies the IMO Net-Zero Framework (the one scheme that
  // WOULD apply; a first-class module is the known regulatory gap).
  input.regulation.ets.enabled = false;
  input.regulation.fuelEu.enabled = false;
  input.regulation.ira45z.enabled = false;
  input.regulation.ira45z.usProduced = false;
  input.regulation.selfDesigned = {
    ...input.regulation.selfDesigned,
    enabled: true,
    co2PriceUsdPerTonne: 280, // [F] calibrated to the study's ~$250m benefit
    supportUsdPerKg: 0,
    capexSupport: 0,
    opexSupport: 0,
    otherUsdM: 0,
  };

  // WTW is required to reproduce the study (§6 of its write-up): combustion
  // basis lands 15% low. The engine's flag-absent default stays combustion
  // (= Excel), which keeps the frozen golden fixture exact.
  input.flags = { emissionsBasis: "wellToWake", rateBasis: "nominal" };
  return input;
}

/** Null every override so the resolution yields pure benchmark values. */
function clearOverrides(s: ScenarioInput): ScenarioInput {
  const c = JSON.parse(JSON.stringify(s)) as ScenarioInput;
  c.cargo.waccOverride = null;
  c.vessel.green = { capexUsdM: null, opexUsdMPerYear: null };
  c.vessel.fossil = { capexUsdM: null, opexUsdMPerYear: null };
  for (const side of [c.green, c.fossil]) {
    for (const k of Object.keys(side.overrides) as (keyof typeof side.overrides)[]) {
      side.overrides[k] = null;
    }
  }
  return c;
}

// v2: the default scenario changed to the Chilean copper corridor — old
// v1 drafts (the workbook defaults) would shadow it on load, so the key
// is versioned. The v1 entry stays in storage untouched.
const DRAFT_KEY = "corridor-draft-v2";

/**
 * A production-site pick — the FULL evaluation hand-back (spec: the tile
 * value never enters the calculation; evaluate-here is the only path).
 */
export interface SitePickPayload {
  h3: string;
  lat: number;
  lon: number;
  lcoh: number;
  costStructure: {
    capitalUsd: number;
    annualOperatingUsd: number;
    annualH2Kg: number;
    discountRate: number;
    plantLifeYears: number;
  };
  /** Duty cycle the evaluated configuration achieves (0-1). */
  dutyCycle: number;
  lcohEngineVersion: string;
}

export { LCOH_ENGINE_VERSION };

/** Default plant sizing margin over corridor demand (57 kt → ~60 kt). */
const NAMEPLATE_MARGIN = 1.05;
const FALLBACK_DISTANCE_KM = 300;
/** Road/rail winding allowance over great-circle (engine default, mirrored). */
const ROUTE_FACTOR = 1.3;

/**
 * Firm-power reference values (realism pass, Task 2). Reference data, not
 * user inputs — the ONE user-facing control is which strategy to use.
 *
 * The firm multiplier is the step from solar-shaped to round-the-clock
 * supply: northern-Chile utility-scale solar LCOE is under $35/MWh and the
 * 2023 tender cleared $56.6/MWh, while Codelco's round-the-clock requirement
 * had to be met with solar-plus-battery — so ~1.9x (≈$32 shaped → ≈$60 firm).
 */
const FIRM_PRICE_MULTIPLIER = 1.9;
/** Shaped (daytime solar) electricity price the evaluated LCOH pays, $/MWh. */
const SHAPED_ELECTRICITY_USD_PER_MWH = 32;
/** Grid price for the hybrid strategy, $/MWh. */
const GRID_USD_PER_MWH = 70;
/** Grid emission factor for the hybrid strategy, tCO2/MWh (Chilean SEN). */
const GRID_EF_TCO2_PER_MWH = 0.35;
/** H2 buffer storage capital, $/kg of storage capacity. */
const BUFFER_CAPEX_USD_PER_KG_H2 = 500;
/** Electrolyser energy intensity for firming sizing, MWh per tonne of H2. */
const MWH_PER_TONNE_H2 = 55.6;

/**
 * Apply a map site pick: switch the green side to build-here with a delivered
 * price derived from the cell's LCOH via carrier synthesis + default
 * logistics. The user refines config in the Fuel step's build-here panel.
 */
function applyPickToScenario(
  scenario: ScenarioInput,
  pick: SitePickPayload,
): ScenarioInput {
  if (!pick.h3 || !pick.costStructure || pick.costStructure.annualH2Kg <= 0) {
    return scenario;
  }
  const next = JSON.parse(JSON.stringify(scenario)) as ScenarioInput;
  // Ensure a synthesizable carrier (fall back to the workbook's e-ammonia).
  let carrier;
  try {
    carrier = getSynthesisBenchmark(next.green.fuelId);
  } catch {
    next.green.fuelId = "e-ammonia";
    carrier = getSynthesisBenchmark("e-ammonia");
  }

  // Corridor demand from the RESOLVED green tonnage (benchmark/derived when
  // not overridden) — the plant is sized to the corridor, not to the tile.
  let demandTonnesPerYear: number;
  let resolved: ReturnType<typeof resolveScenario>;
  try {
    // The scenario may already be in build-here-without-a-site (the user
    // just selected the mode) — resolve the demand on a sizing pass with
    // the green side temporarily downgraded to build-plant.
    const sizing = JSON.parse(JSON.stringify(next)) as ScenarioInput;
    sizing.green.sourcing = "build-plant";
    sizing.green.buildHere = null;
    resolved = resolveScenario(sizing, DEFAULT_BUNDLE);
    demandTonnesPerYear = resolved.vessels * resolved.green.tonnesPerVesselYear.value;
  } catch {
    return scenario; // unresolvable scenario — leave untouched
  }
  const nameplate = demandTonnesPerYear * NAMEPLATE_MARGIN;

  // H2 block: LCOH cost structure scaled LINEARLY to the required H2
  // (electrolysers/renewables are ~linear in capacity — spec §3).
  const requiredH2Kg = nameplate * carrier.tH2PerTonne * 1000;
  const k = requiredH2Kg / pick.costStructure.annualH2Kg;
  const h2CapitalUsdM = (pick.costStructure.capitalUsd * k) / 1e6;
  const h2OperatingUsdM = (pick.costStructure.annualOperatingUsd * k) / 1e6;

  // Synthesis block: dedicated plant at the corridor's nameplate,
  // scale-corrected (spec §3).
  const synth = synthesizePlant(carrier, {
    productionWacc: 0.08,
    electricityUsdPerMwh: 60,
    co2UsdPerTonne: 30,
    nameplateTonnesPerYear: nameplate,
  });

  // Logistics: plant→port from coordinates when the port is pinned.
  // INLAND first-mile rate, not the deep-sea shipping rate: this leg is
  // plant -> bunker port (road/rail/short pipeline), ~10x the sea rate.
  const port = next.cargo.portACoords;
  const legRate = carrier.inlandUsdPerTonneKm;
  const leg = port
    ? logisticsLeg(
        { lat: pick.lat, lon: pick.lon },
        port,
        legRate,
        demandTonnesPerYear,
      )
    : {
        distanceKm: FALLBACK_DISTANCE_KM,
        perTonne: FALLBACK_DISTANCE_KM * ROUTE_FACTOR * legRate,
        annualOperatingUsd:
          FALLBACK_DISTANCE_KM * ROUTE_FACTOR * legRate * demandTonnesPerYear,
      };

  // Firm power: can this site physically feed the carrier's synthesis loop?
  // The corridor prices the cheapest resolution rather than silently
  // producing a carrier the plant could not make.
  const requiredDuty = carrier.firmnessRequirement;
  const corridorWacc = resolved.wacc.value;
  const firmingResult = resolveFirming(
    {
      evaluatedDuty: pick.dutyCycle,
      requiredDuty,
      h2CapitalUsd: h2CapitalUsdM * 1e6,
      h2OperatingUsd: h2OperatingUsdM * 1e6,
      shapedElectricityUsdPerMwh: SHAPED_ELECTRICITY_USD_PER_MWH,
      firmPriceMultiplier: FIRM_PRICE_MULTIPLIER,
      annualElectricityMwh: (requiredH2Kg / 1000) * MWH_PER_TONNE_H2,
      gridUsdPerMwh: GRID_USD_PER_MWH,
      gridEmissionFactorTco2PerMwh: GRID_EF_TCO2_PER_MWH,
      bufferCapexUsdPerKgH2: BUFFER_CAPEX_USD_PER_KG_H2,
      annualH2Kg: requiredH2Kg,
    },
    (capitalUsd) =>
      capitalUsd * capitalRecoveryFactor(corridorWacc, pick.costStructure.plantLifeYears),
  );

  const r2 = (n: number) => Math.round(n * 100) / 100;
  next.green.sourcing = "build-here";
  next.green.buildHere = {
    h3: pick.h3,
    lat: pick.lat,
    lon: pick.lon,
    evaluated: {
      lcohUsdPerKg: pick.lcoh,
      annualH2Kg: pick.costStructure.annualH2Kg,
      capitalUsd: pick.costStructure.capitalUsd,
      annualOperatingUsd: pick.costStructure.annualOperatingUsd,
      lcohDiscountRate: pick.costStructure.discountRate,
      lcohEngineVersion: pick.lcohEngineVersion,
      plantLifeYears: pick.costStructure.plantLifeYears,
    },
    components: {
      h2Capital: { derivedUsdM: r2(h2CapitalUsdM), overrideUsdM: null },
      h2Operating: { derivedUsdM: r2(h2OperatingUsdM), overrideUsdM: null },
      synthCapital: { derivedUsdM: r2(synth.capitalUsd / 1e6), overrideUsdM: null },
      synthOperating: { derivedUsdM: r2(synth.annualOperatingUsd / 1e6), overrideUsdM: null },
      logisticsOperating: { derivedUsdM: r2(leg.annualOperatingUsd / 1e6), overrideUsdM: null },
    },
    firming: firmingResult.chosen
      ? {
          evaluatedDuty: Math.round(firmingResult.evaluatedDuty * 10000) / 10000,
          requiredDuty,
          strategy: firmingResult.chosen.strategy,
          strategyOverridden: false,
          capitalUsdM: r2(firmingResult.chosen.capitalUsd / 1e6),
          operatingUsdMPerYear: r2(firmingResult.chosen.operatingUsdPerYear / 1e6),
          emissionsTco2PerYear: Math.round(firmingResult.chosen.emissionsTco2PerYear),
        }
      : null,
    sizing: {
      nameplateTonnesPerYear: Math.round(nameplate),
      nameplateMargin: NAMEPLATE_MARGIN,
      scaleFactor: Math.round(synth.scaleFactor * 100) / 100,
      foakMultiplier: 1,
      surplusTonnesPerYear: Math.round(nameplate - demandTonnesPerYear),
      distanceKm: Math.round(leg.distanceKm),
    },
  };
  return next;
}


export interface CorridorModel {
  bundle: RefBundle;
  scenario: ScenarioInput;
  /** Mutate a deep clone; the model re-evaluates synchronously. */
  update: (mutate: (draft: ScenarioInput) => void) => void;
  reset: () => void;
  /** Replace the whole draft (loading a saved/shared scenario). */
  load: (payload: unknown) => void;
  /** Use a map cell as the green production site (build-here). */
  pickSite: (pick: SitePickPayload) => void;
  resolved: ResolvedScenario | null;
  /** Benchmark-only resolution (all overrides null) for "benchmark: X — restore". */
  benchmarks: ResolvedScenario | null;
  result: ScenarioResult | null;
  /** Human-readable reason when the scenario cannot evaluate. */
  error: string | null;
  hadDraft: boolean;
}

export function useCorridorModel(): CorridorModel {
  // Lazy init restores the local draft synchronously — this hook only runs in
  // the ssr:false corridor island, so localStorage is always available.
  // Account save/share is scenario management (3.5).
  const [init] = useState<{ scenario: ScenarioInput; hadDraft: boolean }>(() => {
    let base: { scenario: ScenarioInput; hadDraft: boolean } | null = null;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) base = { scenario: migrateScenarioInput(JSON.parse(raw)).input, hadDraft: true };
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
    base ??= { scenario: defaultScenario(), hadDraft: false };
    return base;
  });
  const [scenario, setScenario] = useState<ScenarioInput>(init.scenario);

  // Debounced draft autosave.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(scenario));
      } catch {
        /* storage full/blocked — drafts are best-effort */
      }
    }, 400);
    return () => clearTimeout(id);
  }, [scenario]);

  const update = useCallback((mutate: (draft: ScenarioInput) => void) => {
    setScenario((prev) => {
      const draft = JSON.parse(JSON.stringify(prev)) as ScenarioInput;
      mutate(draft);
      return draft;
    });
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
    setScenario(defaultScenario());
  }, []);

  /** Replace the whole draft (loading a saved/shared scenario). Validates. */
  const load = useCallback((payload: unknown) => {
    setScenario(migrateScenarioInput(payload).input);
  }, []);

  const pickSite = useCallback((pick: SitePickPayload) => {
    setScenario((prev) => applyPickToScenario(prev, pick));
  }, []);

  const evaluated = useMemo(() => {
    try {
      const resolved = resolveScenario(scenario, DEFAULT_BUNDLE);
      const benchmarks = resolveScenario(clearOverrides(scenario), DEFAULT_BUNDLE);
      return { resolved, benchmarks, result: evaluateScenario(resolved), error: null };
    } catch (err) {
      // Form-support fallback: build-here without a picked site cannot
      // evaluate (no numbers are shown), but the FORM must stay alive so
      // the user can pick — resolve with the site-less side downgraded to
      // build-plant for field display only.
      try {
        const fallback = JSON.parse(JSON.stringify(scenario)) as ScenarioInput;
        for (const side of [fallback.green, fallback.fossil]) {
          if (side.sourcing === "build-here" && !side.buildHere) {
            side.sourcing = "build-plant";
          }
        }
        const resolved = resolveScenario(fallback, DEFAULT_BUNDLE);
        const benchmarks = resolveScenario(clearOverrides(fallback), DEFAULT_BUNDLE);
        return {
          resolved,
          benchmarks,
          result: null,
          error: err instanceof Error ? err.message : String(err),
        };
      } catch {
        return {
          resolved: null,
          benchmarks: null,
          result: null,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
  }, [scenario]);

  return {
    bundle: DEFAULT_BUNDLE,
    scenario,
    update,
    reset,
    load,
    pickSite,
    ...evaluated,
    hadDraft: init.hadDraft,
  };
}
