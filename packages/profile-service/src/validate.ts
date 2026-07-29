/**
 * Profile validation gate (spec T1.1).
 *
 * An 8760-hour capacity-factor profile can be structurally well-formed (right
 * length, values in [0,1], no gaps) yet physically impossible — e.g. PVGIS
 * returned a data-artifact cell whose sunniest hour of the year only reaches
 * 39 % of nameplate, or a reanalysis coverage hole that scaled every value to a
 * third of reality. Those render as a colour on the map (a cheap or expensive
 * site that does not exist) and break comparability with the true neighbours.
 *
 * This gate screens a built profile against physical plausibility bounds. A
 * failing profile is meant to be MASKED (rendered no-data), never coloured. The
 * checks are deliberately loose one-sided sanity bounds, not accuracy tests:
 * they must pass every real site on Earth (a genuinely poor cloudy PV site, a
 * low-wind site) and only reject the non-physical. The peak-CF floor is the
 * decisive one — real PV always has some near-clear-sky hours, so an annual
 * peak below the floor is the fingerprint of a scaling/artifact fault.
 *
 * Pure and dependency-free: `(cf, kind, latDeg) -> verdict`.
 */
import type { ProfileKind } from "./types";
import { HOURS_PER_YEAR } from "./time";

export interface ProfileValidation {
  ok: boolean;
  /** Human-readable reasons the profile was rejected (empty when ok). */
  reasons: string[];
  metrics: {
    meanCf: number;
    peakCf: number;
    /** Hours with cf > 0 — the "daylight" band for PV, active hours for wind. */
    nonZeroHours: number;
    /** Distinct rounded cf values — degenerate/constant profiles score low. */
    distinctValues: number;
    /** Each calendar month's share of annual energy (12 values, sum ~1). */
    monthlyShares: number[];
  };
}

/**
 * Physical plausibility bounds. Named and exported so the seeding path and any
 * dashboard read the same numbers. Chosen to pass every real site and reject
 * only the non-physical — widen deliberately, not to silence a real fault.
 */
export const PV_PEAK_CF_MIN = 0.55; // real fixed/tracking PV hits clear-sky hours ≥ this
export const PV_MEAN_CF_MIN = 0.04;
export const PV_MEAN_CF_MAX = 0.35;
export const PV_NONZERO_HOURS_MIN = 3600; // annual daylight ≈ 4380h everywhere
export const PV_NONZERO_HOURS_MAX = 5200;
export const PV_MONTHLY_SHARE_MAX = 0.22; // uniform 8.3%; seasonal high-lat peaks ~15%

export const WIND_MEAN_CF_MIN = 0.02;
export const WIND_MEAN_CF_MAX = 0.75;
export const WIND_PEAK_CF_MIN = 0.15; // a real wind site's best hour clears this
/** Below this many distinct values a profile is degenerate (flat/constant fill). */
export const MIN_DISTINCT_VALUES = 8;

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // 8760-hour (non-leap) calendar

function monthlyShares(cf: number[]): number[] {
  const totals = new Array<number>(12).fill(0);
  let h = 0;
  for (let m = 0; m < 12; m++) {
    const end = h + MONTH_LENGTHS[m]! * 24;
    for (; h < end; h++) totals[m]! += cf[h] ?? 0;
  }
  const annual = totals.reduce((a, b) => a + b, 0);
  if (annual <= 0) return totals; // all-zero: leave as zeros, caught by mean check
  return totals.map((t) => t / annual);
}

function isPv(kind: ProfileKind): boolean {
  return kind.startsWith("pv");
}

/**
 * Screen a built 8760-hour profile for physical plausibility. `latDeg` is
 * accepted for future latitude-derived bounds (daylight band); the current
 * checks are latitude-independent one-sided bounds.
 */
export function validateProfile(
  cf: number[],
  kind: ProfileKind,
  _latDeg: number,
): ProfileValidation {
  const reasons: string[] = [];

  let sum = 0;
  let peak = 0;
  let nonZero = 0;
  const distinct = new Set<number>();
  for (const v of cf) {
    sum += v;
    if (v > peak) peak = v;
    if (v > 0) nonZero++;
    distinct.add(Math.round(v * 1000)); // 0.001 granularity
  }
  const meanCf = cf.length ? sum / cf.length : 0;
  const shares = monthlyShares(cf);
  const maxShare = shares.reduce((a, b) => Math.max(a, b), 0);

  if (cf.length !== HOURS_PER_YEAR) {
    reasons.push(`profile length ${cf.length} ≠ ${HOURS_PER_YEAR}`);
  }

  if (isPv(kind)) {
    if (peak < PV_PEAK_CF_MIN) {
      reasons.push(
        `PV peak CF ${peak.toFixed(3)} < ${PV_PEAK_CF_MIN} (non-physical — real PV has clear-sky hours)`,
      );
    }
    if (meanCf < PV_MEAN_CF_MIN || meanCf > PV_MEAN_CF_MAX) {
      reasons.push(
        `PV mean CF ${meanCf.toFixed(3)} outside [${PV_MEAN_CF_MIN}, ${PV_MEAN_CF_MAX}]`,
      );
    }
    if (nonZero < PV_NONZERO_HOURS_MIN || nonZero > PV_NONZERO_HOURS_MAX) {
      reasons.push(
        `PV daylight hours ${nonZero} outside [${PV_NONZERO_HOURS_MIN}, ${PV_NONZERO_HOURS_MAX}]`,
      );
    }
    if (maxShare > PV_MONTHLY_SHARE_MAX) {
      reasons.push(
        `PV monthly share ${(maxShare * 100).toFixed(1)}% > ${(PV_MONTHLY_SHARE_MAX * 100).toFixed(0)}% (energy concentrated in one month)`,
      );
    }
  } else {
    if (meanCf < WIND_MEAN_CF_MIN || meanCf > WIND_MEAN_CF_MAX) {
      reasons.push(
        `wind mean CF ${meanCf.toFixed(3)} outside [${WIND_MEAN_CF_MIN}, ${WIND_MEAN_CF_MAX}]`,
      );
    }
    if (peak < WIND_PEAK_CF_MIN) {
      reasons.push(
        `wind peak CF ${peak.toFixed(3)} < ${WIND_PEAK_CF_MIN} (turbine never nears rated — suspect)`,
      );
    }
    if (distinct.size < MIN_DISTINCT_VALUES) {
      reasons.push(
        `wind profile degenerate: only ${distinct.size} distinct values`,
      );
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    metrics: {
      meanCf,
      peakCf: peak,
      nonZeroHours: nonZero,
      distinctValues: distinct.size,
      monthlyShares: shares,
    },
  };
}
