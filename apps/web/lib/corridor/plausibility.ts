/**
 * Field-level plausibility: is the user's number credible against its
 * benchmark? ADVISORY ONLY — the model computes whatever is typed; this
 * layer exists so a $0/t fuel price or a $/kg-typed-as-$/t figure gets a
 * quiet amber note instead of silent acceptance (Excel's "Warning" tier,
 * never its "Stop").
 */

/** "Order of magnitude-ish" deviation from the benchmark worth a note. */
export const PLAUSIBILITY_RATIO = 5;

export type Plausibility = "zero" | "low" | "high" | null;

/**
 * Only the USER's number warns (override; derived/benchmark values are the
 * model's own), and only against a positive, finite benchmark — a zero
 * benchmark (fossil-side port rules, zero-cost rows) is no yardstick, so
 * those fields stay silent by construction.
 */
export function plausibility(
  override: number | null,
  benchmark: number,
): Plausibility {
  if (override === null) return null;
  if (!Number.isFinite(benchmark) || benchmark <= 0) return null;
  if (override <= 0) return "zero";
  const r = override / benchmark;
  if (r > PLAUSIBILITY_RATIO) return "high";
  if (r < 1 / PLAUSIBILITY_RATIO) return "low";
  return null;
}
