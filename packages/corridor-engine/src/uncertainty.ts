/**
 * Monte Carlo over the DECLARED uncertainty — the band, and what drives it.
 *
 * The tornado moves one input at a time between its bounds. That is readable
 * and it is blind to interactions: WACC and horizon compound on a
 * capital-heavy corridor, and no one-at-a-time method can see it. This samples
 * every declared range at once and reports where the answer actually lands.
 *
 * WHAT IT ADDS OVER THE TORNADO, precisely: a joint band (P10/P50/P90) rather
 * than a set of independent spans, and a Spearman rank correlation per input —
 * an importance ranking that IS interaction-aware, because it measures how
 * strongly an input's draw tracks the outcome across the whole joint sample.
 *
 * DETERMINISM IS A HARD REQUIREMENT, not a detail. An uncertainty figure that
 * changes between runs cannot be quoted, screenshotted, reviewed or gated in
 * CI. `Math.random` is a lint error in this package ("engine must be
 * deterministic"), so this carries its own seeded PRNG: same seed, same
 * summary, forever.
 *
 * Restored and rewritten from the sampler deleted in 60600e0 (recoverable at
 * 224ec5c). The PRNG, the triangular draw and `percentileOf` are that module's
 * verbatim — including the endpoint-ordering guard, which is load-bearing and
 * was written against a real inverted band in the reference data. What is new
 * is the INPUT: it samples the researched uncertainty dataset and applies
 * coupling groups inside each draw, rather than sampling the bundle's own
 * production bands.
 */

import type { ScenarioInput } from "@h2map/corridor-schema";

/** Percentiles reported per KPI. */
export const UNCERTAINTY_PERCENTILES = [10, 50, 90] as const;

/**
 * One sampled input: a declared range plus how it acts on a scenario.
 *
 * The engine does not read the uncertainty dataset — it takes plain data as
 * arguments, per the package boundary. The caller resolves ids to appliers and
 * hands them over.
 */
export interface SampledInput {
  id: string;
  low: number;
  high: number;
  /** Triangular mode. Absent = uniform between the bounds. */
  mode?: number;
  /** Applies a drawn value to a scenario, in place. */
  apply: (s: ScenarioInput, drawn: number) => void;
}

export interface KpiBand {
  p10: number;
  p50: number;
  p90: number;
  mean: number;
  /** The unperturbed result, for comparison against P50. */
  deterministic: number;
}

export interface InputImportance {
  id: string;
  /**
   * Spearman rank correlation between this input's draw and the headline KPI.
   *
   * Rank rather than linear, so a monotone non-linear response still reads at
   * full strength; signed, so the DIRECTION is visible — a negative
   * correlation on WACC is the model discounting cost flows, not an error.
   */
  rankCorrelation: number;
}

export interface UncertaintyResult {
  draws: number;
  seed: number;
  bands: Record<string, KpiBand>;
  importance: InputImportance[];
  /** True when no input moved the headline at all — see `degenerate` below. */
  degenerate: boolean;
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
 * THE ENDPOINTS ARE ORDERED FIRST, which is load-bearing. A band whose `low`
 * holds the numerically larger value — the corridor bundle's `scaleExponent`
 * descends deliberately, against fifteen ascending siblings — would otherwise
 * be inverted silently while still returning plausible numbers. The
 * uncertainty dataset's own schema enforces `low <= high`, so this is a second
 * line of defence rather than the only one.
 */
export function triangular(low: number, mode: number, high: number, u: number): number {
  const a = Math.min(low, high);
  const b = Math.max(low, high);
  const m = Math.min(Math.max(mode, a), b);
  if (b <= a) return a;
  const f = (m - a) / (b - a);
  return u < f
    ? a + Math.sqrt(u * (b - a) * (m - a))
    : b - Math.sqrt((1 - u) * (b - a) * (b - m));
}

/** Uniform draw, endpoints ordered for the same reason. */
export function uniform(low: number, high: number, u: number): number {
  const a = Math.min(low, high);
  const b = Math.max(low, high);
  return a + (b - a) * u;
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
 * Ranks with ties averaged — required for Spearman to be correct.
 *
 * A degenerate input (every draw identical, e.g. a zero-width range) produces
 * all-equal ranks, zero variance and a 0/0 correlation. That is reported as 0
 * rather than NaN: "no measured relationship" is the honest reading, and NaN
 * would poison a sort.
 */
function ranks(values: readonly number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]!.v === order[i]!.v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k]!.i] = avg;
    i = j + 1;
  }
  return out;
}

/** Spearman rank correlation. Returns 0 when either side has no variance. */
export function spearman(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length < 2) return 0;
  const ra = ranks(a);
  const rb = ranks(b);
  const n = ra.length;
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / n;
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = ra[i]! - ma;
    const y = rb[i]! - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  if (da === 0 || db === 0) return 0;
  return num / Math.sqrt(da * db);
}

/**
 * Run the Monte Carlo.
 *
 * `evaluate` takes a mutated scenario and returns the KPI vector; the caller
 * owns resolution and the reference bundle, so this module reads no data and
 * touches no I/O.
 *
 * Each draw applies EVERY input, so interactions are in the sample by
 * construction. Coupled groups arrive as a single `SampledInput` whose
 * `apply` moves all its members together — that is what keeps the drawn
 * corridor physically consistent.
 */
export function runUncertainty(
  scenario: ScenarioInput,
  inputs: readonly SampledInput[],
  evaluate: (s: ScenarioInput) => Record<string, number>,
  kpiIds: readonly string[],
  headlineKpi: string,
  options: { draws?: number; seed?: number } = {},
): UncertaintyResult {
  const draws = Math.max(1, Math.floor(options.draws ?? 4000));
  const seed = options.seed ?? 1;
  const next = rng(seed);

  const deterministic = evaluate(JSON.parse(JSON.stringify(scenario)) as ScenarioInput);
  const samples: Record<string, number[]> = {};
  for (const k of kpiIds) samples[k] = [];
  const drawn: Record<string, number[]> = {};
  for (const inp of inputs) drawn[inp.id] = [];

  for (let d = 0; d < draws; d++) {
    const copy = JSON.parse(JSON.stringify(scenario)) as ScenarioInput;
    for (const inp of inputs) {
      const u = next();
      const value =
        inp.mode === undefined
          ? uniform(inp.low, inp.high, u)
          : triangular(inp.low, inp.mode, inp.high, u);
      drawn[inp.id]!.push(value);
      inp.apply(copy, value);
    }
    const kpis = evaluate(copy);
    for (const k of kpiIds) samples[k]!.push(kpis[k] ?? Number.NaN);
  }

  const bands: Record<string, KpiBand> = {};
  for (const k of kpiIds) {
    const sorted = [...samples[k]!].sort((x, y) => x - y);
    bands[k] = {
      p10: percentileOf(sorted, 10),
      p50: percentileOf(sorted, 50),
      p90: percentileOf(sorted, 90),
      mean: sorted.reduce((s, v) => s + v, 0) / (sorted.length || 1),
      deterministic: deterministic[k] ?? Number.NaN,
    };
  }

  const head = samples[headlineKpi] ?? [];
  const importance = inputs
    .map((inp) => ({ id: inp.id, rankCorrelation: spearman(drawn[inp.id]!, head) }))
    .sort((a, b) => Math.abs(b.rankCorrelation) - Math.abs(a.rankCorrelation));

  // Relative, so it does not depend on the corridor's size. A spread below a
  // millionth of the level is arithmetic noise, not a distribution — and a
  // degenerate run must SAY so rather than render a confident-looking spike.
  const sortedHead = [...head].sort((x, y) => x - y);
  const spread = (sortedHead[sortedHead.length - 1] ?? 0) - (sortedHead[0] ?? 0);
  const level = Math.abs(deterministic[headlineKpi] ?? 0);

  return {
    draws,
    seed,
    bands,
    importance,
    degenerate: !(Math.abs(spread) > level * 1e-6),
  };
}
