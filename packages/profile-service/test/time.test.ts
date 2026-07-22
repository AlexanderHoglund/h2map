import { describe, expect, it } from "vitest";
import { fillGaps, isLeapYear, trimFeb29 } from "../src/time";

describe("isLeapYear", () => {
  it("handles the Gregorian rules", () => {
    expect(isLeapYear(2016)).toBe(true);
    expect(isLeapYear(2015)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });
});

describe("trimFeb29", () => {
  it("passes 8760-length series through unchanged", () => {
    const series = Array.from({ length: 8760 }, (_, i) => i);
    expect(trimFeb29(series)).toEqual(series);
  });

  it("removes exactly the 24 hours of Feb 29 from a leap year", () => {
    const series = Array.from({ length: 8784 }, (_, i) => i);
    const trimmed = trimFeb29(series);
    expect(trimmed).toHaveLength(8760);
    const feb29Start = (31 + 28) * 24;
    // Last hour of Feb 28 kept, first hour of Mar 1 follows immediately.
    expect(trimmed[feb29Start - 1]).toBe(feb29Start - 1);
    expect(trimmed[feb29Start]).toBe(feb29Start + 24);
    expect(trimmed[8759]).toBe(8783);
  });

  it("rejects other lengths", () => {
    expect(() => trimFeb29([1, 2, 3])).toThrow(/8760 or 8784/);
  });
});

describe("fillGaps", () => {
  it("returns intact series unchanged with zero gaps", () => {
    const { cf, gapHours } = fillGaps([0.1, 0.2, 0.3]);
    expect(cf).toEqual([0.1, 0.2, 0.3]);
    expect(gapHours).toBe(0);
  });

  it("interpolates interior gaps linearly", () => {
    const { cf, gapHours } = fillGaps([0, null, null, null, 1]);
    expect(cf).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(gapHours).toBe(3);
  });

  it("clamps leading and trailing gaps to the nearest known value", () => {
    const { cf, gapHours } = fillGaps([null, null, 0.4, null]);
    expect(cf).toEqual([0.4, 0.4, 0.4, 0.4]);
    expect(gapHours).toBe(3);
  });

  it("zero-fills an all-null series", () => {
    const { cf, gapHours } = fillGaps([null, null]);
    expect(cf).toEqual([0, 0]);
    expect(gapHours).toBe(2);
  });

  it("treats non-finite values as gaps", () => {
    const { cf, gapHours } = fillGaps([0.2, Number.NaN, 0.4]);
    expect(cf[1]).toBeCloseTo(0.3, 12);
    expect(gapHours).toBe(1);
  });
});
