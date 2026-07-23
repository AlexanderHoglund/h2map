/**
 * Viridis color scale over a FIXED LCOH domain of 2–8 USD/kg (clamped outside).
 * Identical everywhere — never rescaled to the viewport — so colors are
 * comparable across regions and zoom levels. Viridis is colorblind-safe.
 */

export const LCOH_DOMAIN: readonly [number, number] = [2, 8];

/** Nine evenly spaced viridis stops (t = 0 … 1). */
const STOPS: readonly [number, number, number][] = [
  [68, 1, 84],
  [71, 44, 122],
  [59, 81, 139],
  [44, 113, 142],
  [33, 144, 141],
  [39, 173, 129],
  [92, 200, 99],
  [170, 220, 50],
  [253, 231, 37],
];

/** Linear interpolation between the hardcoded stops; input is an LCOH value. */
export function viridisColor(value: number): [number, number, number] {
  const [lo, hi] = LCOH_DOMAIN;
  const t = Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
  const x = t * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const f = x - i;
  const a: readonly [number, number, number] = STOPS[i] ?? [68, 1, 84];
  const b: readonly [number, number, number] = STOPS[i + 1] ?? a;
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

/** CSS gradient matching the scale, for the legend bar. */
export function viridisGradientCss(): string {
  const stops = STOPS.map(
    ([r, g, b], i) =>
      `rgb(${r} ${g} ${b}) ${((i / (STOPS.length - 1)) * 100).toFixed(1)}%`,
  );
  return `linear-gradient(to right, ${stops.join(", ")})`;
}
