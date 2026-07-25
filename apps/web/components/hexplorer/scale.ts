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
 * Benefit ramp, evenly spaced by position (0 = cheapest, 1 = dearest):
 * green → blue → yellow → red. Blue is the "moderately cheap" band between
 * best-green and mid-yellow.
 */
const RAMP: readonly (readonly [number, number, number])[] = [
  [21, 163, 74], // #15a34a green — cheapest / best
  [37, 99, 235], // #2563eb blue — moderately cheap
  [245, 205, 30], // #f5cd1e yellow — mid
  [220, 38, 38], // #dc2626 red — most expensive
];

function rampAt(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const f = x - i;
  const a = RAMP[i]!;
  const b = RAMP[i + 1]!;
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

/** LCOH value (USD/kg) on a given layer → RGB, clamped to the layer's domain. */
export function lcohColor(value: number, layer: LayerKey): [number, number, number] {
  const [lo, hi] = LAYER_DOMAIN[layer];
  return rampAt((value - lo) / (hi - lo));
}

/** CSS gradient of the ramp (green left → red right); domain-independent. */
export function lcohGradientCss(): string {
  const stops = RAMP.map(
    ([r, g, b], i) =>
      `rgb(${r} ${g} ${b}) ${((i / (RAMP.length - 1)) * 100).toFixed(1)}%`,
  );
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

/** Legend tick labels for a layer: [low, mid, high] of its domain, USD/kg. */
export function domainLabels(layer: LayerKey): [string, string, string] {
  const [lo, hi] = LAYER_DOMAIN[layer];
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return [`≤${fmt(lo)}`, fmt((lo + hi) / 2), `${fmt(hi)}+`];
}
