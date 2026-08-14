import { migrateScenarioInput, type ScenarioInput } from "@h2map/corridor-schema";
import fixtureDefaults from "../../../../fixtures/golden/corridor/excel-baseline.input.json";

/**
 * Pure scenario builders — shared by the client model (state.ts) and the
 * server (the starter-project seed route). NO "use client", no React.
 */

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
 * - emissions basis well-to-wake. v6: factors DERIVE from the refined
 *   fuel-emissions method (FuelEU accounting by default) — the study's
 *   WtW=0/91.16 treatment is preserved as the LEGACY calibration only
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
    portBCoords: { lat: 35.45, lon: 139.65 }, // [D] Yokohama proxy (Pub. 151)
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
      fuelTonnesPerVesselYear: 5700, // [D] 57,015 t/yr fleet ÷ 10
      // v6: emission factors DERIVE from the fuel-emissions method
      // (certified 15 + N2O slip + 5% pilot → blend 22.14 under FuelEU).
      // The study's implied WtW=0 treatment survives as the documented
      // legacy calibration (chileStudyCalibrationInput / docs).
      lhvMjPerTonne: null,
      combustionEfTco2PerTonne: null,
      wtwGco2PerMj: null,
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
      // v6: derived — Annex II HFO row (91.744 / 3.169 CO2e / 40,500).
      lhvMjPerTonne: null,
      combustionEfTco2PerTonne: null,
      wtwGco2PerMj: null,
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
export function clearOverrides(s: ScenarioInput): ScenarioInput {
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

/**
 * The empty starter project (projects-first UX, 2026-08-11): every override
 * on its benchmark, every regulation module off, and NEUTRAL identity —
 * generic country, unnamed ports, round placeholder numbers. It must still
 * compute (the results rail is always live), so it is a starting point, not
 * a null form.
 */
export function emptyScenario(): ScenarioInput {
  const input = clearOverrides(defaultScenario());
  // Simplified projects are purchase-only (the sourcing selector is a
  // Standard capability) — the starter must be expressible in Simplified.
  input.green.sourcing = "purchase";
  input.cargo = {
    ...input.cargo,
    countryId: "other",
    countryBId: "other",
    portAName: "",
    portBName: "",
    routeType: "point-to-point",
    oneWayDistanceNm: 5000,
    startYear: 2030,
    horizonYears: 15,
    unit: "tonne",
    unitWeightTonnes: 1,
    unitsPerYear: 1_000_000,
    vessels: 5,
    roundtripsPerYear: 10,
    inflation: 0.02,
  };
  delete input.cargo.portACoords;
  delete input.cargo.portBCoords;
  delete input.cargo.routedDistance;
  input.regulation.selfDesigned = {
    ...input.regulation.selfDesigned,
    enabled: false,
  };
  return input;
}
