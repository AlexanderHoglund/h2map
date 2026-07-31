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
    sourcing: "construct",
    deliveredPriceUsdPerTonne: null,
    overrides: {
      ...input.green.overrides,
      priceUsdPerTonne: 0,
      fuelTonnesPerVesselYear: 5700,
      lhvMjPerTonne: 18600,
      combustionEfTco2PerTonne: 0,
      wtwGco2PerMj: 0,
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
    deliveredPriceUsdPerTonne: null,
    overrides: {
      ...input.fossil.overrides,
      priceUsdPerTonne: 650,
      fuelTonnesPerVesselYear: 2638,
      lhvMjPerTonne: 40200,
      combustionEfTco2PerTonne: 3.114,
      wtwGco2PerMj: 91.16,
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
