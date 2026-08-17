/**
 * Hand-computed regulation cases covering the paths the golden fixture does
 * NOT exercise (45Z enabled, self-designed enabled) plus deficit/compliance
 * behaviour, derived from the verbatim workbook formulas (transcription §7).
 */

import { describe, expect, it } from "vitest";
import {
  calendarYear,
  count,
  eurPerTonne,
  eurUsd,
  fraction,
  gCo2ePerMj,
  mjPerTonne,
  tCo2PerTonne,
  tonnesPerVesselYear,
  usdM,
  usdPerGallon,
  usdPerKg,
  usdPerTonne,
} from "@h2map/units";
import type { FuelParams, ScheduleStep } from "@h2map/corridor-schema";
import { etsCostUsdM } from "../src/regulation/ets";
import { fuelEuCostUsdM } from "../src/regulation/fuelEu";
import { ira45zCreditUsdM } from "../src/regulation/ira45z";
import { selfDesignedCostUsdM } from "../src/regulation/selfDesigned";

const step = (y: number, v: number): ScheduleStep => ({
  fromCalendarYear: calendarYear(y),
  value: fraction(v),
});

function fuel(overrides: Partial<Record<keyof FuelParams, number>> = {}): FuelParams {
  return {
    priceUsdPerTonne: usdPerTonne(overrides.priceUsdPerTonne ?? 900),
    combustionEf: tCo2PerTonne(overrides.combustionEf ?? 3),
    // Fossil fixture: chargeable == stack factor. A green fuel would
    // differ, which is what etsCarbonOrigin.test.ts covers.
    etsChargeableEf: tCo2PerTonne(
      overrides.etsChargeableEf ?? overrides.combustionEf ?? 3,
    ),
    lhv: mjPerTonne(overrides.lhv ?? 41000),
    wtw: gCo2ePerMj(overrides.wtw ?? 100),
    tonnesPerVesselYear: tonnesPerVesselYear(overrides.tonnesPerVesselYear ?? 1000),
  };
}

describe("etsCostUsdM (r28/r54)", () => {
  it("multiplies through phase-in, scope and FX", () => {
    // 2 × 1000 t × 3 t/t × 0.7 (2025) × 0.5 × €100 × 1.1 / 1e6 = 0.231
    const cost = etsCostUsdM(
      {
        euaEurPerTonne: eurPerTonne(100),
        eurUsd: eurUsd(1.1),
        scope: fraction(0.5),
        phaseIn: [step(2024, 0.4), step(2025, 0.7), step(2026, 1)],
      },
      fuel(),
      count(2),
      calendarYear(2025),
    );
    expect(cost).toBeCloseTo(0.231, 12);
  });

  it("is zero before the phase-in starts", () => {
    const cost = etsCostUsdM(
      {
        euaEurPerTonne: eurPerTonne(100),
        eurUsd: eurUsd(1.1),
        scope: fraction(1),
        phaseIn: [step(2024, 0.4)],
      },
      fuel(),
      count(1),
      calendarYear(2023),
    );
    expect(cost).toBe(0);
  });
});

describe("fuelEuCostUsdM (r29/r55)", () => {
  const params = {
    penaltyEurPerTonne: eurPerTonne(2400),
    eurUsd: eurUsd(1),
    scope: fraction(1),
    baselineGco2PerMj: gCo2ePerMj(91.16),
    vlsfoMjPerTonne: mjPerTonne(41000),
    targets: [step(2025, 0.02)],
  };

  it("prices the deficit via notional VLSFO mass", () => {
    // 2024 (target 0): deficit = 100 − 91.16 = 8.84 gCO2e/MJ.
    // Energy 1000 t × 41000 MJ/t = 41e6 MJ; /wtw 100 /41000 = 10 t VLSFO-eq
    // per unit intensity; 8.84 × 10 × €2400 × 1 × 1 / 1e6 = 0.21216.
    const cost = fuelEuCostUsdM(params, fuel(), count(1), calendarYear(2024));
    expect(cost).toBeCloseTo((100 - 91.16) * 10 * 2400 / 1e6, 12);
  });

  it("clamps a compliant fuel to exactly zero (the deficit clamp)", () => {
    const cost = fuelEuCostUsdM(params, fuel({ wtw: 15 }), count(1), calendarYear(2035));
    expect(cost).toBe(0);
  });

  it("returns 0 (not NaN) for a zero-emission fuel — no ÷WTW blow-up", () => {
    // A fully renewable fuel (wtw = 0, e.g. the Chilean e-ammonia default) is
    // maximally compliant. The notional-mass conversion divides by WTW, so the
    // compliant clamp must short-circuit BEFORE it — otherwise 0 × Infinity =
    // NaN poisons the whole green side (regression: enabling FuelEU on the
    // Chilean scenario produced $NaN across the results panel).
    const cost = fuelEuCostUsdM(params, fuel({ wtw: 0 }), count(1), calendarYear(2035));
    expect(cost).toBe(0);
    expect(Number.isNaN(cost)).toBe(false);
  });
});

describe("ira45zCreditUsdM (r30)", () => {
  it("is a negative credit scaled by LHV per gallon-equivalent", () => {
    // −1 × 1000 t × (1 $/gal ÷ 122.5 MJ/gal × 18600 MJ/t) / 1e6
    const credit = ira45zCreditUsdM(
      { rateUsdPerGallon: usdPerGallon(1), mjPerGallon: 122.5 },
      fuel({ lhv: 18600 }),
      count(1),
      calendarYear(2030),
    );
    expect(credit).toBeCloseTo(-(1000 * (18600 / 122.5)) / 1e6, 12);
    expect(credit).toBeLessThan(0);
  });

  it("D5: sunsets after effectiveUntil when set; perpetual when absent", () => {
    const params = {
      rateUsdPerGallon: usdPerGallon(1),
      mjPerGallon: 122.5,
      effectiveUntil: calendarYear(2027),
    };
    expect(ira45zCreditUsdM(params, fuel(), count(1), calendarYear(2027))).toBeLessThan(0);
    expect(ira45zCreditUsdM(params, fuel(), count(1), calendarYear(2028))).toBe(0);
    // Workbook behaviour: no sunset field → credit runs forever.
    const noSunset = { rateUsdPerGallon: usdPerGallon(1), mjPerGallon: 122.5 };
    expect(ira45zCreditUsdM(noSunset, fuel(), count(1), calendarYear(2060))).toBeLessThan(0);
  });
});

describe("selfDesignedCostUsdM (r31/r56)", () => {
  it("sums all five green terms with workbook signs", () => {
    // +1000×2×50/1e6 = 0.1; −1000×1000×0.5/1e6 = −0.5; −0.1×97 = −9.7;
    // −0.2×10 = −2; −3  ⇒  total −15.1
    const cost = selfDesignedCostUsdM(
      {
        co2PriceUsdPerTonne: usdPerTonne(50),
        supportUsdPerKg: usdPerKg(0.5),
        capexSupport: fraction(0.1),
        opexSupport: fraction(0.2),
        otherUsdM: usdM(3),
      },
      fuel({ combustionEf: 2 }),
      count(1),
      97,
      10,
    );
    expect(cost).toBeCloseTo(-15.1, 12);
  });

  it("fossil shape (CO2 term only) charges just the carbon price", () => {
    const cost = selfDesignedCostUsdM(
      { co2PriceUsdPerTonne: usdPerTonne(50) },
      fuel({ combustionEf: 2 }),
      count(1),
      97,
      10,
    );
    expect(cost).toBeCloseTo(0.1, 15);
  });
});
