import { HOURS_PER_YEAR } from "../src/constants";
import type { LCOHInputs } from "../src/types";

export function constantProfile(cf: number): number[] {
  return new Array<number>(HOURS_PER_YEAR).fill(cf);
}

/** Repeat a 24-value day pattern across the whole year. */
export function tiledProfile(day: readonly number[]): number[] {
  const out = new Array<number>(HOURS_PER_YEAR);
  for (let h = 0; h < HOURS_PER_YEAR; h++) out[h] = day[h % 24]!;
  return out;
}

/**
 * Analytical Case A base configuration: PV-only at the reference defaults,
 * with degradation off and stack life effectively infinite so the closed
 * form stays a plain annuity.
 */
export function pvOnlyInputs(): LCOHInputs {
  return {
    finance: { lifetimeYears: 20, discountRate: 0.08 },
    electrolyzer: {
      capacityMw: 100,
      capexUsdPerKw: 1000,
      opexFractionPerYear: 0.03,
      efficiencyLhv: 0.6,
      degradationPerYear: 0,
      stackLifetimeHours: 1e9,
      stackReplacementCostFraction: 0.3,
    },
    pv: { capacityMw: 100, pricing: { mode: "lcoe", usdPerMwh: 30 } },
    water: {
      priceUsdPerM3: 0.5,
      transportUsdPerM3Per100Km: 0.09,
      transportDistanceKm: 0,
      desalinated: false,
      pumpingHeadM: 0,
    },
  };
}

export function annuityFactor(rate: number, years: number): number {
  return (1 - Math.pow(1 + rate, -years)) / rate;
}

/** Assert relative parity |actual − expected| / |expected| ≤ tol. */
export function expectRel(
  actual: number,
  expected: number,
  tol = 1e-6,
): void {
  const denom = Math.abs(expected) > 0 ? Math.abs(expected) : 1;
  const rel = Math.abs(actual - expected) / denom;
  if (!(rel <= tol)) {
    throw new Error(
      `relative error ${rel} exceeds ${tol} (actual=${actual}, expected=${expected})`,
    );
  }
}
