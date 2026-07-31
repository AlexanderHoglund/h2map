/**
 * Synthesis (1.5) + logistics (1.6) tests, incl. the build-plan cross-check:
 * at LCOH ≈ $4.1/kg, delivered e-ammonia lands in the $800–950/t band that
 * both the Excel benchmark ($900/t) and the H2MAP validation imply.
 */

import { describe, expect, it } from "vitest";
import { getSynthesisBenchmark } from "@h2map/corridor-schema";
import {
  capitalRecoveryFactor,
  deliveredUsdPerTonne,
  greatCircleKm,
  logisticsUsdPerTonne,
  synthesisScaleFactor,
  synthesize,
  synthesizePlant,
} from "../src/index";

const config = {
  productionWacc: 0.08, // D7 — production-side rate, NOT the corridor WACC
  electricityUsdPerMwh: 60,
  co2UsdPerTonne: 30, // point-source preset
};

describe("capitalRecoveryFactor", () => {
  it("matches the closed form and the zero-rate limit", () => {
    // 8%/25y: 0.08×1.08^25/(1.08^25−1) ≈ 0.09368
    expect(capitalRecoveryFactor(0.08, 25)).toBeCloseTo(0.093679, 5);
    expect(capitalRecoveryFactor(0, 20)).toBe(1 / 20);
  });
});

describe("synthesize", () => {
  it("cross-check: e-ammonia at LCOH 4.1 lands in the 800–950 $/t band", () => {
    const r = synthesize(4.1, getSynthesisBenchmark("e-ammonia"), config);
    expect(r.gateUsdPerTonne).toBeGreaterThan(800);
    expect(r.gateUsdPerTonne).toBeLessThan(950);
    // H2 feedstock dominates: 4.1 × 178 kg = 729.8.
    expect(r.breakdown.h2FeedstockUsdPerTonne).toBeCloseTo(729.8, 6);
  });

  it("breakdown sums exactly to the gate price (decomposition contract)", () => {
    for (const id of ["e-ammonia", "e-methanol", "lh2"] as const) {
      const r = synthesize(4.1, getSynthesisBenchmark(id), config);
      const sum =
        r.breakdown.h2FeedstockUsdPerTonne +
        r.breakdown.co2FeedstockUsdPerTonne +
        r.breakdown.electricityUsdPerTonne +
        r.breakdown.plantUsdPerTonne;
      expect(r.gateUsdPerTonne).toBe(sum);
    }
  });

  it("MeOH charges CO2 feedstock; NH3/LH2 do not", () => {
    const meoh = synthesize(4.1, getSynthesisBenchmark("e-methanol"), config);
    expect(meoh.breakdown.co2FeedstockUsdPerTonne).toBeCloseTo(1.374 * 30, 9);
    const nh3 = synthesize(4.1, getSynthesisBenchmark("e-ammonia"), config);
    expect(nh3.breakdown.co2FeedstockUsdPerTonne).toBe(0);
  });

  it("LH2 is dominated by H2 cost + liquefaction electricity", () => {
    const r = synthesize(4.1, getSynthesisBenchmark("lh2"), config);
    expect(r.breakdown.h2FeedstockUsdPerTonne).toBeCloseTo(4100, 6);
    expect(r.breakdown.electricityUsdPerTonne).toBeCloseTo(8 * 60, 9); // 8 MWh/t
  });

  it("D7: a higher production WACC raises only the plant annuity", () => {
    const cheap = synthesize(4.1, getSynthesisBenchmark("e-ammonia"), config);
    const dear = synthesize(4.1, getSynthesisBenchmark("e-ammonia"), {
      ...config,
      productionWacc: 0.12,
    });
    expect(dear.breakdown.plantUsdPerTonne).toBeGreaterThan(cheap.breakdown.plantUsdPerTonne);
    expect(dear.breakdown.h2FeedstockUsdPerTonne).toBe(cheap.breakdown.h2FeedstockUsdPerTonne);
  });
});

describe("logistics", () => {
  it("haversine: one degree of longitude at the equator ≈ 111.19 km", () => {
    expect(greatCircleKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111.19, 1);
  });

  it("delivered = gate + distance × routeFactor × rate", () => {
    const plant = { lat: 2.5, lon: 36.8 }; // Turkana-ish
    const port = { lat: -4.04, lon: 39.67 }; // Mombasa
    const km = greatCircleKm(plant, port);
    const cfg = { usdPerTonneKm: 0.012, routeFactor: 1.3 };
    expect(logisticsUsdPerTonne(plant, port, cfg)).toBeCloseTo(km * 1.3 * 0.012, 9);
    expect(deliveredUsdPerTonne(900, plant, port, cfg)).toBeCloseTo(
      900 + km * 1.3 * 0.012,
      9,
    );
  });

  it("zero distance costs nothing", () => {
    const p = { lat: 10, lon: 10 };
    expect(logisticsUsdPerTonne(p, p, { usdPerTonneKm: 0.05 })).toBe(0);
  });
});

describe("synthesizePlant — scale sensitivity (spec §3)", () => {
  const nh3 = getSynthesisBenchmark("e-ammonia");
  const config = {
    productionWacc: 0.08,
    electricityUsdPerMwh: 60,
    co2UsdPerTonne: 30,
    nameplateTonnesPerYear: 60_000,
  };

  it("scale factor at 60 kt vs the 500 kt reference is 2.34 ± 0.01", () => {
    expect(synthesisScaleFactor(nh3, 60_000)).toBeCloseTo(2.34, 2);
  });

  it("at the reference scale with foak 1 the correction is inert (factor 1)", () => {
    expect(synthesisScaleFactor(nh3, nh3.referenceScaleTonnesPerYear)).toBeCloseTo(1, 12);
    const atRef = synthesizePlant(nh3, {
      ...config,
      nameplateTonnesPerYear: nh3.referenceScaleTonnesPerYear,
    });
    expect(atRef.capitalUsd).toBeCloseTo(
      nh3.plantCapexUsdPerTpa * nh3.referenceScaleTonnesPerYear,
      6,
    );
  });

  it("foak multiplies capital only; breakdown sums to operating", () => {
    const base = synthesizePlant(nh3, config);
    const foak = synthesizePlant(nh3, { ...config, foakMultiplier: 1.3 });
    expect(foak.capitalUsd / base.capitalUsd).toBeCloseTo(1.3, 12);
    // electricity/CO2 operating parts are scale-factor-independent:
    expect(foak.breakdown.electricityUsdPerYear).toBe(base.breakdown.electricityUsdPerYear);
    expect(base.annualOperatingUsd).toBeCloseTo(
      base.breakdown.fixedOmUsdPerYear +
        base.breakdown.electricityUsdPerYear +
        base.breakdown.co2FeedstockUsdPerYear,
      9,
    );
  });

  it("perTonne is the CRF display figure over nameplate", () => {
    const r = synthesizePlant(nh3, config);
    const crf = capitalRecoveryFactor(0.08, nh3.plantLifeYears);
    expect(r.perTonne).toBeCloseTo(
      (r.capitalUsd * crf + r.annualOperatingUsd) / 60_000,
      9,
    );
  });
});
