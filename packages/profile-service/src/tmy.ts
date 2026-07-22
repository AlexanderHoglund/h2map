import { DAYS_PER_MONTH, HOURS_PER_YEAR, MONTH_START_HOUR } from "./time";

export interface TmyYearInput {
  year: number;
  /** Exactly 8760 gap-filled values. */
  cf: readonly number[];
}

export interface TmyResult {
  cf: number[];
  /** Source year chosen for each of the 12 months. */
  selectedYearByMonth: number[];
}

/**
 * Build a typical meteorological year by Finkelstein–Schafer month selection
 * (ISO 15927-4 in spirit, simplified to a single variable): for every
 * calendar month, pick the source year whose empirical CDF of daily mean CF
 * is closest to the long-term CDF pooled over all years, then stitch the 12
 * selected months together. No smoothing at month boundaries — the engine
 * consumes the year as one repeated dispatch loop, so small steps at the
 * seams are immaterial.
 *
 * Deterministic: ties break toward the earliest year.
 */
export function buildTmy(years: TmyYearInput[]): TmyResult {
  if (years.length === 0) throw new Error("buildTmy: no input years");
  for (const y of years) {
    if (y.cf.length !== HOURS_PER_YEAR) {
      throw new Error(
        `buildTmy: year ${y.year} has ${y.cf.length} hours, expected ${HOURS_PER_YEAR}`,
      );
    }
  }
  const sorted = [...years].sort((a, b) => a.year - b.year);

  const selectedYearByMonth: number[] = [];
  const cf = new Array<number>(HOURS_PER_YEAR);

  for (let m = 0; m < 12; m++) {
    const dailyByYear = sorted.map((y) => dailyMeans(y.cf, m));
    const pool = dailyByYear.flat().sort((a, b) => a - b);

    let bestIdx = 0;
    let bestFs = Infinity;
    for (let i = 0; i < sorted.length; i++) {
      const fs = fsStatistic(pool, [...dailyByYear[i]!].sort((a, b) => a - b));
      if (fs < bestFs - 1e-12) {
        bestFs = fs;
        bestIdx = i;
      }
    }

    const chosen = sorted[bestIdx]!;
    selectedYearByMonth.push(chosen.year);
    const start = MONTH_START_HOUR[m]!;
    const end = MONTH_START_HOUR[m + 1]!;
    for (let h = start; h < end; h++) cf[h] = chosen.cf[h]!;
  }

  return { cf, selectedYearByMonth };
}

/** Daily mean CF for month m (0-based) of a non-leap 8760 series. */
function dailyMeans(cf: readonly number[], m: number): number[] {
  const days = DAYS_PER_MONTH[m]!;
  const start = MONTH_START_HOUR[m]!;
  const out = new Array<number>(days);
  for (let d = 0; d < days; d++) {
    let sum = 0;
    for (let h = 0; h < 24; h++) sum += cf[start + d * 24 + h]!;
    out[d] = sum / 24;
  }
  return out;
}

/**
 * Finkelstein–Schafer statistic: mean absolute difference between the
 * long-term empirical CDF and the candidate year's empirical CDF, both
 * evaluated at every pooled daily value. Evaluating on the pool (rather than
 * only the candidate's own values) keeps the statistic well-behaved for
 * heavily tied samples.
 */
function fsStatistic(
  sortedPool: readonly number[],
  sortedSample: readonly number[],
): number {
  let sum = 0;
  for (const x of sortedPool) {
    sum += Math.abs(
      empiricalCdf(sortedPool, x) - empiricalCdf(sortedSample, x),
    );
  }
  return sum / sortedPool.length;
}

/** Fraction of the sorted array that is <= x (binary search). */
function empiricalCdf(sorted: readonly number[], x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo / sorted.length;
}
