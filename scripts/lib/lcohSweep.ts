/**
 * The reference-configuration LCOH sweep shared by the parity run and the
 * hex seeder: doc-literal REFERENCE_DEFAULTS (100 MW electrolyzer, 8 %,
 * 20 yr), LCOE-priced renewables at 30 USD/MWh, no grid, PV share of a fixed
 * 200 MW renewable total swept over {0, 25, 50, 75, 100} %.
 */
import { REFERENCE_DEFAULTS, simulateLCOH } from "@h2map/lcoh-engine";
import type { LCOHInputs } from "@h2map/lcoh-engine";

export const PV_SHARES = [0, 0.25, 0.5, 0.75, 1];
export const TOTAL_RENEWABLE_MW = 200;

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

export function referenceSweep(profiles: {
  pv?: readonly number[];
  wind?: readonly number[];
}): SweepResult {
  const sweep: SweepPoint[] = [];
  for (const share of PV_SHARES) {
    const pvMw = TOTAL_RENEWABLE_MW * share;
    const windMw = TOTAL_RENEWABLE_MW - pvMw;
    if (pvMw > 0 && !profiles.pv) continue;
    if (windMw > 0 && !profiles.wind) continue;
    const inputs: LCOHInputs = {
      finance: { ...REFERENCE_DEFAULTS.finance },
      electrolyzer: { ...REFERENCE_DEFAULTS.electrolyzer },
      ...(pvMw > 0
        ? { pv: { capacityMw: pvMw, pricing: { mode: "lcoe", usdPerMwh: 30 } } }
        : {}),
      ...(windMw > 0
        ? { wind: { capacityMw: windMw, pricing: { mode: "lcoe", usdPerMwh: 30 } } }
        : {}),
      water: { ...REFERENCE_DEFAULTS.water },
    };
    const results = simulateLCOH(inputs, {
      ...(pvMw > 0 ? { pv: profiles.pv } : {}),
      ...(windMw > 0 ? { wind: profiles.wind } : {}),
    });
    sweep.push({ pvMw, windMw, lcoh: results.lcohUsdPerKg });
  }
  if (sweep.length === 0) {
    throw new Error("referenceSweep: no feasible configuration (no profiles)");
  }
  const best = sweep.reduce((a, b) => (b.lcoh < a.lcoh ? b : a));
  return {
    best,
    sweep,
    solarOnly: sweep.find((s) => s.windMw === 0)?.lcoh ?? null,
    windOnly: sweep.find((s) => s.pvMw === 0)?.lcoh ?? null,
  };
}
