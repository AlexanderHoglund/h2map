/**
 * Dev-mode chart guard. Not a component — kept out of the chart module so it
 * carries no React import and can be called from the panel's data prep.
 */

/**
 * Dev-mode dominance guard (design note: "one outlier ⇒ separated rendering").
 * Warns when a series' max exceeds 5× its median and the chart is NOT using a
 * separated rendering — the signal that the default rendering is wrong. No-op
 * in production and when `separated` is set.
 */
export function warnIfDominated(
  label: string,
  series: readonly number[],
  { separated }: { separated: boolean },
): void {
  if (process.env.NODE_ENV === "production" || separated) return;
  const vals = series
    .filter((v) => Number.isFinite(v))
    .map((v) => Math.abs(v))
    .sort((a, b) => a - b);
  if (vals.length < 3) return;
  const median = vals[Math.floor(vals.length / 2)]!;
  const max = vals[vals.length - 1]!;
  if (median > 0 && max > 5 * median) {
    console.warn(
      `[chart:${label}] value range is set by a single outlier ` +
        `(max ${max.toFixed(1)} > 5× median ${median.toFixed(1)}). ` +
        `Separate it out — by cost nature, by series, or by axis — instead of ` +
        `compressing every other point into illegibility.`,
    );
  }
}
