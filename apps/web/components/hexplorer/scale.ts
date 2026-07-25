import type { LayerKey } from "./types";

/**
 * "Benefit" color ramp (green = cheap/best → red = expensive), applied over a
 * PER-LAYER fixed domain. The layers measure different things once each cell's
 * electricity is CAPEX-priced from its own capacity factor: solar-only is
 * inherently costlier than the best solar+wind mix, and wind-only has a long
 * poor-resource tail. One shared domain would paint solar all-red and waste
 * the wind range, so each layer gets a domain fit to its own distribution
 * (~p5→p95 of the seeded world). Colors are still globally fixed within a
 * layer — never rescaled to the viewport — so a color means the same LCOH
 * everywhere on that layer; switching layers switches the reference frame
 * (the legend shows each layer's bounds).
 */

/**
 * Domain [cheap, expensive] in USD/kg per layer. All floor at 2.5 so the
 * cheapest cells — especially the projected 2050 maps that dip below 3 —
 * land in the blue "exceptional" band; the per-layer ceilings keep each
 * layer's spread readable (solar-only runs dearer than the best mix).
 */
export const LAYER_DOMAIN: Record<LayerKey, readonly [number, number]> = {
  best: [2.5, 8.5],
  wind: [2.5, 10],
  solar: [2.5, 11],
};

/**
 * Benefit ramp as positioned stops (0 = cheapest, 1 = dearest):
 * blue → green → light-green → yellow → orange → red. Blue occupies only
 * the bottom ~10 % so it flags the exceptional cheapest cells (≈ ≤3 USD/kg —
 * mostly the projected later years); the rest is the normal green→red body.
 */
const RAMP: readonly [number, readonly [number, number, number]][] = [
  [0.05, [37, 99, 235]], // #2563eb blue — exceptional (most extreme cheap)
  [0.1, [26, 152, 80]], // #1a9850 green — best / cheap
  [0.50, [166, 217, 106]], // #a6d96a light green
  [0.65, [245, 205, 30]], // #f5cd1e yellow — mid
  [0.8, [245, 155, 45]], // #f59b2d orange
  [1.0, [215, 48, 39]], // #d73027 red — most expensive
];

function rampAt(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 0; i < RAMP.length - 1; i += 1) {
    const [p0, a] = RAMP[i]!;
    const [p1, b] = RAMP[i + 1]!;
    if (x <= p1) {
      const f = p1 === p0 ? 0 : (x - p0) / (p1 - p0);
      return [
        Math.round(a[0] + (b[0] - a[0]) * f),
        Math.round(a[1] + (b[1] - a[1]) * f),
        Math.round(a[2] + (b[2] - a[2]) * f),
      ];
    }
  }
  const last = RAMP[RAMP.length - 1]![1];
  return [last[0], last[1], last[2]];
}

/** LCOH value (USD/kg) on a given layer → RGB, clamped to the layer's domain. */
export function lcohColor(value: number, layer: LayerKey): [number, number, number] {
  const [lo, hi] = LAYER_DOMAIN[layer];
  return rampAt((value - lo) / (hi - lo));
}

/** CSS gradient of the ramp (blue/green left → red right); domain-independent. */
export function lcohGradientCss(): string {
  const stops = RAMP.map(
    ([pos, [r, g, b]]) => `rgb(${r} ${g} ${b}) ${(pos * 100).toFixed(1)}%`,
  );
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

/** Legend tick labels for a layer: [low, mid, high] of its domain, USD/kg. */
export function domainLabels(layer: LayerKey): [string, string, string] {
  const [lo, hi] = LAYER_DOMAIN[layer];
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return [`≤${fmt(lo)}`, fmt((lo + hi) / 2), `${fmt(hi)}+`];
}
