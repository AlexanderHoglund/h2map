/**
 * Rank-diff harness support: geography bucketing and rank-fidelity metrics.
 *
 * The harness measures what matters for a *screening* map — whether a model
 * change reorders the shortlist — not absolute accuracy. All metrics compare a
 * candidate LCOH vector against a persisted baseline over the same benchmark
 * cells, per layer and per cost year.
 */

import type { LCOHDecomposition } from "@h2map/lcoh-engine";

export type Layer = "best" | "solar" | "wind";
export const LAYERS: readonly Layer[] = ["best", "solar", "wind"];
export const COST_YEARS = [2024, 2030, 2040, 2050] as const;

/** Geography buckets the benchmark is stratified across (spec Task 0). */
export type Bucket =
  | "high_elevation"
  | "high_latitude"
  | "strong_wind"
  | "strong_solar"
  | "mid_latitude_wind"
  | "other";

export interface BenchCell {
  h3: string;
  lat: number;
  lon: number;
  elevationM: number;
  solarCf: number | null;
  windCf: number | null;
  bucket: Bucket;
}

/**
 * Assign a primary bucket. Priority order puts the geographies most sensitive
 * to the planned P0 fixes first (elevation → air density; latitude → PVGIS
 * seam), then resource character (from the cached capacity factors).
 */
export function classify(
  lat: number,
  elevationM: number,
  solarCf: number | null,
  windCf: number | null,
): Bucket {
  if (elevationM >= 2000) return "high_elevation";
  if (Math.abs(lat) >= 55) return "high_latitude";
  if ((windCf ?? 0) >= 0.45) return "strong_wind";
  if ((solarCf ?? 0) >= 0.22) return "strong_solar";
  if (Math.abs(lat) >= 30 && (windCf ?? 0) >= 0.3) return "mid_latitude_wind";
  return "other";
}

/** Average ranks (1 = cheapest), ties share the mean rank. */
export function ranks(values: number[]): number[] {
  const idx = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const r = new Array<number>(values.length);
  let k = 0;
  while (k < idx.length) {
    let j = k;
    while (j + 1 < idx.length && idx[j + 1]!.v === idx[k]!.v) j++;
    const avg = (k + j) / 2 + 1;
    for (let m = k; m <= j; m++) r[idx[m]!.i] = avg;
    k = j + 1;
  }
  return r;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Spearman ρ between two value vectors (via their ranks). */
export function spearman(a: number[], b: number[]): number {
  return pearson(ranks(a), ranks(b));
}

function pearson(a: number[], b: number[]): number {
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    const xa = a[i]! - ma;
    const xb = b[i]! - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  return da === 0 || db === 0 ? 1 : num / Math.sqrt(da * db);
}

/**
 * Kendall τ_b (tie-corrected). O(n²) — fine for a ~500-cell benchmark.
 * τ_b = (C − D) / sqrt((C+D+Ta)(C+D+Tb)).
 */
export function kendallTauB(a: number[], b: number[]): number {
  let c = 0;
  let d = 0;
  let ta = 0;
  let tb = 0;
  const n = a.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const da = a[i]! - a[j]!;
      const db = b[i]! - b[j]!;
      const s = Math.sign(da) * Math.sign(db);
      if (da === 0 && db === 0) continue;
      if (da === 0) ta++;
      else if (db === 0) tb++;
      else if (s > 0) c++;
      else d++;
    }
  }
  const denom = Math.sqrt((c + d + ta) * (c + d + tb));
  return denom === 0 ? 1 : (c - d) / denom;
}

/** Set of the indices ranked in the top-k of `values` (1 = cheapest). */
export function topKSet(values: number[], k: number): Set<number> {
  const order = values
    .map((v, i) => ({ v, i }))
    .sort((x, y) => x.v - y.v)
    .slice(0, k)
    .map((o) => o.i);
  return new Set(order);
}

export interface LayerYearDiff {
  layer: Layer;
  year: number;
  n: number;
  spearman: number;
  kendallTauB: number;
  /** Fraction of the baseline top-50 no longer in the candidate top-50. */
  top50Churn: number;
  /** Fraction of the baseline top-decile retained in the candidate top-decile. */
  topDecileRetention: number;
  meanShift: number;
  meanShiftByBucket: Record<string, number>;
  /**
   * Task 0d — mean per-component delta (USD/kg) across the kept cells. A total
   * that barely moves can hide components that moved and cancelled; this is
   * the field that catches it.
   */
  meanComponentShift?: Record<string, number>;
  largestMovers: {
    h3: string;
    lat: number;
    lon: number;
    elevationM: number;
    bucket: Bucket;
    baseline: number;
    candidate: number;
    delta: number;
    /** Task 0d — per-component delta for this mover (all components). */
    componentDeltas?: Record<string, number>;
  }[];
}

const COMPONENT_KEYS = [
  "electricityPv",
  "electricityWind",
  "electricityGrid",
  "electrolyzerCapex",
  "stackReplacements",
  "electrolyzerOpex",
  "water",
] as const satisfies readonly (keyof LCOHDecomposition)[];

export function diffLayerYear(
  cells: BenchCell[],
  baseline: number[],
  candidate: number[],
  layer: Layer,
  year: number,
  baselineComponents?: (LCOHDecomposition | null)[],
  candidateComponents?: (LCOHDecomposition | null)[],
): LayerYearDiff {
  const n = baseline.length;
  const k50 = Math.min(50, n);
  const baseTop50 = topKSet(baseline, k50);
  const candTop50 = topKSet(candidate, k50);
  let churnHits = 0;
  for (const i of baseTop50) if (!candTop50.has(i)) churnHits++;

  const kDecile = Math.max(1, Math.round(n * 0.1));
  const baseDecile = topKSet(baseline, kDecile);
  const candDecile = topKSet(candidate, kDecile);
  let retained = 0;
  for (const i of baseDecile) if (candDecile.has(i)) retained++;

  const deltas = candidate.map((v, i) => v - baseline[i]!);
  const byBucket: Record<string, number[]> = {};
  for (let i = 0; i < n; i++) {
    (byBucket[cells[i]!.bucket] ??= []).push(deltas[i]!);
  }
  const meanShiftByBucket: Record<string, number> = {};
  for (const [b, xs] of Object.entries(byBucket)) {
    meanShiftByBucket[b] = round(mean(xs), 4);
  }

  // Task 0d — component deltas where BOTH sides carry a decomposition.
  const componentDelta = (i: number): Record<string, number> | undefined => {
    const b = baselineComponents?.[i];
    const c = candidateComponents?.[i];
    if (!b || !c) return undefined;
    const out: Record<string, number> = {};
    for (const k of COMPONENT_KEYS) out[k] = round(c[k] - b[k], 4);
    return out;
  };
  let meanComponentShift: Record<string, number> | undefined;
  if (baselineComponents && candidateComponents) {
    const sums: Record<string, number> = {};
    let m = 0;
    for (let i = 0; i < n; i++) {
      const d = componentDelta(i);
      if (!d) continue;
      m++;
      for (const k of COMPONENT_KEYS) sums[k] = (sums[k] ?? 0) + d[k]!;
    }
    if (m > 0) {
      meanComponentShift = {};
      for (const k of COMPONENT_KEYS) meanComponentShift[k] = round((sums[k] ?? 0) / m, 4);
    }
  }

  const movers = deltas
    .map((delta, i) => ({ i, delta }))
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
    .slice(0, 20)
    .map(({ i, delta }) => ({
      h3: cells[i]!.h3,
      lat: round(cells[i]!.lat, 3),
      lon: round(cells[i]!.lon, 3),
      elevationM: cells[i]!.elevationM,
      bucket: cells[i]!.bucket,
      baseline: round(baseline[i]!, 3),
      candidate: round(candidate[i]!, 3),
      delta: round(delta, 3),
      ...(componentDelta(i) ? { componentDeltas: componentDelta(i) } : {}),
    }));

  return {
    layer,
    year,
    n,
    spearman: round(spearman(baseline, candidate), 5),
    kendallTauB: round(kendallTauB(baseline, candidate), 5),
    top50Churn: round(churnHits / k50, 4),
    topDecileRetention: round(retained / kDecile, 4),
    meanShift: round(mean(deltas), 4),
    meanShiftByBucket,
    ...(meanComponentShift ? { meanComponentShift } : {}),
    largestMovers: movers,
  };
}

/** The top-`k` components of a mover's delta by |Δ|, formatted for report.md. */
export function topComponents(
  componentDeltas: Record<string, number> | undefined,
  k = 2,
): string {
  if (!componentDeltas) return "";
  const top = Object.entries(componentDeltas)
    .filter(([, v]) => v !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, k)
    .map(([key, v]) => `${key} ${v >= 0 ? "+" : ""}${v}`);
  return top.length ? `  [${top.join(", ")}]` : "";
}

export function round(x: number, digits: number): number {
  const p = 10 ** digits;
  return Math.round(x * p) / p;
}
