/**
 * Probabilistic corridor — the result as a distribution, not a point.
 *
 * The Results tab reports every figure as one number. The bundle's own
 * research says that is more precision than a screening estimate has: each
 * researched production parameter ships as a sourced {low, central, high}
 * band, and until this module nothing read `.low` or `.high` off any of them.
 * This samples those bands and reports percentiles.
 *
 * The sibling of `band.ts`, and deliberately not a replacement for it.
 * `computeBand` moves four hard-coded drivers to their endpoints together and
 * reports a 3-point span; it answers "how wide could this be?". This answers a
 * different question — "where does it actually land?" — which needs a
 * distribution, because the endpoints of a span carry no probability mass and
 * the middle of a span is not the median. On the Chilean benchmark corridor
 * the sampled median sits ABOVE the deterministic point estimate, and no
 * 3-point band can show that.
 *
 * WHAT IS SAMPLED, AND WHY IT IS ONLY THREE THINGS. The bundle ships ten
 * researched parameters per fuel, but `resolve.ts` reads `fuel.research` at
 * exactly two call sites and both read `production`. Port storage, bunkering,
 * merchant price and vessel capex premium are researched and shipped but not
 * yet wired into the resolver, so sampling them would move nothing while
 * implying the spread covers them. `SAMPLED` therefore lists the three that
 * are live; adding a parameter here is a list entry once the resolver reads it.
 *
 * DETERMINISM IS A REQUIREMENT, NOT A DETAIL. An uncertainty figure that
 * changes on every render cannot be quoted, screenshotted or reviewed. The
 * package's eslint boundary bans `Math.random` outright ("engine must be
 * deterministic"), so this carries its own seeded PRNG: same seed, same
 * percentiles, forever.
 */

import type { RefBundle, ScenarioInput, ScenarioSummary } from "@h2map/corridor-schema";
import { resolveScenario } from "@h2map/corridor-schema";
import { evaluateScenario } from "./index";

/** The KPIs reported as distributions — the vocabulary the sweep already uses. */
export const MC_KPIS = [
  "gapPvUsdM",
  "costPerUnitUsd",
  "costPerTonneCo2Usd",
  "greenTotalPvUsdM",
  "fossilTotalPvUsdM",
  "co2AbatedTonnes",
] as const satisfies readonly (keyof ScenarioSummary)[];

export type McKpi = (typeof MC_KPIS)[number];

/**
 * The researched production parameters this samples.
 *
 * `foakMultiplier` is researched and banded but deliberately ABSENT. The
 * researched central is already first-of-a-kind — anchored on NEOM at
 * financial close and AM Green at FID, both carrying FOAK contingency inside
 * their published figures — so the resolver does not apply it and neither does
 * this. Sampling it here would charge FOAK twice, silently, on every draw.
 * See `researchedProdCapexUsdM` in resolve.ts and the guard in
 * monteCarlo.test.ts.
 */
export const SAMPLED = [
  "capexUsdPerTpa",
  "opexUsdPerTpaPerYear",
  "scaleExponent",
] as const;

export type SampledKey = (typeof SAMPLED)[number];

/** Percentiles reported per KPI. */
export const PERCENTILES = [5, 25, 50, 75, 95] as const;

export interface KpiDistribution {
  readonly kpi: McKpi;
  /** Percentile → value, for each of PERCENTILES. */
  readonly percentiles: Readonly<Record<number, number>>;
  readonly mean: number;
  /** The deterministic single-number result, for comparison against P50. */
  readonly deterministic: number;
}

/** How much of the headline spread one sampled parameter accounts for. */
export interface McContribution {
  readonly key: SampledKey;
  /** P05→P95 span of the headline KPI with ONLY this parameter varying. */
  readonly swing: number;
}

export interface McResult {
  readonly runs: number;
  readonly seed: number;
  readonly distributions: readonly KpiDistribution[];
  /** Headline-KPI samples, ascending — the histogram's raw material. */
  readonly headlineSorted: readonly number[];
  /** Per-parameter swings, largest first. */
  readonly contributions: readonly McContribution[];
  /** The parameter driving most of the spread. */
  readonly largestDriver: SampledKey | null;
  /**
   * True when sampling moved NOTHING — every draw returned the same headline.
   *
   * This is a real and common case, not a defensive branch: a scenario that
   * OVERRIDES production capex and O&M (the shipped Chilean default sets
   * $1,100m and $72m/yr) never reaches the researched benchmarks, so the bands
   * this samples are not consulted and the "distribution" collapses to a
   * spike. Rendering that as a histogram would look like a confident result
   * rather than an inapplicable one, so the caller must say so instead.
   */
  readonly degenerate: boolean;
}

/**
 * Deterministic PRNG (mulberry32). Small, fast and well-distributed enough for
 * a screening Monte Carlo; the point is reproducibility, not cryptography.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Triangular draw from a three-point estimate.
 *
 * The right default for expert low/central/high: it needs no distribution
 * shape the sources never stated, and it puts the mode where the research put
 * its central value.
 *
 * THE ENDPOINTS ARE ORDERED FIRST, which is load-bearing. `scaleExponent`'s
 * band DESCENDS — its `low` field holds the numerically larger exponent —
 * against fifteen ascending siblings in the same bundle. A sampler assuming
 * `low <= high` inverts that parameter silently and still returns
 * plausible-looking numbers. `computeBand` guards the same trap with a
 * min/max at band.ts:95-97.
 */
export function triangular(
  low: number,
  central: number,
  high: number,
  u: number,
): number {
  const a = Math.min(low, high);
  const b = Math.max(low, high);
  const m = Math.min(Math.max(central, a), b);
  if (b <= a) return a;
  const f = (m - a) / (b - a);
  return u < f
    ? a + Math.sqrt(u * (b - a) * (m - a))
    : b - Math.sqrt((1 - u) * (b - a) * (b - m));
}

/** Percentile of an ASCENDING array, linearly interpolated. */
export function percentileOf(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0]!;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const w = rank - lo;
  return sorted[lo]! * (1 - w) + sorted[hi]! * w;
}

/**
 * A bundle clone with the chosen production parameters redrawn.
 *
 * Only the `central` field is written, because that is the only field the
 * resolver reads. `only` restricts the redraw to one parameter, which is how
 * the per-parameter contributions are measured.
 */
function perturb(
  bundle: RefBundle,
  next: () => number,
  only?: SampledKey,
): RefBundle {
  const fuels = bundle.fuels.map((fuel) => {
    const p = fuel.research?.production;
    if (!p) return fuel;
    const production = { ...p };
    for (const key of SAMPLED) {
      if (only && key !== only) continue;
      const band = p[key];
      production[key] = {
        ...band,
        central: triangular(band.low, band.central, band.high, next()),
      };
    }
    return { ...fuel, research: { ...fuel.research, production } };
  });
  return { ...bundle, fuels } as RefBundle;
}

const summaryOf = (input: ScenarioInput, bundle: RefBundle): ScenarioSummary =>
  evaluateScenario(resolveScenario(input, bundle)).summary;

/**
 * Run the corridor `runs` times over the researched bands.
 *
 * Synchronous by design: a full resolve + evaluate costs ~0.05 ms, so 10,000
 * draws complete in well under a second and the caller needs no worker, no
 * async state machine and no progress spinner.
 *
 * The headline KPI (`gapPvUsdM`) drives the histogram and the per-parameter
 * contributions; every KPI in `MC_KPIS` gets percentiles.
 */
export function runMonteCarlo(
  input: ScenarioInput,
  bundle: RefBundle,
  options: { runs?: number; seed?: number } = {},
): McResult {
  const runs = Math.max(1, Math.floor(options.runs ?? 2000));
  const seed = options.seed ?? 1;

  const deterministic = summaryOf(input, bundle);

  const next = rng(seed);
  const samples: Record<McKpi, number[]> = {
    gapPvUsdM: [],
    costPerUnitUsd: [],
    costPerTonneCo2Usd: [],
    greenTotalPvUsdM: [],
    fossilTotalPvUsdM: [],
    co2AbatedTonnes: [],
  };
  for (let i = 0; i < runs; i++) {
    const s = summaryOf(input, perturb(bundle, next));
    for (const kpi of MC_KPIS) samples[kpi].push(s[kpi]);
  }

  const distributions = MC_KPIS.map((kpi) => {
    const sorted = [...samples[kpi]].sort((x, y) => x - y);
    const percentiles: Record<number, number> = {};
    for (const p of PERCENTILES) percentiles[p] = percentileOf(sorted, p);
    return {
      kpi,
      percentiles,
      mean: sorted.reduce((acc, v) => acc + v, 0) / (sorted.length || 1),
      deterministic: deterministic[kpi],
    };
  });

  // One-at-a-time: each parameter redrawn alone, everything else at its
  // researched central. "The spread is mostly X" means exactly this.
  const contributions = SAMPLED.map((key) => {
    const own = rng(seed + 1);
    const drawn: number[] = [];
    for (let i = 0; i < runs; i++) {
      drawn.push(summaryOf(input, perturb(bundle, own, key)).gapPvUsdM);
    }
    drawn.sort((x, y) => x - y);
    return { key, swing: percentileOf(drawn, 95) - percentileOf(drawn, 5) };
  }).sort((a, b) => b.swing - a.swing);

  const headlineSorted = [...samples.gapPvUsdM].sort((x, y) => x - y);
  const spread =
    (headlineSorted[headlineSorted.length - 1] ?? 0) - (headlineSorted[0] ?? 0);

  return {
    runs,
    seed,
    distributions,
    headlineSorted,
    contributions,
    largestDriver: contributions[0]?.key ?? null,
    // Relative, so it does not depend on the corridor's size. A spread below
    // a millionth of the level is arithmetic noise, not a distribution.
    degenerate: !(Math.abs(spread) > Math.abs(deterministic.gapPvUsdM) * 1e-6),
  };
}
