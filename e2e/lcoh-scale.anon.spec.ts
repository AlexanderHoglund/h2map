/**
 * Pure tests for the Explorer LCOH colour scale (sprint 1.5): the ramp
 * matches the Chilean reference tool — 0–10 USD/kg, eight stops, red =
 * cheap → blue = expensive — and both ends keep a distinct out-of-range
 * treatment. Browserless: imports the module directly, like the animation
 * geometry specs.
 */

import { expect, test } from "@playwright/test";
import {
  domainLabels,
  LAYER_DOMAIN,
  lcohColor,
  RAMP_STOPS,
} from "../apps/web/components/hexplorer/scale";
import type { LayerKey } from "../apps/web/components/hexplorer/types";

const LAYERS = Object.keys(LAYER_DOMAIN) as LayerKey[];

test("eight stops over the reference 0-10 domain, on every layer", () => {
  expect(RAMP_STOPS.length).toBe(8);
  expect(RAMP_STOPS.map(([v]) => v)).toEqual([0, 1.8, 3, 4.5, 5.5, 6.8, 8, 10]);
  for (const layer of LAYERS) {
    expect(LAYER_DOMAIN[layer]).toEqual([0, 10]);
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
  expect(lcohColor(0, "best")).toEqual([...first[1]]);
  expect(lcohColor(10, "best")).toEqual([...last[1]]);
});

test("out-of-range values pin to their end's reserved stop, distinctly", () => {
  for (const layer of LAYERS) {
    // Below the floor: exactly the red stop — never an extrapolation (the
    // old ramp overflowed the blue channel to 390 below its first stop).
    expect(lcohColor(-1, layer)).toEqual(lcohColor(0, layer));
    // Above the ceiling: $25 renders as the SAME reserved top colour as $11
    // (both are "≥10"), and that colour differs from every in-range stop
    // below it — a maxed cell can no longer impersonate a mid-ramp one.
    expect(lcohColor(25, layer)).toEqual(lcohColor(11, layer));
    expect(lcohColor(25, layer)).toEqual(lcohColor(10, layer));
    expect(lcohColor(25, layer)).not.toEqual(lcohColor(8, layer));
    expect(lcohColor(25, layer)).not.toEqual(lcohColor(9.5, layer));
  }
});

test("legend labels are the reference ticks with an open top bucket", () => {
  for (const layer of LAYERS) {
    expect(domainLabels(layer)).toEqual([
      "0.0", "1.8", "3.0", "4.5", "5.5", "6.8", "8.0", "≥10.0",
    ]);
  }
});
