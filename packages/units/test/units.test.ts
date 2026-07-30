import { describe, expect, it } from "vitest";
import { fraction, usdM, usdPerTonne } from "../src/index";

describe("branded constructors", () => {
  it("pass finite values through unchanged", () => {
    expect(usdM(97)).toBe(97);
    expect(usdPerTonne(900)).toBe(900);
    expect(fraction(0.055)).toBe(0.055);
    expect(usdM(0)).toBe(0);
    expect(usdM(-5)).toBe(-5); // sign conventions (45Z credit) are the model's business
  });

  it("reject non-finite values", () => {
    expect(() => usdM(NaN)).toThrowError(TypeError);
    expect(() => usdM(Infinity)).toThrowError(TypeError);
    expect(() => fraction(-Infinity)).toThrowError(TypeError);
  });

  it("brands are non-assignable across units (compile-time)", () => {
    // Type-level check: assigning UsdM to UsdPerTonne must not compile.
    const m = usdM(1);
    // @ts-expect-error UsdM is not assignable to UsdPerTonne
    const p: ReturnType<typeof usdPerTonne> = m;
    expect(p).toBe(1); // runtime identity — the guarantee is purely type-level
  });
});
