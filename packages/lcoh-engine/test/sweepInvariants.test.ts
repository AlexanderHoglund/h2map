/**
 * T4 — invariants of the map's sizing sweeps, over randomized profiles.
 *
 * The map computes three numbers per cell from one pair of profiles:
 * solar-only and wind-only at a FIXED 200 MW : 100 MW design point, the
 * best of a 5-point mix sweep at that same ratio, and (on the
 * best-achievable layer) the best of a 45-point ratio x mix grid. Those
 * three are nested by construction, and the nesting is what makes the
 * layers comparable — if it ever inverted, "best" would be worse than a
 * single-source layer and the map would be lying about which technology
 * wins.
 *
 * The sweeps themselves live in scripts/ (no test runner), so the grids are
 * reproduced here against the same engine they call. That is deliberate:
 * these test the CONTRACT (nesting, monotonicity, non-degeneracy), which is
 * a property of the engine + grid shape, not of the script's plumbing.
 *
 * Also guards the field's own failure mode: a layer that has collapsed to
 * one value everywhere. A flat field renders as a single colour and reads
 * as "no signal here" — exactly the class of bug that started this review.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { simulateLCOH, type LCOHInputs, type PricingMode } from "../src/index";
import { pvOnlyInputs, tiledProfile } from "./helpers";

/** The map's fixed design point (scripts/lib/lcohSweep.ts). */
const TOTAL_RENEWABLE_MW = 200;
const PV_SHARES = [0, 0.25, 0.5, 0.75, 1] as const;
/** The best-achievable grid (same file). */
const OVERSIZE_RATIOS = [1.25, 1.5, 2.0, 2.5, 3.0] as const;
const MIX_SHARES = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1] as const;
const ELECTROLYZER_MW = 100;

const pvPricing: PricingMode = {
  mode: "capex",
  capexUsdPerKw: 800,
  opexFractionPerYear: 0.015,
};
const windPricing: PricingMode = {
  mode: "capex",
  capexUsdPerKw: 1200,
  opexFractionPerYear: 0.025,
};

/** One configuration, built exactly as the sweep builds it. */
function lcohAt(
  pv: readonly number[],
  wind: readonly number[],
  pvMw: number,
  windMw: number,
): number {
  const base = pvOnlyInputs();
  const inputs: LCOHInputs = {
    finance: base.finance,
    electrolyzer: { ...base.electrolyzer, capacityMw: ELECTROLYZER_MW },
    ...(pvMw > 0 ? { pv: { capacityMw: pvMw, pricing: pvPricing } } : {}),
    ...(windMw > 0 ? { wind: { capacityMw: windMw, pricing: windPricing } } : {}),
    water: { ...base.water },
  };
  return simulateLCOH(inputs, {
    ...(pvMw > 0 ? { pv } : {}),
    ...(windMw > 0 ? { wind } : {}),
  }).lcohUsdPerKg;
}

function fixedSweep(pv: readonly number[], wind: readonly number[]) {
  const points = PV_SHARES.map((share) => {
    const pvMw = TOTAL_RENEWABLE_MW * share;
    return { pvMw, windMw: TOTAL_RENEWABLE_MW - pvMw };
  }).map((p) => ({ ...p, lcoh: lcohAt(pv, wind, p.pvMw, p.windMw) }));
  return {
    best: Math.min(...points.map((p) => p.lcoh)),
    solarOnly: points.find((p) => p.windMw === 0)!.lcoh,
    windOnly: points.find((p) => p.pvMw === 0)!.lcoh,
  };
}

function optimalSweep(pv: readonly number[], wind: readonly number[]): number {
  let best = Infinity;
  for (const ratio of OVERSIZE_RATIOS) {
    const total = ELECTROLYZER_MW * ratio;
    for (const share of MIX_SHARES) {
      const pvMw = total * share;
      const l = lcohAt(pv, wind, pvMw, total - pvMw);
      if (l < best) best = l;
    }
  }
  return best;
}

/** Day shapes with at least one producing hour on each source. */
const producingDay = fc
  .array(fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }), {
    minLength: 24,
    maxLength: 24,
  })
  .filter((d) => d.some((cf) => cf > 0.05));

const RUNS = { numRuns: 8 };

describe("map sizing sweeps", () => {
  it("nesting: best_sweep <= best_fixed <= min(solar_only, wind_only)", () => {
    fc.assert(
      fc.property(producingDay, producingDay, (pvDay, windDay) => {
        const pv = tiledProfile(pvDay);
        const wind = tiledProfile(windDay);
        const fixed = fixedSweep(pv, wind);
        const optimal = optimalSweep(pv, wind);
        const TOL = 1e-6;
        // The fixed mix sweep includes both single-source endpoints, so its
        // best can never be worse than either.
        if (fixed.best > Math.min(fixed.solarOnly, fixed.windOnly) + TOL) return false;
        // The ratio x mix grid CONTAINS the fixed 2.0 mix sweep, so its best
        // can never be worse either. If this inverts, the best-achievable
        // layer is showing a worse number than the layer it improves on.
        return optimal <= fixed.best + TOL;
      }),
      RUNS,
    );
  });

  it("the fixed sweep's best is one of its own evaluated points", () => {
    // Guards a reduce/compare bug silently returning an unevaluated value.
    fc.assert(
      fc.property(producingDay, producingDay, (pvDay, windDay) => {
        const pv = tiledProfile(pvDay);
        const wind = tiledProfile(windDay);
        const points = PV_SHARES.map((share) => {
          const pvMw = TOTAL_RENEWABLE_MW * share;
          return lcohAt(pv, wind, pvMw, TOTAL_RENEWABLE_MW - pvMw);
        });
        const best = fixedSweep(pv, wind).best;
        return points.some((p) => Math.abs(p - best) < 1e-9);
      }),
      RUNS,
    );
  });

  it("a layer over varied sites is never a flat field", () => {
    // THE regression this review began with: a layer whose values collapse
    // to one number renders as one colour and reads as "no signal". Four
    // deliberately different resources must produce four different LCOHs,
    // spread by materially more than rounding.
    const sites = [
      tiledProfile(new Array<number>(24).fill(0).map((_, h) => (h > 6 && h < 18 ? 0.9 : 0))), // peaky desert sun
      tiledProfile(new Array<number>(24).fill(0).map((_, h) => (h > 8 && h < 16 ? 0.35 : 0))), // cloudy tropics
      tiledProfile(new Array<number>(24).fill(0.45)), // flat, windy
      tiledProfile(new Array<number>(24).fill(0.08)), // poor everywhere
    ];
    const values = sites.map((p) => lcohAt(p, p, TOTAL_RENEWABLE_MW, 0));
    expect(new Set(values.map((v) => v.toFixed(6))).size).toBe(values.length);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(
      values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length,
    );
    // Population std well above any plausible rounding artifact.
    expect(sd).toBeGreaterThan(0.5);
  });

  it("more renewable at a fixed mix never raises the electrolyser's output", () => {
    // Sanity on the ratio axis: oversizing can cost more per kg (curtailment)
    // but must never produce LESS hydrogen.
    fc.assert(
      fc.property(producingDay, (pvDay) => {
        const pv = tiledProfile(pvDay);
        const base = pvOnlyInputs();
        const kg = (mw: number) =>
          simulateLCOH(
            {
              finance: base.finance,
              electrolyzer: { ...base.electrolyzer, capacityMw: ELECTROLYZER_MW },
              pv: { capacityMw: mw, pricing: pvPricing },
              water: { ...base.water },
            },
            { pv },
          ).totals.h2Kg;
        return kg(300) >= kg(125) - 1e-6;
      }),
      RUNS,
    );
  });
});
