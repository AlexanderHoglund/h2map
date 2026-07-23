/**
 * "Benefit" color scale over a FIXED LCOH domain of 3–8 USD/kg (clamped
 * outside): green = cheap/best, yellow = mid, orange/red = expensive.
 * Identical everywhere — never rescaled to the viewport — so colors are
 * comparable across regions and zoom levels.
 *
 * Calibration: with the 2024 reference configuration nothing on Earth
 * computes below ~3.3 USD/kg, so deep green saturates at ≤3 and world-class
 * sites (Magallanes wind ~3.4, Atacama solar ~4.6) read clearly green;
 * yellow marks the global mid-field (~5.75), red the expensive tail (8+).
 */

export const LCOH_DOMAIN: readonly [number, number] = [3, 8];

/** Scale stops: LCOH value (USD/kg) → RGB. Piecewise-linear in between. */
const STOPS: readonly [number, readonly [number, number, number]][] = [
  [3.0, [26, 152, 80]], // #1a9850
  [4.5, [102, 189, 99]], // #66bd63
  [5.25, [166, 217, 106]], // #a6d96a
  [5.75, [254, 224, 139]], // #fee08b
  [6.5, [253, 174, 97]], // #fdae61
  [7.25, [244, 109, 67]], // #f46d43
  [8.0, [215, 48, 39]], // #d73027
];

const FIRST = STOPS[0] ?? [2, [26, 152, 80] as const];
const LAST = STOPS[STOPS.length - 1] ?? FIRST;

/** Linear interpolation between the hardcoded stops; input is an LCOH value. */
export function lcohColor(value: number): [number, number, number] {
  const [lo, hi] = LCOH_DOMAIN;
  const v = Math.min(hi, Math.max(lo, value));
  for (let i = 0; i < STOPS.length - 1; i += 1) {
    const from = STOPS[i];
    const to = STOPS[i + 1];
    if (!from || !to) break;
    const [p0, a] = from;
    const [p1, b] = to;
    if (v <= p1) {
      const f = p1 === p0 ? 0 : (v - p0) / (p1 - p0);
      return [
        Math.round(a[0] + (b[0] - a[0]) * f),
        Math.round(a[1] + (b[1] - a[1]) * f),
        Math.round(a[2] + (b[2] - a[2]) * f),
      ];
    }
  }
  return [LAST[1][0], LAST[1][1], LAST[1][2]];
}

/** CSS gradient matching the scale (low/green left → high/red right). */
export function lcohGradientCss(): string {
  const [lo, hi] = LCOH_DOMAIN;
  const stops = STOPS.map(
    ([pos, [r, g, b]]) =>
      `rgb(${r} ${g} ${b}) ${(((pos - lo) / (hi - lo)) * 100).toFixed(1)}%`,
  );
  return `linear-gradient(to right, ${stops.join(", ")})`;
}
