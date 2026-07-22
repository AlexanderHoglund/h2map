import type { LCOHInputs } from "./types";

/** Lower heating value of hydrogen, kWh per kg (source doc, §2). */
export const LHV_H2_KWH_PER_KG = 33.33;

/** Hours in the engine's representative (non-leap) year. Profiles must have exactly this length. */
export const HOURS_PER_YEAR = 8760;

/** Desalination electricity, kWh per m³ of water — counted in the emissions ledger only, never in cost. */
export const DESAL_KWH_PER_M3 = 3.75;

/** Pumping electricity, kWh per m³ per 100 m of lift — emissions ledger only. */
export const PUMP_KWH_PER_M3_PER_100M = 0.4;

/** Electrolyzer water consumption, litres per kg H₂. */
export const WATER_L_PER_KG_H2 = 9;

export const DAYS_PER_MONTH = [
  31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
] as const;

/**
 * Default parameter set from the source methodology's input table
 * ("Motor de Cálculo LCOH", April 2024). The grid emission factor has no
 * global default in the doc ("region default") — 0.4 tCO₂/MWh is a
 * placeholder near the world average; callers should override per country.
 */
export const REFERENCE_DEFAULTS: LCOHInputs = Object.freeze<LCOHInputs>({
  finance: { lifetimeYears: 20, discountRate: 0.08 },
  electrolyzer: {
    capacityMw: 100,
    capexUsdPerKw: 1000,
    opexFractionPerYear: 0.03,
    efficiencyLhv: 0.6,
    degradationPerYear: 0.01,
    stackLifetimeHours: 40_000,
    stackReplacementCostFraction: 0.3,
  },
  pv: { capacityMw: 100, pricing: { mode: "lcoe", usdPerMwh: 30 } },
  wind: { capacityMw: 100, pricing: { mode: "lcoe", usdPerMwh: 30 } },
  grid: { maxImportMw: 100, priceUsdPerMwh: 30, emissionFactorTco2PerMwh: 0.4 },
  water: {
    priceUsdPerM3: 0.5,
    transportUsdPerM3Per100Km: 0.09,
    transportDistanceKm: 0,
    desalinated: false,
    pumpingHeadM: 0,
  },
});
