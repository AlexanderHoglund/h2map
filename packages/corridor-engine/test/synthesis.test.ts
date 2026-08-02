/**
 * Synthesis (1.5) + logistics (1.6) tests, incl. the build-plan cross-check:
 * at LCOH ≈ $4.1/kg, delivered e-ammonia lands in the $800–950/t band that
 * both the Excel benchmark ($900/t) and the H2MAP validation imply.
 */

import { describe, expect, it } from "vitest";
import {
  ARCHETYPE_FOAK_MULTIPLIER,
  getSynthesisBenchmark,
} from "@h2map/corridor-schema";
import {
  capitalRecoveryFactor,
  deliveredUsdPerTonne,
  greatCircleKm,
  logisticsLeg,
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

describe("project archetype (realism pass, Task 4)", () => {
  const nh3 = getSynthesisBenchmark("e-ammonia");
  const config = {
    productionWacc: 0.08,
    electricityUsdPerMwh: 60,
    co2UsdPerTonne: 30,
    nameplateTonnesPerYear: 59_850,
  };

  it("moves FOAK coherently: dedicated corridors cost 25% more than merchant", () => {
    const foak = synthesizePlant(nh3, {
      ...config,
      foakMultiplier: ARCHETYPE_FOAK_MULTIPLIER["foak-dedicated"],
    });
    const noak = synthesizePlant(nh3, {
      ...config,
      foakMultiplier: ARCHETYPE_FOAK_MULTIPLIER["noak-merchant"],
    });
    expect(ARCHETYPE_FOAK_MULTIPLIER["foak-dedicated"]).toBe(1.25);
    expect(ARCHETYPE_FOAK_MULTIPLIER["noak-merchant"]).toBe(1);
    expect(foak.capitalUsd / noak.capitalUsd).toBeCloseTo(1.25, 12);
    // Fixed O&M follows capital, so it moves too - that is the point of a
    // coherent archetype rather than five independent knobs.
    expect(foak.breakdown.fixedOmUsdPerYear / noak.breakdown.fixedOmUsdPerYear).toBeCloseTo(
      1.25,
      12,
    );
    // Feedstock/electricity are physical - they must NOT scale with FOAK.
    expect(foak.breakdown.electricityUsdPerYear).toBeCloseTo(
      noak.breakdown.electricityUsdPerYear,
      12,
    );
  });
});

describe("inland logistics rate (realism pass)", () => {
  const nh3 = getSynthesisBenchmark("e-ammonia");

  it("prices the plant→port leg an order of magnitude above sea freight", () => {
    // The leg is road/rail/short pipeline, not deep-sea bulk. Using the sea
    // rate understated a ~116 km María Elena→Mejillones leg ~8x.
    expect(nh3.inlandUsdPerTonneKm).toBeGreaterThanOrEqual(0.1);
    expect(nh3.inlandUsdPerTonneKm).toBeLessThanOrEqual(0.15);
    expect(nh3.inlandUsdPerTonneKm / nh3.shippingUsdPerTonneKm).toBeGreaterThan(5);
  });

  it("moves the María Elena leg from ~$0.10m/yr to a material figure", () => {
    const site = { lat: -22.35, lon: -69.66 };
    const mejillones = { lat: -23.1, lon: -70.45 };
    const tonnes = 57_000;
    const sea = logisticsLeg(site, mejillones, nh3.shippingUsdPerTonneKm, tonnes);
    const inland = logisticsLeg(site, mejillones, nh3.inlandUsdPerTonneKm, tonnes);
    expect(sea.annualOperatingUsd).toBeLessThan(0.15e6);
    expect(inland.annualOperatingUsd).toBeGreaterThan(0.8e6);
    expect(inland.distanceKm).toBeCloseTo(sea.distanceKm, 12);
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

  it("scale factor at 60 kt vs the 1.2 Mt NEOM reference is 3.31 ± 0.01", () => {
    // Re-anchored 2026-08-02: the reference scale moved 500 kt -> 1.2 Mt/yr
    // (NEOM), so a 60 kt/yr corridor plant now carries 3.31x the specific
    // capital rather than 2.34x.
    expect(synthesisScaleFactor(nh3, 60_000)).toBeCloseTo(3.31, 2);
  });

  it("flags extrapolation beyond 5x from the reference scale", () => {
    // 60 kt against a 1.2 Mt reference is 20x - the six-tenths rule is being
    // stretched well past its comfortable range and the lineage must say so.
    const small = synthesizePlant(nh3, config);
    expect(small.scaleExtrapolationFactor).toBeCloseTo(20, 0);
    expect(small.scaleExtrapolated).toBe(true);
    const atRef = synthesizePlant(nh3, {
      ...config,
      nameplateTonnesPerYear: nh3.referenceScaleTonnesPerYear,
    });
    expect(atRef.scaleExtrapolationFactor).toBeCloseTo(1, 12);
    expect(atRef.scaleExtrapolated).toBe(false);
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

describe("logisticsLeg — coordinate-derived plant→port leg (spec §4)", () => {
  const MEJILLONES = { lat: -23.1, lon: -70.45 };
  const MARIA_ELENA = { lat: -22.35, lon: -69.66 };
  const LA_NEGRA = { lat: -23.75, lon: -70.3 };
  const nh3Rate = 0.012;

  it("María Elena → Mejillones ≈ 120 km, La Negra → Mejillones ≈ 75 km (from coordinates)", () => {
    expect(greatCircleKm(MARIA_ELENA, MEJILLONES)).toBeGreaterThan(110);
    expect(greatCircleKm(MARIA_ELENA, MEJILLONES)).toBeLessThan(125);
    expect(greatCircleKm(LA_NEGRA, MEJILLONES)).toBeGreaterThan(70);
    expect(greatCircleKm(LA_NEGRA, MEJILLONES)).toBeLessThan(80);
  });

  it("annual operating = distance × routeFactor × rate × tonnage; perTonne consistent", () => {
    const leg = logisticsLeg(MARIA_ELENA, MEJILLONES, nh3Rate, 60_000);
    expect(leg.perTonne).toBeCloseTo(leg.distanceKm * 1.3 * nh3Rate, 12);
    expect(leg.annualOperatingUsd).toBeCloseTo(leg.perTonne * 60_000, 9);
    // Replaceable-internals contract: only these three outputs.
    expect(Object.keys(leg).sort()).toEqual([
      "annualOperatingUsd",
      "distanceKm",
      "perTonne",
    ]);
  });
});
