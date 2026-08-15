import { describe, expect, it } from "vitest";
import {
  fisherReal,
  toRealRate,
  type InflationAssumption,
  type QuotedRate,
} from "./discountBasis";
import { PROFILES } from "./profiles";

const IDR_INFLATION: InflationAssumption = {
  value: 0.0282,
  currency: "IDR",
  sourceYear: 2026,
  source: "test",
};

const nominalIdr: QuotedRate = {
  value: 0.094,
  basis: "nominal",
  currency: "IDR",
  sourceYear: 2024,
  technology: "utility-scale solar PV",
  source: "test",
};

describe("fisherReal", () => {
  it("uses the exact form, not the r - i approximation", () => {
    // 9.4% nominal against 2.82% inflation: exact 6.3995%, approx 6.58%.
    // The 18 bp gap is why the exact form matters — it propagates into
    // every discounted cashflow in a 20-year DCF.
    expect(fisherReal(0.094, 0.0282)).toBeCloseTo(0.0639953, 7);
    expect(fisherReal(0.094, 0.0282)).not.toBeCloseTo(0.094 - 0.0282, 4);
  });

  it("is the identity at zero inflation", () => {
    expect(fisherReal(0.094, 0)).toBeCloseTo(0.094, 12);
  });
});

describe("toRealRate", () => {
  it("passes a real rate through untouched", () => {
    const real: QuotedRate = { ...nominalIdr, basis: "real" };
    expect(toRealRate(real, undefined)).toBe(0.094);
  });

  it("converts a nominal rate with matching-currency inflation", () => {
    expect(toRealRate(nominalIdr, IDR_INFLATION)).toBeCloseTo(0.0639953, 7);
  });

  it("refuses a nominal rate with no inflation assumption", () => {
    // The silent-failure case this module exists to prevent.
    expect(() => toRealRate(nominalIdr, undefined)).toThrow(/nominal/);
  });

  it("refuses to deflate across currencies", () => {
    const usd: InflationAssumption = { ...IDR_INFLATION, currency: "USD" };
    expect(() => toRealRate(nominalIdr, usd)).toThrow(/currencies must match/);
  });
});

describe("stored country profiles", () => {
  // The guard the review asked for: no rate may enter the system without a
  // declared basis. This runs over every profile, so a new country cannot
  // reintroduce the bug by copying an older profile that predates the field.
  it("declare a basis for every cost of capital", () => {
    for (const profile of PROFILES) {
      const wacc = profile.fields.wacc_curated;
      if (!wacc) continue;
      expect(
        wacc.rate,
        `${profile.iso2}: wacc_curated must carry a QuotedRate`,
      ).toBeDefined();
      expect(["real", "nominal"]).toContain(wacc.rate!.basis);
      expect(wacc.rate!.currency).toMatch(/^[A-Z]{3}$/);
      expect(wacc.rate!.sourceYear).toBeGreaterThan(2000);
      expect(wacc.rate!.technology.length).toBeGreaterThan(0);
    }
  });

  it("supply a matching inflation assumption wherever a rate is nominal", () => {
    for (const profile of PROFILES) {
      const wacc = profile.fields.wacc_curated;
      if (!wacc?.rate || wacc.rate.basis !== "nominal") continue;
      expect(
        profile.inflation,
        `${profile.iso2}: nominal rate needs an inflation assumption`,
      ).toBeDefined();
      expect(profile.inflation!.currency).toBe(wacc.rate.currency);
      // And the stored value must actually be the converted one.
      expect(wacc.value).toBeCloseTo(
        toRealRate(wacc.rate, profile.inflation),
        10,
      );
    }
  });
});
