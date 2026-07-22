export const HOURS_PER_YEAR = 8760;

export const DAYS_PER_MONTH: readonly number[] = [
  31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
];

/** Hour index (UTC, non-leap year) at which each month starts; 13 entries. */
export const MONTH_START_HOUR: readonly number[] = (() => {
  const starts = [0];
  for (const days of DAYS_PER_MONTH) {
    starts.push(starts[starts.length - 1]! + days * 24);
  }
  return starts;
})();

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Hour index range [start, end) of Feb 29 in a leap-year hourly series. */
const FEB29_START = (31 + 28) * 24;

/**
 * Normalize one calendar year of hourly values to 8760 by dropping Feb 29
 * (engine hard-requires 8760). Accepts 8760 (returned as-is) or 8784.
 */
export function trimFeb29<T>(hourly: readonly T[]): T[] {
  if (hourly.length === HOURS_PER_YEAR) return [...hourly];
  if (hourly.length === 8784) {
    return [
      ...hourly.slice(0, FEB29_START),
      ...hourly.slice(FEB29_START + 24),
    ];
  }
  throw new Error(
    `expected 8760 or 8784 hourly values, got ${hourly.length}`,
  );
}

/**
 * Fill provider gaps (nulls / non-finite) by linear interpolation between the
 * nearest known neighbors; leading/trailing gaps are clamped to the nearest
 * known value. An all-null series fills with zeros (gapHours = length).
 */
export function fillGaps(cf: readonly (number | null)[]): {
  cf: number[];
  gapHours: number;
} {
  const n = cf.length;
  const out = new Array<number>(n);
  let gapHours = 0;
  let prevKnown = -1;

  for (let i = 0; i < n; i++) {
    const v = cf[i];
    if (v !== null && v !== undefined && Number.isFinite(v)) {
      out[i] = v;
      if (prevKnown < i - 1) {
        const start = prevKnown;
        const left = start >= 0 ? out[start]! : v;
        for (let j = start + 1; j < i; j++) {
          const t = start >= 0 ? (j - start) / (i - start) : 1;
          out[j] = left + (v - left) * t;
        }
      }
      prevKnown = i;
    } else {
      gapHours++;
    }
  }

  if (prevKnown === -1) {
    out.fill(0);
  } else if (prevKnown < n - 1) {
    for (let j = prevKnown + 1; j < n; j++) out[j] = out[prevKnown]!;
  }

  return { cf: out, gapHours };
}
