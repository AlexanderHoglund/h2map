import { describe, expect, it } from "vitest";
import { validateProfile, PV_PEAK_CF_MIN } from "../src/validate";
import { HOURS_PER_YEAR } from "../src/time";

/**
 * Synthetic PV profile: a clean diurnal sine of amplitude `peak`, zero at night,
 * repeated for every 24-hour day of the 8760-hour year. ~11 daylight hours/day.
 */
function pvProfile(peak: number): number[] {
  const cf: number[] = [];
  for (let i = 0; i < HOURS_PER_YEAR; i++) {
    const h = i % 24;
    const day = h >= 6 && h <= 18 ? peak * Math.sin((Math.PI * (h - 6)) / 12) : 0;
    cf.push(Math.max(0, day));
  }
  return cf;
}

/** Synthetic wind profile with genuine hour-to-hour variation. */
function windProfile(mean: number, amp: number): number[] {
  const cf: number[] = [];
  for (let i = 0; i < HOURS_PER_YEAR; i++) {
    cf.push(Math.min(1, Math.max(0, mean + amp * Math.sin(i / 7) * Math.cos(i / 53))));
  }
  return cf;
}

describe("validateProfile — PV", () => {
  it("passes a physical PV profile", () => {
    const v = validateProfile(pvProfile(0.82), "pv_fixed", 2.7);
    expect(v.ok).toBe(true);
    expect(v.reasons).toEqual([]);
    expect(v.metrics.peakCf).toBeCloseTo(0.82, 2);
    expect(v.metrics.nonZeroHours).toBeGreaterThan(3600);
  });

  it("rejects the Kenya SARAH3 artifact (peak ~0.39)", () => {
    const v = validateProfile(pvProfile(0.39), "pv_fixed", 0.5);
    expect(v.ok).toBe(false);
    expect(v.reasons.some((r) => r.includes("peak CF"))).toBe(true);
    // Its mean is still in-range — peak is the discriminator, as in the real data.
    expect(v.reasons.some((r) => r.includes("mean CF"))).toBe(false);
  });

  it("rejects an all-zero profile on multiple grounds", () => {
    const v = validateProfile(new Array<number>(HOURS_PER_YEAR).fill(0), "pv_fixed", 0);
    expect(v.ok).toBe(false);
    expect(v.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it("applies the same PV bounds to tracking kinds", () => {
    expect(validateProfile(pvProfile(0.9), "pv_2axis", 0).ok).toBe(true);
    expect(validateProfile(pvProfile(0.39), "pv_1axis", 0).ok).toBe(false);
  });

  it("uses the documented peak floor", () => {
    expect(validateProfile(pvProfile(PV_PEAK_CF_MIN + 0.02), "pv_fixed", 0).ok).toBe(true);
    expect(validateProfile(pvProfile(PV_PEAK_CF_MIN - 0.02), "pv_fixed", 0).ok).toBe(false);
  });
});

describe("validateProfile — wind", () => {
  it("passes a varied wind profile", () => {
    const v = validateProfile(windProfile(0.35, 0.25), "wind_120", 50);
    expect(v.ok).toBe(true);
    expect(v.metrics.distinctValues).toBeGreaterThan(8);
  });

  it("rejects a degenerate constant profile", () => {
    const v = validateProfile(new Array<number>(HOURS_PER_YEAR).fill(0.4), "wind_120", 50);
    expect(v.ok).toBe(false);
    expect(v.reasons.some((r) => r.includes("degenerate"))).toBe(true);
  });

  it("rejects an implausibly high wind mean", () => {
    const v = validateProfile(windProfile(0.9, 0.05), "wind_160", 50);
    expect(v.ok).toBe(false);
    expect(v.reasons.some((r) => r.includes("mean CF"))).toBe(true);
  });
});
