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
import type { LCOHInputs, PricingMode } from "@h2map/lcoh-engine";

export const PV_SHARES = [0, 0.25, 0.5, 0.75, 1];
export const TOTAL_RENEWABLE_MW = 200;

/** Flat reference electricity price (Chilean methodology default). */
const FLAT_LCOE: PricingMode = { mode: "lcoe", usdPerMwh: 30 };
/** Resource-derived electricity cost (IRENA 2023 global weighted averages). */
const SOLAR_CAPEX: PricingMode = {
  mode: "capex",
  capexUsdPerKw: 800,
  opexFractionPerYear: 0.015,
};
const WIND_CAPEX: PricingMode = {
  mode: "capex",
  capexUsdPerKw: 1200,
  opexFractionPerYear: 0.025,
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
  label: string,
): SweepResult {
  const points: SweepPoint[] = [];
  for (const share of PV_SHARES) {
    const pvMw = TOTAL_RENEWABLE_MW * share;
    const windMw = TOTAL_RENEWABLE_MW - pvMw;
    if (pvMw > 0 && !profiles.pv) continue;
    if (windMw > 0 && !profiles.wind) continue;
    const inputs: LCOHInputs = {
      finance: { ...REFERENCE_DEFAULTS.finance },
      electrolyzer: { ...REFERENCE_DEFAULTS.electrolyzer },
      ...(pvMw > 0 ? { pv: { capacityMw: pvMw, pricing: pvPricing } } : {}),
      ...(windMw > 0
        ? { wind: { capacityMw: windMw, pricing: windPricing } }
        : {}),
      water: { ...REFERENCE_DEFAULTS.water },
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

/** Flat-LCOE reference sweep — parity target; keep pricing fixed. */
export function referenceSweep(profiles: {
  pv?: readonly number[];
  wind?: readonly number[];
}): SweepResult {
  return sweep(profiles, FLAT_LCOE, FLAT_LCOE, "referenceSweep");
}

/** Location-specific CAPEX sweep — the choropleth's values. */
export function mapSweep(profiles: {
  pv?: readonly number[];
  wind?: readonly number[];
}): SweepResult {
  return sweep(profiles, SOLAR_CAPEX, WIND_CAPEX, "mapSweep");
}
