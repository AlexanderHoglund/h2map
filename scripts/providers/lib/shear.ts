/** Fallback wind-shear exponent (neutral conditions, open terrain). */
export const DEFAULT_ALPHA = 1 / 7;

/**
 * Per-hour power-law shear exponent from two measurement heights,
 * α = ln(v_hi/v_lo) / ln(z_hi/z_lo), clamped to [0.05, 0.40]. Falls back to
 * 1/7 when speeds are too small for a meaningful ratio.
 */
export function shearExponent(
  vLo: number,
  zLo: number,
  vHi: number,
  zHi: number,
): number {
  if (vLo <= 0.5 || vHi <= 0.1) return DEFAULT_ALPHA;
  const alpha = Math.log(vHi / vLo) / Math.log(zHi / zLo);
  return Math.min(0.4, Math.max(0.05, alpha));
}

/** Extrapolate wind speed to hub height with a power law. */
export function toHubHeight(
  v: number,
  fromHeightM: number,
  hubHeightM: number,
  alpha: number,
): number {
  return v * Math.pow(hubHeightM / fromHeightM, alpha);
}
