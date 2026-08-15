/**
 * Pure tests for the Explorer LCOH colour scale: the ramp spans the range
 * hydrogen costs actually occupy — 3.5–10 USD/kg, eight stops, red = cheap
 * → blue = expensive — and BOTH ends keep a distinct out-of-range
 * treatment. Browserless: imports the module directly, like the animation
 * geometry specs.
 *
 * The floor is the load-bearing part: at 0 the warm half of the ramp
 * covered values no cell on Earth reaches, so real cells (≈$4–12) all
 * rendered cyan-to-blue and the map read as uniformly blue.
 */

import { expect, test } from "@playwright/test";
import {
  domainLabels,
  isReducedFidelity,
  LAYER_DOMAIN,
  lcohColor,
  lcohGradientCss,
  RAMP_STOPS,
  stopPosition,
} from "../apps/web/components/hexplorer/scale";
import type { LayerKey } from "../apps/web/components/hexplorer/types";

const LAYERS = Object.keys(LAYER_DOMAIN) as LayerKey[];

test("eight stops over the 3.5-10 domain, on every layer", () => {
  expect(RAMP_STOPS.length).toBe(8);
  expect(RAMP_STOPS.map(([v]) => v)).toEqual([3.5, 4.7, 5.5, 6.4, 7.1, 7.9, 8.7, 10]);
  for (const layer of LAYERS) {
    expect(LAYER_DOMAIN[layer]).toEqual([3.5, 10]);
  }
  // Stop positions strictly increase; channels are valid bytes.
  let prev = -1;
  for (const [v, rgb] of RAMP_STOPS) {
    expect(v).toBeGreaterThan(prev);
    prev = v;
    for (const c of rgb) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(255);
    }
  }
});

test("red at the cheap end, deep blue at the dear end", () => {
  const [first, last] = [RAMP_STOPS[0]!, RAMP_STOPS[RAMP_STOPS.length - 1]!];
  // Red: dominant red channel. Deep blue: dominant blue channel.
  expect(first[1][0]).toBeGreaterThan(first[1][2]);
  expect(last[1][2]).toBeGreaterThan(last[1][0]);
  expect(lcohColor(3.5, "best")).toEqual([...first[1]]);
  expect(lcohColor(10, "best")).toEqual([...last[1]]);
});

test("the working range spends the WHOLE ramp, not just its blue third", () => {
  // The regression this domain exists to prevent: on 0–10 every one of
  // these landed past the cyan stop. Now $4–9 crosses warm, green and
  // blue, and adjacent dollar values are visibly different colours.
  const warm = lcohColor(4.5, "best");
  const mid = lcohColor(6.5, "best");
  const cold = lcohColor(9, "best");
  expect(warm[0]).toBeGreaterThan(warm[2]); // $4.5 reads warm…
  expect(cold[2]).toBeGreaterThan(cold[0]); // …$9 reads blue
  expect(mid).not.toEqual(warm);
  expect(mid).not.toEqual(cold);
  // A $1 step anywhere in the working range changes the colour.
  for (const v of [4, 5, 6, 7, 8]) {
    expect(lcohColor(v, "best")).not.toEqual(lcohColor(v + 1, "best"));
  }
});

test("out-of-range values pin to their end's reserved stop, distinctly", () => {
  for (const layer of LAYERS) {
    // Below the floor: exactly the red stop — never an extrapolation (the
    // old ramp overflowed the blue channel below its first stop). A
    // 2050-cost projection at $2.8 still reads "cheapest".
    expect(lcohColor(2.8, layer)).toEqual(lcohColor(3.5, layer));
    expect(lcohColor(-1, layer)).toEqual(lcohColor(3.5, layer));
    expect(lcohColor(0, layer)).toEqual(lcohColor(3.5, layer));
    // Above the ceiling: $25 renders as the SAME reserved top colour as $11
    // (both are "≥10"), and that colour differs from every in-range stop
    // below it — a maxed cell can no longer impersonate a mid-ramp one.
    expect(lcohColor(25, layer)).toEqual(lcohColor(11, layer));
    expect(lcohColor(25, layer)).toEqual(lcohColor(10, layer));
    expect(lcohColor(25, layer)).not.toEqual(lcohColor(8.7, layer));
    expect(lcohColor(25, layer)).not.toEqual(lcohColor(9.5, layer));
  }
});

test("legend labels close BOTH buckets; gradient spans the full bar", () => {
  for (const layer of LAYERS) {
    expect(domainLabels(layer)).toEqual([
      "≤3.5", "4.7", "5.5", "6.4", "7.1", "7.9", "8.7", "≥10.0",
    ]);
  }
  // Tick/gradient positions run 0→100% of the bar, so no stop sits off it.
  expect(stopPosition(3.5)).toBeCloseTo(0, 9);
  expect(stopPosition(10)).toBeCloseTo(1, 9);
  const css = lcohGradientCss();
  expect(css).toContain("0.0%");
  expect(css).toContain("100.0%");
});

// --- reduced-fidelity disclosure (T2) --------------------------------------
// 2.2% of wind cells are served by NASA POWER: a generic turbine curve with
// fixed 1/7 shear and neither the air-density correction nor the per-site IEC
// class selection the Open-Meteo path applies. Adjacent hexes computed by
// categorically different models are a seam; the map's rule is to disclose a
// seam, never smooth it over. THE regression this guards: a fallback cell
// rendering indistinguishably from an improved one.

test("a fallback-wind cell is never undistinguished from an improved one", () => {
  // Same LCOH, different model → the fill is identical BY DESIGN (a colour
  // means one LCOH on every view), so the distinction must come from
  // elsewhere — which is exactly what this predicate drives.
  expect(lcohColor(7.5, "wind")).toEqual(lcohColor(7.5, "wind"));
  expect(isReducedFidelity("wind", "fallback")).toBe(true);
  expect(isReducedFidelity("wind", "improved")).toBe(false);
  // Null = no recompute pass has recorded provenance yet: not a claim of
  // fidelity, so it must not be flagged as reduced.
  expect(isReducedFidelity("wind", null)).toBe(false);
});

test("the flag follows the wind model onto the best layer, only when wind won", () => {
  // Best-of-mix: the wind model's fidelity matters only if wind is in the
  // winning mix. A solar-only best beside a fallback wind cell is fine.
  expect(isReducedFidelity("best", "fallback", 200)).toBe(true);
  expect(isReducedFidelity("best", "fallback", 0)).toBe(false);
  expect(isReducedFidelity("best", "fallback", null)).toBe(false);
  expect(isReducedFidelity("best", "improved", 200)).toBe(false);
});

test("the solar layer and the PV database tier are never fidelity flags", () => {
  // Solar carries no fallback model at all — PVGIS-or-no-data.
  expect(isReducedFidelity("solar", "fallback", 200)).toBe(false);
  // And pv_db_tier is coverage, not quality: outside the Meteosat disc ERA5
  // is the ONLY database PVGIS v5_3 offers, and where both exist they agree
  // within a few percent in either direction. It is shown in the drawer and
  // deliberately absent from this predicate's signature.
  expect(isReducedFidelity.length).toBe(3);
});
