/**
 * LCOH sweeps over the reference configuration (100 MW electrolyzer, 8 %,
 * 20 yr, no grid; PV share of a fixed 200 MW renewable total swept over
 * {0, 25, 50, 75, 100} %). Two pricing regimes:
 *
 * - `referenceSweep` — flat LCOE 30 USD/MWh everywhere, the doc-literal
 *   Chilean methodology. Used by the parity run so results stay comparable to
 *   the published table. DO NOT change its pricing.
 * - `mapSweep` — CAPEX-priced renewables, so each cell's LCOE is DERIVED from
 *   its local capacity factor (better resource → more MWh from the same
 *   plant → cheaper electricity). This is what makes the choropleth show that
 *   location matters. CAPEX/OPEX from IRENA Renewable Power Generation Costs
 *   2023 global weighted averages (solar PV ~800 USD/kWp, onshore wind
 *   ~1200 USD/kW), differentiated because the two technologies have genuinely
 *   different economics.
 */
import { REFERENCE_DEFAULTS, simulateLCOH } from "@h2map/lcoh-engine";
import type {
  LCOHInputs,
  PricingMode,
  ReferenceFlags,
} from "@h2map/lcoh-engine";

export const PV_SHARES = [0, 0.25, 0.5, 0.75, 1];
export const TOTAL_RENEWABLE_MW = 200;

/** Flat reference electricity price (Chilean methodology default). */
const FLAT_LCOE: PricingMode = { mode: "lcoe", usdPerMwh: 30 };

/**
 * Cost-year techno-economic packs. The 2024 base is IRENA-2023 CAPEX;
 * 2030/2040/2050 apply the IEA-anchored cost-down (see docs/COST_YEARS.md):
 * multipliers from the IEA Global Hydrogen Review 2025 Assumptions Annex
 * (2024→2030) extrapolated to 2040/2050 along IEA's stated direction —
 * electrolyser CAPEX ×0.70/0.58/0.50, solar ×0.69/0.62/0.57, wind
 * ×0.92/0.88/0.85, efficiency 60→61→63→65 % LHV.
 */
export interface CostPack {
  electrolyzerCapexUsdPerKw: number;
  efficiencyLhv: number;
  solarCapexUsdPerKw: number;
  solarOpexFrac: number;
  windCapexUsdPerKw: number;
  windOpexFrac: number;
}

export const COST_YEARS = [2024, 2030, 2040, 2050] as const;
export type CostYear = (typeof COST_YEARS)[number];

export const COST_PACKS: Record<CostYear, CostPack> = {
  2024: { electrolyzerCapexUsdPerKw: 1000, efficiencyLhv: 0.6, solarCapexUsdPerKw: 800, solarOpexFrac: 0.015, windCapexUsdPerKw: 1200, windOpexFrac: 0.025 },
  2030: { electrolyzerCapexUsdPerKw: 700, efficiencyLhv: 0.61, solarCapexUsdPerKw: 552, solarOpexFrac: 0.015, windCapexUsdPerKw: 1104, windOpexFrac: 0.025 },
  2040: { electrolyzerCapexUsdPerKw: 580, efficiencyLhv: 0.63, solarCapexUsdPerKw: 496, solarOpexFrac: 0.015, windCapexUsdPerKw: 1056, windOpexFrac: 0.025 },
  2050: { electrolyzerCapexUsdPerKw: 500, efficiencyLhv: 0.65, solarCapexUsdPerKw: 456, solarOpexFrac: 0.015, windCapexUsdPerKw: 1020, windOpexFrac: 0.025 },
};

export interface SweepPoint {
  pvMw: number;
  windMw: number;
  lcoh: number;
}

export interface SweepResult {
  best: SweepPoint;
  sweep: SweepPoint[];
  /** PV-only / wind-only configurations (null when that profile is absent). */
  solarOnly: number | null;
  windOnly: number | null;
}

function sweep(
  profiles: { pv?: readonly number[]; wind?: readonly number[] },
  pvPricing: PricingMode,
  windPricing: PricingMode,
  electrolyzer: LCOHInputs["electrolyzer"],
  flags: ReferenceFlags,
  label: string,
  wacc?: number,
): SweepResult {
  const finance: LCOHInputs["finance"] =
    wacc === undefined
      ? { ...REFERENCE_DEFAULTS.finance }
      : { ...REFERENCE_DEFAULTS.finance, discountRate: wacc };
  const points: SweepPoint[] = [];
  for (const share of PV_SHARES) {
    const pvMw = TOTAL_RENEWABLE_MW * share;
    const windMw = TOTAL_RENEWABLE_MW - pvMw;
    if (pvMw > 0 && !profiles.pv) continue;
    if (windMw > 0 && !profiles.wind) continue;
    const inputs: LCOHInputs = {
      finance,
      electrolyzer,
      ...(pvMw > 0 ? { pv: { capacityMw: pvMw, pricing: pvPricing } } : {}),
      ...(windMw > 0
        ? { wind: { capacityMw: windMw, pricing: windPricing } }
        : {}),
      water: { ...REFERENCE_DEFAULTS.water },
      referenceFlags: flags,
    };
    const results = simulateLCOH(inputs, {
      ...(pvMw > 0 ? { pv: profiles.pv } : {}),
      ...(windMw > 0 ? { wind: profiles.wind } : {}),
    });
    points.push({ pvMw, windMw, lcoh: results.lcohUsdPerKg });
  }
  if (points.length === 0) {
    throw new Error(`${label}: no feasible configuration (no profiles)`);
  }
  const best = points.reduce((a, b) => (b.lcoh < a.lcoh ? b : a));
  return {
    best,
    sweep: points,
    solarOnly: points.find((s) => s.windMw === 0)?.lcoh ?? null,
    windOnly: points.find((s) => s.pvMw === 0)?.lcoh ?? null,
  };
}

/** No reference-flag deviations — the reference/default model. */
const REFERENCE_FLAGS: ReferenceFlags = {};

/**
 * The "improved mode" reference-flag set the rank-fidelity program builds up.
 * Engine-only P0 items land here (all default-off in the engine, so reference
 * mode and the Chilean parity run are unaffected):
 *   P0 #3 — stack life on equivalent full-load hours + efficiency reset.
 */
export const IMPROVED_FLAGS: ReferenceFlags = {
  stackLifeOnEquivalentFullLoadHours: true,
  resetEfficiencyOnStackReplacement: true,
};

/** Flat-LCOE reference sweep — parity target; keep pricing + flags fixed. */
export function referenceSweep(profiles: {
  pv?: readonly number[];
  wind?: readonly number[];
}): SweepResult {
  return sweep(
    profiles,
    FLAT_LCOE,
    FLAT_LCOE,
    { ...REFERENCE_DEFAULTS.electrolyzer },
    REFERENCE_FLAGS,
    "referenceSweep",
  );
}

/**
 * Location-specific CAPEX sweep for one cost-year pack — the choropleth's
 * values. `wacc` overrides the uniform reference discount rate (0.08) with a
 * per-cell cost of capital for the risk-adjusted financing layer (P1 #5);
 * left undefined the map ranks resource under uniform financing.
 */
export function mapSweep(
  profiles: { pv?: readonly number[]; wind?: readonly number[] },
  pack: CostPack,
  flags: ReferenceFlags = REFERENCE_FLAGS,
  wacc?: number,
): SweepResult {
  return sweep(
    profiles,
    { mode: "capex", capexUsdPerKw: pack.solarCapexUsdPerKw, opexFractionPerYear: pack.solarOpexFrac },
    { mode: "capex", capexUsdPerKw: pack.windCapexUsdPerKw, opexFractionPerYear: pack.windOpexFrac },
    {
      ...REFERENCE_DEFAULTS.electrolyzer,
      capexUsdPerKw: pack.electrolyzerCapexUsdPerKw,
      efficiencyLhv: pack.efficiencyLhv,
    },
    flags,
    "mapSweep",
    wacc,
  );
}

/** One cost year's LCOH trio for a cell. */
export interface YearLcoh {
  best: number;
  solar: number | null;
  wind: number | null;
  bestPvMw: number;
  bestWindMw: number;
}

/** Run the map sweep for every cost year from one set of cached profiles. */
export function mapSweepAllYears(
  profiles: { pv?: readonly number[]; wind?: readonly number[] },
  flags: ReferenceFlags = REFERENCE_FLAGS,
  wacc?: number,
): Record<CostYear, YearLcoh> {
  const out = {} as Record<CostYear, YearLcoh>;
  for (const year of COST_YEARS) {
    const s = mapSweep(profiles, COST_PACKS[year], flags, wacc);
    out[year] = {
      best: s.best.lcoh,
      solar: s.solarOnly,
      wind: s.windOnly,
      bestPvMw: s.best.pvMw,
      bestWindMw: s.best.windMw,
    };
  }
  return out;
}

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

/** The `lcoh_years` jsonb payload (future years only; 2024 lives in columns). */
export function futureYearsJson(
  years: Record<CostYear, YearLcoh>,
): Record<string, { best: number; solar: number | null; wind: number | null }> {
  const out: Record<string, { best: number; solar: number | null; wind: number | null }> = {};
  for (const year of COST_YEARS) {
    if (year === 2024) continue;
    const y = years[year];
    out[String(year)] = {
      best: round3(y.best),
      solar: y.solar === null ? null : round3(y.solar),
      wind: y.wind === null ? null : round3(y.wind),
    };
  }
  return out;
}
