/**
 * "Benefit" color scale over a FIXED LCOH domain of 2.5–8 USD/kg (clamped
 * outside): green = cheap/best, yellow = mid, orange/red = expensive.
 * Identical everywhere — never rescaled to the viewport — so colors are
 * comparable across regions and zoom levels.
 *
 * Calibration: evenly spread stops so subtle differences in the world-class
 * band stay visible — Magallanes wind ~3.4 reads deep green, Atacama solar
 * ~4.6 mid green, central-Chile ~5.2 light green approaching yellow (5.5),
 * red is the expensive tail (8+).
 */

export const LCOH_DOMAIN: readonly [number, number] = [2.5, 8];

/**
 * Scale stops: LCOH value (USD/kg) → RGB. Piecewise-linear in between.
 * Deliberately saturated (the hex layer renders at ~75 % opacity, which
 * washes pastels out) with strongly separated greens and a wide yellow band.
 */
const STOPS: readonly [number, readonly [number, number, number]][] = [
  [2.5, [5, 110, 51]], // #056e33 dark forest green
  [3.5, [47, 158, 79]], // #2f9e4f clear green
  [4.5, [142, 203, 67]], // #8ecb43 yellow-green
  [5.25, [245, 213, 37]], // #f5d525 strong yellow
  [6.0, [245, 155, 45]], // #f59b2d orange
  [7.0, [232, 84, 46]], // #e8542e orange-red
  [8.0, [200, 31, 31]], // #c81f1f red
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
