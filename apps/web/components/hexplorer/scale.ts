import type { LayerKey } from "./types";

/**
 * LCOH colour scale: domain 3.5–10 USD/kg, eight stops, red = cheap →
 * green → blue = expensive. Stop colours are sampled from the Chilean
 * reference tool's legend (the national H2 platform's LCOH map).
 *
 * WHY THE FLOOR IS 3.5, NOT 0: no cell on Earth produces hydrogen below
 * ~$3.5/kg at today's costs, so a 0–10 domain spent its whole warm half on
 * values that never occur — real cells (≈$4–12) all landed in the cyan-to-
 * blue top third and the map read as uniformly blue. Starting the domain at
 * the physical floor puts the full ramp across the range that actually
 * varies, which is the map's entire job: showing WHERE differs from where.
 *
 * Two invariants, regardless of ramp:
 *  - The domain is fixed per layer and never rescales to the viewport — a
 *    colour means the same LCOH in Chile as in Chad. (All three layers share
 *    the domain, so it also means the same LCOH across layers.)
 *  - Out-of-range values keep a distinct treatment at both ends: at or past
 *    an end the colour pins to that end's own reserved stop, which no
 *    in-range value below/above the adjacent stop can reach by
 *    interpolation. Previously a $25/kg cell rendered identically to a
 *    mid-ramp $11/kg cell. The bottom bucket is now "≤3.5" — sub-floor
 *    values (a 2050-cost projection, an exceptional cell) still read as
 *    "cheapest", they just stop consuming ramp nobody uses.
 *
 * NOTE: red→green→blue departs from the CVD-safe guidance in style-guide
 * §12/§13. That is a deliberate, feedback-requested match to the reference
 * tool; the legend's numeric ticks stay the non-colour encoding.
 */

/** Domain [cheap, expensive] in USD/kg — floored at the physical minimum. */
export const LAYER_DOMAIN: Record<LayerKey, readonly [number, number]> = {
  best: [3.5, 10],
  wind: [3.5, 10],
  solar: [3.5, 10],
};

/**
 * Stops: [value USD/kg, RGB]. The reference tool's eight colours kept in
 * order and re-spaced across 3.5–10 at their original relative positions,
 * so the ramp's character is unchanged — only the values it spans move.
 */
export const RAMP_STOPS: readonly [number, readonly [number, number, number]][] = [
  [3.5, [237, 19, 19]], // #ED1313 red — ≤3.5, the floor's own bucket
  [4.7, [183, 222, 31]], // #B7DE1F yellow-green
  [5.5, [77, 194, 56]], // #4DC238 green
  [6.4, [20, 218, 181]], // #14DAB5 teal
  [7.1, [21, 215, 237]], // #15D7ED cyan
  [7.9, [27, 149, 237]], // #1B95ED sky blue
  [8.7, [31, 106, 237]], // #1F6AED blue
  [10.0, [40, 19, 237]], // #2813ED deep blue — ≥10, the top's own bucket
];

const DOMAIN_MIN = RAMP_STOPS[0]![0];
const DOMAIN_MAX = RAMP_STOPS[RAMP_STOPS.length - 1]![0];

/** A stop's position along the bar, 0–1 (stops are not evenly spaced). */
export function stopPosition(value: number): number {
  return (value - DOMAIN_MIN) / (DOMAIN_MAX - DOMAIN_MIN);
}

function rampAt(value: number): [number, number, number] {
  // Distinct end treatment: at or beyond an end, pin to that end's own stop
  // — never extrapolate (the old ramp's first stop sat at position 0.05 and
  // sub-domain values extrapolated PAST it, overflowing the blue channel).
  const first = RAMP_STOPS[0]!;
  const last = RAMP_STOPS[RAMP_STOPS.length - 1]!;
  if (value <= first[0]) return [first[1][0], first[1][1], first[1][2]];
  if (value >= last[0]) return [last[1][0], last[1][1], last[1][2]];
  for (let i = 0; i < RAMP_STOPS.length - 1; i += 1) {
    const [v0, a] = RAMP_STOPS[i]!;
    const [v1, b] = RAMP_STOPS[i + 1]!;
    if (value <= v1) {
      const f = v1 === v0 ? 0 : (value - v0) / (v1 - v0);
      return [
        Math.round(a[0] + (b[0] - a[0]) * f),
        Math.round(a[1] + (b[1] - a[1]) * f),
        Math.round(a[2] + (b[2] - a[2]) * f),
      ];
    }
  }
  return [last[1][0], last[1][1], last[1][2]];
}

/** LCOH value (USD/kg) on a given layer → RGB, clamped to the layer's domain. */
export function lcohColor(value: number, layer: LayerKey): [number, number, number] {
  const [lo, hi] = LAYER_DOMAIN[layer];
  // All layers currently share the ramp's own domain (making this an
  // identity), but the per-layer normalisation keeps any future
  // layer-specific domain a one-line change here.
  const f = (value - lo) / (hi - lo);
  return rampAt(DOMAIN_MIN + f * (DOMAIN_MAX - DOMAIN_MIN));
}

/** CSS gradient of the ramp (red left → deep blue right), value-positioned. */
export function lcohGradientCss(): string {
  const stops = RAMP_STOPS.map(
    ([v, [r, g, b]]) =>
      `rgb(${r} ${g} ${b}) ${(stopPosition(v) * 100).toFixed(1)}%`,
  );
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

/**
 * Legend tick labels: every stop, with "≤"/"≥" marking the two closed
 * buckets at the ends — the floor is a real boundary now, not just 0.
 */
export function domainLabels(layer: LayerKey): string[] {
  const [lo, hi] = LAYER_DOMAIN[layer];
  return RAMP_STOPS.map(([v]) =>
    v <= lo ? `≤${v.toFixed(1)}` : v >= hi ? `≥${v.toFixed(1)}` : v.toFixed(1),
  );
}
