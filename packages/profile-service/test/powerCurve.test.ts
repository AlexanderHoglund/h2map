import { describe, expect, it } from "vitest";
import { turbinePowerKw, windCf } from "../src/powerCurve";
import type { TurbineCurve } from "../src/types";

const curve: TurbineCurve = {
  id: "test-1MW",
  ratedKw: 1000,
  speedsMs: [3, 12, 25],
  powerKw: [100, 1000, 1000],
};

describe("turbinePowerKw", () => {
  it("is zero below cut-in and above cut-out", () => {
    expect(turbinePowerKw(curve, 2.9)).toBe(0);
    expect(turbinePowerKw(curve, 25.01)).toBe(0);
    expect(turbinePowerKw(curve, Number.NaN)).toBe(0);
  });

  it("interpolates linearly between samples", () => {
    expect(turbinePowerKw(curve, 3)).toBe(100);
    expect(turbinePowerKw(curve, 7.5)).toBeCloseTo(550, 10);
    expect(turbinePowerKw(curve, 12)).toBe(1000);
    expect(turbinePowerKw(curve, 20)).toBe(1000);
    expect(turbinePowerKw(curve, 25)).toBe(1000);
  });
});

describe("windCf", () => {
  it("normalizes by rated power and clamps to [0, 1]", () => {
    expect(windCf(curve, 12)).toBe(1);
    expect(windCf(curve, 3)).toBeCloseTo(0.1, 12);
    expect(windCf(curve, 26)).toBe(0);
  });

  it("passes null through as a gap", () => {
    expect(windCf(curve, null)).toBeNull();
  });
});
