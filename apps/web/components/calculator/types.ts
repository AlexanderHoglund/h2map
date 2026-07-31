/**
 * Client-side types for the calculator UI. Mirrors the /api/v1 contracts
 * (apps/web/lib/api/schemas.ts + packages/lcoh-engine/src/types.ts) — kept
 * local so the calculator bundle has no dependency on the explorer directory.
 */

export type PvKind = "pv_fixed" | "pv_1axis" | "pv_2axis";
export type WindKind = "wind_120" | "wind_160";
export type ProfileKind = PvKind | WindKind;

/** Per-component USD/kg shares; fields sum exactly to lcohUsdPerKg. */
export interface LCOHDecomposition {
  electricityPv: number;
  electricityWind: number;
  electricityGrid: number;
  electrolyzerCapex: number;
  stackReplacements: number;
  electrolyzerOpex: number;
  water: number;
}

export interface AnnualRow {
  year: number;
  h2Kg: number;
  waterM3: number;
  eConsumedKwh: number;
  ePvKwh: number;
  eWindKwh: number;
  eGridKwh: number;
  curtailedPvKwh: number;
  curtailedWindKwh: number;
  efficiencyLhv: number;
  operatingHours: number;
  stackReplacement: boolean;
}

export interface CostStructureComponent {
  costNature: "capital" | "operating" | "mixed";
  capitalUsd: number;
  operatingPvUsd: number;
  operatingUsdPerYear: number;
}

export interface CostStructure {
  capitalUsd: number;
  operatingPvUsd: number;
  annualOperatingUsd: number;
  annualH2Kg: number;
  plantLifeYears: number;
  discountRate: number;
  components: Record<keyof LCOHDecomposition, CostStructureComponent>;
}

export interface LCOHResults {
  lcohUsdPerKg: number;
  decomposition: LCOHDecomposition;
  costStructure: CostStructure;
  lcoe: { pv: number | null; wind: number | null; mix: number };
  annual: AnnualRow[];
  totals: {
    h2Kg: number;
    waterM3: number;
    eConsumedKwh: number;
    curtailedPvKwh: number;
    curtailedWindKwh: number;
    emissionsTco2e: number;
    emissionsKgCo2ePerKgH2: number;
    electrolyzerCapexUsd: number;
    stackReplacementsUsd: number;
    electrolyzerOpexUsd: number;
  };
  performance: {
    electrolyzerCapacityFactor: number;
    fullLoadHoursPerYear: number;
    /** 12×24 month-by-hour average-day electrolyzer load, MW. */
    averageDayProfileMw: number[][];
    /** Fraction of consumption served hour-by-hour by own renewables. */
    renewableMatchedFraction: number;
  };
  meta: { engineVersion: string; referenceMode: boolean };
}

export type ProfileSource =
  | { type: "inline" }
  | {
      type: "resolved";
      latR: number;
      lonR: number;
      kind: string;
      provider: string;
      datasetVersion: string;
      attribution: string;
      cacheHit: boolean;
    };

export interface SimulateResponse {
  results: LCOHResults;
  profiles: {
    pv?: { hash: string; source: ProfileSource };
    wind?: { hash: string; source: ProfileSource };
  };
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export interface ProfileStatus {
  slot: "pv" | "wind";
  kind: ProfileKind;
  state: "building" | "ready" | "error";
  provider?: string;
  cacheHit?: boolean;
  attribution?: string;
  message?: string;
}

/** Row of GET /api/v1/defaults. */
export interface CountryDefaults {
  iso2: string;
  grid_ef_tco2_mwh: number | null;
  wacc_suggestion: number | null;
  capex_pack: unknown;
  source: string | null;
}
