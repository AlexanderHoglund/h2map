import { describe, expect, it } from "vitest";
import { discountFactors, presentValue } from "../src/dcf";
import { expectRel } from "./helpers";

describe("discountFactors", () => {
  it("starts at 1 and declines by 1/(1+r) each year", () => {
    const df = discountFactors(0.08, 3);
    expect(df[0]).toBe(1);
    expectRel(df[1]!, 1 / 1.08, 1e-12);
    expectRel(df[2]!, 1 / 1.08 ** 2, 1e-12);
    expectRel(df[3]!, 1 / 1.08 ** 3, 1e-12);
  });

  it("handles a zero discount rate", () => {
    const df = discountFactors(0, 5);
    expect(Array.from(df)).toEqual([1, 1, 1, 1, 1, 1]);
  });
});

describe("presentValue", () => {
  it("discounts an annual series", () => {
    const df = discountFactors(0.1, 2);
    // 100 at t=0, 110 at t=1, 121 at t=2 → 100 + 100 + 100
    expectRel(presentValue([100, 110, 121], df), 300, 1e-12);
  });
});
