/**
 * Raw scenario input — what the user (or a fixture file) provides. Every
 * benchmarkable field is a nullable override: `null` = "use the benchmark",
 * mirroring the workbook's blank-D-cell convention (`E = IF(D="", F, D)`).
 * Numbers here are plain (unvalidated, unbranded); `resolveScenario` turns
 * them into branded `Resolved<T>` values against a reference bundle.
 */

export const SCHEMA_VERSION = 1;

export type RouteType = "point-to-point" | "single-point";
export type ConsumptionMode = "distance" | "vessel-benchmark";
export type FuelSourcing = "construct" | "purchase";

export interface CargoInput {
  countryId: string;
  routeType: RouteType;
  oneWayDistanceNm: number;
  startYear: number;
  /** Model years (workbook max 40). */
  horizonYears: number;
  unitsPerYear: number;
  inflation: number;
  vessels: number;
  roundtripsPerYear: number;
  /** Project-specific WACC; null → country benchmark. */
  waccOverride: number | null;
}

export interface VesselSideInput {
  capexUsdM: number | null;
  opexUsdMPerYear: number | null;
}

export interface VesselInput {
  typeId: string;
  consumptionMode: ConsumptionMode;
  green: VesselSideInput;
  fossil: VesselSideInput;
}

/** Per-side fuel/port overrides — one nullable field per workbook D cell. */
export interface FuelSideOverrides {
  priceUsdPerTonne: number | null;
  combustionEfTco2PerTonne: number | null;
  lhvMjPerTonne: number | null;
  wtwGco2PerMj: number | null;
  fuelTonnesPerVesselYear: number | null;
  prodCapexUsdM: number | null;
  prodOpexUsdMPerYear: number | null;
  portStorageCapexUsdM: number | null;
  portStorageOpexUsdMPerYear: number | null;
  bargeCapexUsdM: number | null;
  bargeOpexUsdMPerYear: number | null;
}

export interface FuelSideInput {
  fuelId: string;
  sourcing: FuelSourcing;
  overrides: FuelSideOverrides;
}

export interface EtsInput {
  enabled: boolean;
  euaEurPerTonne: number;
  scope: number;
}

export interface FuelEuInput {
  enabled: boolean;
  penaltyEurPerTonne: number;
  vlsfoMjPerTonne: number;
  baselineGco2PerMj: number;
  scope: number;
}

export interface Ira45zInput {
  enabled: boolean;
  usProduced: boolean;
  rateUsdPerGallon: number;
}

export interface SelfDesignedInput {
  enabled: boolean;
  co2PriceUsdPerTonne: number;
  supportUsdPerKg: number;
  capexSupport: number;
  opexSupport: number;
  otherUsdM: number;
}

export interface RegulationInput {
  eurUsd: number;
  ets: EtsInput;
  fuelEu: FuelEuInput;
  ira45z: Ira45zInput;
  selfDesigned: SelfDesignedInput;
}

export interface ScenarioInput {
  schemaVersion: typeof SCHEMA_VERSION;
  refBundleId: string;
  cargo: CargoInput;
  vessel: VesselInput;
  green: FuelSideInput;
  fossil: FuelSideInput;
  regulation: RegulationInput;
}
