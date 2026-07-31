/**
 * Raw scenario input — what the user (or a fixture file) provides. Every
 * benchmarkable field is a nullable override: `null` = "use the benchmark",
 * mirroring the workbook's blank-D-cell convention (`E = IF(D="", F, D)`).
 * Numbers here are plain (unvalidated, unbranded); `resolveScenario` turns
 * them into branded `Resolved<T>` values against a reference bundle.
 */

/**
 * Current scenario schema version. v2 renamed
 * `regulation.ira45z.rateUsdPerGallon` → `creditUsdPerGallon` — a deliberate
 * rename proving the migration machinery (build-plan 4.1); see migrate.ts.
 */
export const SCHEMA_VERSION = 2;

export type RouteType = "point-to-point" | "single-point";
export type ConsumptionMode = "distance" | "vessel-benchmark";

/**
 * Fuel sourcing (divergence D4). `construct` is the LEGACY Excel mode — it
 * charges full merchant fuel price AND production capex AND O&M (production
 * cost twice); kept verbatim for the golden fixture. `purchase` buys at
 * market/contract price. `named-plant` and `build-here` price at a DELIVERED
 * price (contract, or LCOH+synthesis+logistics-derived) with production
 * capex/opex forced to zero — they live inside the delivered price.
 */
export type FuelSourcing = "construct" | "purchase" | "named-plant" | "build-here";

/**
 * Divergences from the Excel (build-plan 1.4). Every field optional; the
 * default is ALWAYS the Excel behaviour, so the golden fixture passes with
 * `flags` absent.
 */
export interface DivergenceFlags {
  /** D1 — basis for CO2-abated (and $/tCO2). Excel: combustion (TTW). */
  emissionsBasis?: "combustion" | "wellToWake";
  /** D6 — real deflates the OPEX inflation growth. Excel: nominal. */
  rateBasis?: "nominal" | "real";
}

export interface CargoInput {
  /**
   * Corridor anchor country (port A's country): selects the WACC benchmark.
   * Descriptive port/second-country fields below don't affect the numbers.
   */
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
  /**
   * What one cargo unit IS (presentation + per-tonne derivations only —
   * the engine counts units). Absent = legacy generic "unit"; the UI
   * defaults tonne for bulk/tanker and TEU for container vessels.
   */
  unit?: "tonne" | "teu";
  /** Weight of one unit in tonnes (TEU ≈ 14 t loaded). Absent = 1. */
  unitWeightTonnes?: number;
  /** Port A (the anchor country's port) — descriptive. */
  portAName?: string;
  /** Port B — descriptive; point-to-point only. */
  portBName?: string;
  /** Port B's country — descriptive; point-to-point only. */
  countryBId?: string;
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
  /**
   * D4 — required for `named-plant`/`build-here`: the delivered price at the
   * bunker port ($/t). For build-here it is derived from
   * LCOH + synthesis + logistics; the corridor engine must not know which.
   */
  deliveredPriceUsdPerTonne?: number | null;
  /**
   * build-here lineage: where the delivered price came from, so the UI chip
   * and provenance survive save/reload. Display data only — the engine never
   * reads it (the price above is the input).
   */
  buildHere?: {
    h3: string;
    lat: number;
    lon: number;
    lcohUsdPerKg: number;
    carrierId: string;
    synthesisGateUsdPerTonne: number;
    distanceKm: number;
    logisticsUsdPerTonne: number;
  } | null;
  overrides: FuelSideOverrides;
}

/** D3 — per-side non-CO2 combustion factors (tonnes of gas per tonne fuel). */
export interface EtsGasFactors {
  ch4TPerTonne: number;
  n2oTPerTonne: number;
}

export interface EtsInput {
  enabled: boolean;
  euaEurPerTonne: number;
  /**
   * Fix #3 — annual EUA price escalation, fraction/yr. Absent/0 = flat
   * nominal price (the Excel behaviour; a FALLING real price under
   * inflation). Effective price in year t = eua × (1+esc)^(t−1).
   */
  euaEscalation?: number;
  scope: number;
  /**
   * D3 — maritime ETS covers CH4 + N2O from 2026 (material for LNG slip and
   * ammonia N2O). Off (absent) = Excel behaviour (CO2 only).
   */
  gasCoverage?: {
    enabled: boolean;
    fromCalendarYear: number;
    gwpCh4: number;
    gwpN2o: number;
    green: EtsGasFactors;
    fossil: EtsGasFactors;
  };
}

export interface FuelEuInput {
  enabled: boolean;
  penaltyEurPerTonne: number;
  vlsfoMjPerTonne: number;
  baselineGco2PerMj: number;
  scope: number;
  /**
   * D2 — over-compliance value. Excel floors at MAX(0, ·): a surplus is worth
   * nothing. Enabled: a negative deficit earns `surplusValueEurPerTonneVlsfoEq`
   * per notional tonne, with the RFNBO ×multiplier until `rfnboUntil`.
   */
  credit?: {
    enabled: boolean;
    surplusValueEurPerTonneVlsfoEq: number;
    rfnbo: boolean;
    rfnboMultiplier: number;
    rfnboUntil: number;
  };
}

export interface Ira45zInput {
  enabled: boolean;
  usProduced: boolean;
  /** Credit rate, $/gallon-equivalent (v1 name: rateUsdPerGallon). */
  creditUsdPerGallon: number;
  /**
   * D5 — the credit as legislated runs to end-2027; the workbook has no
   * sunset. Absent/null = no sunset (Excel behaviour); parameterized rather
   * than hardcoded either way.
   */
  effectiveUntil?: number | null;
}

export interface SelfDesignedInput {
  enabled: boolean;
  co2PriceUsdPerTonne: number;
  /** Fix #3 — annual CO2-price escalation, fraction/yr. Absent/0 = flat nominal. */
  co2PriceEscalation?: number;
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
  /** Divergence flags (D1/D6). Absent = pure Excel behaviour. */
  flags?: DivergenceFlags;
}
