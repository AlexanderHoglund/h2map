/**
 * Uncertainty band (realism pass, Task 5) — a screening estimate must not be
 * rendered as a point.
 */

import { describe, expect, it } from "vitest";
import { BAND_DRIVERS, computeBand, type BandSample } from "../src/band";

/** A stand-in cost model: monotonic in each driver, like the real one. */
const model = (s: BandSample) =>
  (s.electrolyserCapex / 2300) * 490 * s.foak +
  278 * (60_000 / 1_200_000) ** (s.scaleExponent - 1) +
  17 * s.firmMultiplier;

describe("computeBand", () => {
  it("brackets the central case", () => {
    const b = computeBand(model);
    expect(b.low).toBeLessThan(b.central);
    expect(b.central).toBeLessThan(b.high);
  });

  it("never inverts when a driver's low RAISES the result", () => {
    // The scale exponent is the trap: a LOWER exponent means a HIGHER
    // specific capital at small scale, so a naive low/high assignment would
    // produce low > high.
    expect(BAND_DRIVERS.scaleExponent.low).toBeGreaterThan(
      BAND_DRIVERS.scaleExponent.high,
    );
    const b = computeBand(model);
    expect(b.low).toBeLessThanOrEqual(b.high);
  });

  it("names the driver contributing most of the spread", () => {
    const b = computeBand(model);
    expect(b.largestDriver).not.toBeNull();
    expect(b.contributions).toHaveLength(4);
    const swings = b.contributions.map((c) => c.swing);
    expect(swings).toEqual([...swings].sort((a, b2) => b2 - a));
    expect(b.contributions[0]!.key).toBe(b.largestDriver);
  });

  it("uses the published ranges, not invented error bars", () => {
    // IEA GHR 2025 ex-China installed range.
    expect(BAND_DRIVERS.electrolyserCapex.low).toBe(2000);
    expect(BAND_DRIVERS.electrolyserCapex.high).toBe(2600);
    expect(BAND_DRIVERS.electrolyserCapex.central).toBe(2300);
    expect(BAND_DRIVERS.foak.central).toBe(1.25); // the foak-dedicated default
  });

  it("is inert for a model that ignores the drivers", () => {
    const flat = computeBand(() => 100);
    expect(flat.low).toBe(100);
    expect(flat.central).toBe(100);
    expect(flat.high).toBe(100);
    expect(flat.contributions.every((c) => c.swing === 0)).toBe(true);
  });
});
