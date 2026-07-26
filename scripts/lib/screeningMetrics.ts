/**
 * Screening-relevant validation metrics (P2 #8). A global Spearman ρ hides what
 * a user actually does with the tool — shortlist the best few sites. ρ = 0.85
 * still implies ~17 % pairwise discordance, so these report how well the
 * shortlist itself survives: precision@k on the cheapest-k sites, top-decile
 * retention, and Kendall τ_b with a bootstrap confidence interval.
 *
 * "Best" = lowest LCOH, so top-k means the k smallest values.
 */

/** Indices of the k smallest values (ties broken by index for determinism). */
function bottomKIndices(xs: readonly number[], k: number): Set<number> {
  const order = xs
    .map((x, i) => ({ x, i }))
    .sort((a, b) => a.x - b.x || a.i - b.i)
    .slice(0, k)
    .map((o) => o.i);
  return new Set(order);
}

/** Fraction of the published cheapest-k sites the model also ranks in its cheapest-k. */
export function precisionAtK(
  published: readonly number[],
  computed: readonly number[],
  k: number,
): number {
  const kk = Math.min(k, published.length);
  if (kk === 0) return NaN;
  const pub = bottomKIndices(published, kk);
  const comp = bottomKIndices(computed, kk);
  let hit = 0;
  for (const i of pub) if (comp.has(i)) hit++;
  return hit / kk;
}

/** Precision at the top decile (k = ceil(n/10)). */
export function topDecileRetention(
  published: readonly number[],
  computed: readonly number[],
): number {
  return precisionAtK(published, computed, Math.max(1, Math.ceil(published.length / 10)));
}

/** Kendall τ_b on raw values (handles ties in either series). */
export function kendallTauB(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  let concordant = 0;
  let discordant = 0;
  let tiesA = 0;
  let tiesB = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const da = a[i]! - a[j]!;
      const db = b[i]! - b[j]!;
      const s = Math.sign(da) * Math.sign(db);
      if (s > 0) concordant++;
      else if (s < 0) discordant++;
      else {
        if (da === 0) tiesA++;
        if (db === 0) tiesB++;
      }
    }
  }
  const n0 = (n * (n - 1)) / 2;
  const denom = Math.sqrt((n0 - tiesA) * (n0 - tiesB));
  return denom === 0 ? 0 : (concordant - discordant) / denom;
}

/** Deterministic PRNG (mulberry32) so the bootstrap CI is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TauWithCI {
  tau: number;
  ci95: [number, number];
  resamples: number;
}

/** Kendall τ_b with a percentile bootstrap 95 % CI (paired resampling). */
export function kendallTauBWithCI(
  published: readonly number[],
  computed: readonly number[],
  resamples = 2000,
  seed = 0x51ffed,
): TauWithCI {
  const n = published.length;
  const tau = kendallTauB(published, computed);
  const rng = mulberry32(seed);
  const taus: number[] = [];
  const pa = new Array<number>(n);
  const pb = new Array<number>(n);
  for (let r = 0; r < resamples; r++) {
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rng() * n);
      pa[i] = published[idx]!;
      pb[i] = computed[idx]!;
    }
    taus.push(kendallTauB(pa, pb));
  }
  taus.sort((x, y) => x - y);
  const lo = taus[Math.floor(0.025 * resamples)]!;
  const hi = taus[Math.min(resamples - 1, Math.floor(0.975 * resamples))]!;
  return { tau, ci95: [lo, hi], resamples };
}
