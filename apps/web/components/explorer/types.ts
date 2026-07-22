/** Client-side types for the explorer UI (mirrors the /api/v1 contracts). */

export type PvKind = "pv_fixed" | "pv_1axis" | "pv_2axis";
export type WindKind = "wind_120" | "wind_160";

export interface UiConfig {
  pvEnabled: boolean;
  pvCapacityMw: number;
  pvKind: PvKind;
  pvLcoeUsdPerMwh: number;
  windEnabled: boolean;
  windCapacityMw: number;
  windKind: WindKind;
  windLcoeUsdPerMwh: number;
  gridEnabled: boolean;
  gridMaxImportMw: number;
  gridPriceUsdPerMwh: number;
  gridEfTco2PerMwh: number;
  electrolyzerCapacityMw: number;
  electrolyzerCapexUsdPerKw: number;
  electrolyzerOpexFraction: number;
  efficiencyLhv: number;
  degradationPerYear: number;
  stackLifetimeHours: number;
  stackReplacementCostFraction: number;
  lifetimeYears: number;
  discountRate: number;
  waterPriceUsdPerM3: number;
}

/** Doc-literal reference defaults (mirrors the engine's REFERENCE_DEFAULTS). */
export const DEFAULT_CONFIG: UiConfig = {
  pvEnabled: true,
  pvCapacityMw: 100,
  pvKind: "pv_fixed",
  pvLcoeUsdPerMwh: 30,
  windEnabled: true,
  windCapacityMw: 100,
  windKind: "wind_120",
  windLcoeUsdPerMwh: 30,
  gridEnabled: false,
  gridMaxImportMw: 100,
  gridPriceUsdPerMwh: 30,
  gridEfTco2PerMwh: 0.4,
  electrolyzerCapacityMw: 100,
  electrolyzerCapexUsdPerKw: 1000,
  electrolyzerOpexFraction: 0.03,
  efficiencyLhv: 0.6,
  degradationPerYear: 0.01,
  stackLifetimeHours: 40_000,
  stackReplacementCostFraction: 0.3,
  lifetimeYears: 20,
  discountRate: 0.08,
  waterPriceUsdPerM3: 0.5,
};

export interface ProfileStatus {
  kind: string;
  state: "pending" | "building" | "ready" | "error";
  provider?: string;
  cacheHit?: boolean;
  attribution?: string;
  message?: string;
}

export interface SimulationResults {
  lcohUsdPerKg: number;
  decomposition: Record<string, number>;
  lcoe: { pv: number | null; wind: number | null; mix: number };
  totals: {
    h2Kg: number;
    emissionsKgCo2ePerKgH2: number;
    curtailedPvKwh: number;
    curtailedWindKwh: number;
    eConsumedKwh: number;
  };
  performance: {
    electrolyzerCapacityFactor: number;
    fullLoadHoursPerYear: number;
    averageDayProfileMw: number[][];
  };
  annual: { year: number; h2Kg: number; stackReplacement: boolean }[];
  meta: { engineVersion: string; referenceMode: boolean };
}

export interface SimulateResponse {
  results: SimulationResults;
  profiles: {
    pv?: { hash: string; source: ProfileSource };
    wind?: { hash: string; source: ProfileSource };
  };
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

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}
