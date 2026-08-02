/**
 * Uncertainty band (realism pass, Task 5) — report a range, not a point.
 *
 * "$1,422/t" with a lineage chip reads far more precise than a screening
 * estimate is: five assumptions swing it 2.4×. This module varies the four
 * SOURCED drivers across their published ranges and reports low / central /
 * high, plus which driver contributes most of the spread — so the reader can
 * see both the uncertainty and where it comes from.
 *
 * Same discipline as the map's fixed colour domain: do not let a rendering
 * imply precision the estimate lacks.
 */

/** A driver varied across its published range. */
export interface BandDriver {
  readonly key: string;
  readonly low: number;
  readonly central: number;
  readonly high: number;
}

/**
 * The four sourced drivers. Ranges are the published/authoritative spans, not
 * invented error bars:
 * - electrolyser CAPEX: IEA GHR 2025, 2,000-2,600 USD/kW ex-China installed.
 * - firm-power multiplier: 1.6-2.2× the shaped price (Chilean tender and
 *   Codelco solar-plus-battery structures bracket this).
 * - scale exponent: 0.6-0.7, the usual span of the six-tenths rule.
 * - FOAK: 1.0 (nth-of-a-kind) to 1.4 (a genuinely first plant).
 */
export const BAND_DRIVERS: Record<
  "electrolyserCapex" | "firmMultiplier" | "scaleExponent" | "foak",
  BandDriver
> = {
  electrolyserCapex: { key: "electrolyserCapex", low: 2000, central: 2300, high: 2600 },
  firmMultiplier: { key: "firmMultiplier", low: 1.6, central: 1.9, high: 2.2 },
  scaleExponent: { key: "scaleExponent", low: 0.7, central: 0.65, high: 0.6 },
  foak: { key: "foak", low: 1.0, central: 1.25, high: 1.4 },
};

export type BandDriverKey = keyof typeof BAND_DRIVERS;

/** What one driver contributes to the spread. */
export interface BandContribution {
  readonly key: BandDriverKey;
  /** Result with this driver at its low end, everything else central. */
  readonly low: number;
  /** Result with this driver at its high end, everything else central. */
  readonly high: number;
  /** |high − low| — the driver's own swing. */
  readonly swing: number;
}

export interface BandResult {
  readonly low: number;
  readonly central: number;
  readonly high: number;
  /** Per-driver swings, largest first. */
  readonly contributions: readonly BandContribution[];
  /** The driver contributing most of the spread. */
  readonly largestDriver: BandDriverKey | null;
}

/** The four drivers at a chosen setting each. */
export type BandSample = Record<BandDriverKey, number>;

const KEYS = Object.keys(BAND_DRIVERS) as BandDriverKey[];

function sampleAt(pick: (d: BandDriver) => number): BandSample {
  return Object.fromEntries(KEYS.map((k) => [k, pick(BAND_DRIVERS[k])])) as BandSample;
}

/**
 * Compute low / central / high for `evaluate`, plus each driver's own swing.
 *
 * Low and high move ALL four drivers together — that is the honest span of a
 * screening estimate, not a one-at-a-time sensitivity. The per-driver
 * contributions are one-at-a-time, which is what "the spread is mostly X"
 * means.
 */
export function computeBand(evaluate: (sample: BandSample) => number): BandResult {
  const central = evaluate(sampleAt((d) => d.central));
  const lowAll = evaluate(sampleAt((d) => d.low));
  const highAll = evaluate(sampleAt((d) => d.high));

  const contributions = KEYS.map((key) => {
    const low = evaluate({ ...sampleAt((d) => d.central), [key]: BAND_DRIVERS[key].low });
    const high = evaluate({ ...sampleAt((d) => d.central), [key]: BAND_DRIVERS[key].high });
    return { key, low, high, swing: Math.abs(high - low) };
  }).sort((a, b) => b.swing - a.swing);

  return {
    // Guard the ordering: a driver whose "low" raises the result (the scale
    // exponent does exactly that) must not invert the band.
    low: Math.min(lowAll, highAll),
    central,
    high: Math.max(lowAll, highAll),
    contributions,
    largestDriver: contributions[0]?.key ?? null,
  };
}
