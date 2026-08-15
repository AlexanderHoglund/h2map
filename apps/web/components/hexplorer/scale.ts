import type { LayerKey } from "./types";

/**
 * LCOH colour scale: domain 3.5–14 USD/kg, eleven stops, red = cheap →
 * green → blue = expensive. Stop colours are sampled from the Chilean
 * reference tool's legend (the national H2 platform's LCOH map).
 *
 * WHY THE DOMAIN IS 3.5–14, NOT 0–10 — both ends were wrong for the same
 * reason: the ramp was spending its resolution where cells are not.
 *
 * - The FLOOR. No cell on Earth produces hydrogen below ~$3.5/kg at today's
 *   costs, so the whole warm half of a 0–10 domain covered values that never
 *   occur.
 * - The CEILING. Real cells run to ~$15.5 (measured: the Indonesian res-3
 *   solar layer spans 9.34–15.48). Against a $10 ceiling every tropical
 *   cell pinned to the top colour, so 177 of the 308 benchmark cells
 *   collapsed into one blue — which is what made “wind always beats solar”
 *   look true when solar in fact wins 84 of 85 Indonesian cells.
 *
 * Eleven stops now: the original eight re-spaced across 3.5–9.5, plus three
 * continuing into blue-violet so the $9–14 band resolves instead of pinning.
 * The extension stays BLUE-DOMINANT (violet, not magenta) so the ramp's
 * cheap-is-warm / dear-is-cool reading survives — a test pins that.
 * Past the ceiling, see NON_VIABLE_ABOVE.
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

/** Domain [cheap, expensive] in USD/kg — the range cells actually occupy. */
export const LAYER_DOMAIN: Record<LayerKey, readonly [number, number]> = {
  best: [3.5, 14],
  wind: [3.5, 14],
  solar: [3.5, 14],
};

/**
 * Above this, a cell is not a hydrogen prospect by any reading — the number
 * is a statement that this technology does not work here. Atacama wind
 * (CF ≈ 0.02) computes 770–1,003 USD/kg; drawing that in the same top-of-ramp
 * colour as a $10.2 cell reads as “expensive” when it means “non-viable”.
 * Such cells get their own neutral style instead of a ramp colour.
 * Configurable: raise it if a future cost pack makes the band meaningful.
 */
export const NON_VIABLE_ABOVE = 25;

/** Neutral fill for the non-viable style — outside the ramp, deliberately. */
export const NON_VIABLE_COLOR: readonly [number, number, number] = [148, 148, 152];

/** Is this value past the non-viability ceiling? */
export function isNonViable(value: number | null | undefined): boolean {
  return value !== null && value !== undefined && value > NON_VIABLE_ABOVE;
}

/**
 * Stops: [value USD/kg, RGB]. The reference tool's eight colours keep their
 * order and relative spacing across 3.5–9.5; three added stops continue the
 * ramp into blue-violet so the $9–14 band resolves.
 */
export const RAMP_STOPS: readonly [number, readonly [number, number, number]][] = [
  [3.5, [237, 19, 19]], // #ED1313 red — ≤3.5, the floor's own bucket
  [4.5, [183, 222, 31]], // #B7DE1F yellow-green
  [5.2, [77, 194, 56]], // #4DC238 green
  [6.0, [20, 218, 181]], // #14DAB5 teal
  [6.7, [21, 215, 237]], // #15D7ED cyan
  [7.5, [27, 149, 237]], // #1B95ED sky blue
  [8.3, [31, 106, 237]], // #1F6AED blue
  [9.5, [40, 19, 237]], // #2813ED deep blue
  [11.0, [86, 22, 191]], // #5616BF violet
  [12.5, [110, 26, 140]], // #6E1A8C purple
  [14.0, [74, 24, 122]], // #4A187A deep indigo — ≥14, the top's own bucket
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

/**
 * Whether a cell's value on THIS layer came from a reduced-fidelity model,
 * and must therefore be rendered distinguishably (T2).
 *
 * Only the wind layers qualify. `wind_fidelity: "fallback"` means NASA
 * POWER served the cell: a generic turbine curve with fixed 1/7 shear and
 * neither the air-density correction nor per-site IEC class selection that
 * the Open-Meteo path applies. Adjacent hexes computed by categorically
 * different models are a seam, and the map's standing rule is that a seam
 * is disclosed rather than smoothed over — PV solves it by rendering
 * no-data, wind by flagging, because here the value is real and the
 * population is small (1.3% of ready cells, measured 2026-08-15) so masking
 * would lose more than it protects.
 *
 * A THIRD state exists and is neither: 37% of ready cells were seeded
 * before the provenance columns and carry `wind_fidelity: null`. They are
 * deliberately not flagged — claiming "fallback" would be as false as
 * claiming "improved" — but that means the map currently renders a
 * substantial population whose wind provenance is simply unknown. The
 * scheduled re-seed stamps each cell as it re-fetches, so the share shrinks
 * on its own; until then the drawer reports the provenance as unrecorded
 * rather than guessing.
 *
 * `pv_db_tier` is deliberately NOT a fidelity signal: outside the Meteosat
 * disc ERA5 is the only radiation database PVGIS v5_3 offers, and where
 * both exist the two agree within a few percent in either direction.
 * Measured over the 3,264-row PV cache, SARAH3 appears ONLY in the +0..60°
 * longitude bands and is absent everywhere else — it tracks the Meteosat
 * disc, not latitude. It is recorded per cell and shown in the drawer, but
 * it does not change how a cell is drawn.
 */
export function isReducedFidelity(
  layer: LayerKey,
  windFidelity: "improved" | "fallback" | null,
  bestWindMw?: number | null,
): boolean {
  if (windFidelity !== "fallback") return false;
  if (layer === "wind") return true;
  // On the "best" layer the flag applies only when wind actually won the
  // mix — a solar-only best is not affected by the wind model's fidelity.
  return layer === "best" && (bestWindMw ?? 0) > 0;
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
