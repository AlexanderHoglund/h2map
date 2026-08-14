/**
 * The Chilean copper-corridor reference scenario for engine tests —
 * mirrors the app's default (`apps/web/components/corridor/state.ts
 * defaultScenario()`): "Chilean Green Corridors — Copper Concentrate
 * Export" (MMMCZCS, 11 Sep 2025). Mejillones → Japan, 10 NH3 dual-fuel
 * Handymax (fleet-total vessel costs), 15 years from 2030, e-ammonia
 * Construct (merchant price overridden to 0) vs LSFO Purchase, EU ETS /
 * FuelEU / 45Z disabled, self-designed CO2 price $280/t as the IMO
 * Net-Zero proxy.
 *
 * Published totals this reproduces (validated 2026-07-31): green PV
 * $2,850.66m (study $2,850m), fossil ex-regulation $838.22m ($850m),
 * pre-regulation gap $2,012.44m ($2,000m), WTW CO2 abated 1,450,095 t
 * (1.45 Mt exact).
 */

import type { ScenarioInput } from "@h2map/corridor-schema";
import { migrateScenarioInput } from "@h2map/corridor-schema";
import { loadFixtureJson } from "../golden/loader";

export function chileReferenceInput(
  emissionsBasis: "combustion" | "wellToWake" = "wellToWake",
): ScenarioInput {
  const input = migrateScenarioInput(
    JSON.parse(JSON.stringify(loadFixtureJson("excel-baseline.input.json"))),
  ).input;

  input.cargo = {
    ...input.cargo,
    countryId: "chile",
    countryBId: "japan",
    portAName: "Mejillones",
    portACoords: { lat: -23.1, lon: -70.45 },
    portBName: "Japan (Asia)",
    routeType: "point-to-point",
    oneWayDistanceNm: 9500,
    startYear: 2030,
    horizonYears: 15,
    unit: "tonne",
    unitWeightTonnes: 1,
    unitsPerYear: 1_650_000,
    vessels: 10,
    roundtripsPerYear: 3,
    inflation: 0.02,
    waccOverride: 0.08,
  };

  input.vessel = {
    typeId: "handymax-bulk-58k",
    consumptionMode: "vessel-benchmark",
    green: { capexUsdM: 440, opexUsdMPerYear: 32 },
    fossil: { capexUsdM: 350, opexUsdMPerYear: 28 },
  };

  input.green = {
    ...input.green,
    fuelId: "e-ammonia",
    sourcing: "build-plant", // v3: CAPEX+OPEX, no merchant price
    overrides: {
      ...input.green.overrides,
      priceUsdPerTonne: null,
      fuelTonnesPerVesselYear: 5700,
      lhvMjPerTonne: null,
      combustionEfTco2PerTonne: null,
      wtwGco2PerMj: null,
      prodCapexUsdM: 1100,
      prodOpexUsdMPerYear: 72,
      portStorageCapexUsdM: 150,
      portStorageOpexUsdMPerYear: 8,
      bargeCapexUsdM: 0,
      bargeOpexUsdMPerYear: 0,
    },
  };

  input.fossil = {
    ...input.fossil,
    fuelId: "lsfo",
    sourcing: "purchase",
    overrides: {
      ...input.fossil.overrides,
      priceUsdPerTonne: 650,
      fuelTonnesPerVesselYear: 2638,
      lhvMjPerTonne: null,
      combustionEfTco2PerTonne: null,
      wtwGco2PerMj: null,
      prodCapexUsdM: null,
      prodOpexUsdMPerYear: null,
      portStorageCapexUsdM: 10,
      portStorageOpexUsdMPerYear: 1,
      bargeCapexUsdM: 0,
      bargeOpexUsdMPerYear: 0,
    },
  };

  input.regulation.ets.enabled = false;
  input.regulation.fuelEu.enabled = false;
  input.regulation.ira45z.enabled = false;
  input.regulation.ira45z.usProduced = false;
  input.regulation.selfDesigned = {
    ...input.regulation.selfDesigned,
    enabled: true,
    co2PriceUsdPerTonne: 280,
    supportUsdPerKg: 0,
    capexSupport: 0,
    opexSupport: 0,
    otherUsdM: 0,
  };

  input.flags = { emissionsBasis, rateBasis: "nominal" };
  return input;
}

/**
 * The STUDY CALIBRATION variant (legacy factors): explicit overrides
 * reproduce the MMMCZCS study's published totals forever — WtW=0 green
 * ammonia (the study's implied treatment; not certifiable under the
 * refined method) against 91.16, on the legacy scalar path. This is the
 * permanent pin for $1,762.21m / 1,450,095 t / $250.23m.
 */
export function chileStudyCalibrationInput(
  emissionsBasis: "combustion" | "wellToWake" = "wellToWake",
): ScenarioInput {
  const input = chileReferenceInput(emissionsBasis);
  delete input.regulation.emissions;
  input.green.overrides.lhvMjPerTonne = 18600;
  input.green.overrides.combustionEfTco2PerTonne = 0;
  input.green.overrides.wtwGco2PerMj = 0;
  input.fossil.overrides.lhvMjPerTonne = 40200;
  input.fossil.overrides.combustionEfTco2PerTonne = 3.114;
  input.fossil.overrides.wtwGco2PerMj = 91.16;
  return input;
}
