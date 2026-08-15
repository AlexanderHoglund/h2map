import { describe, expect, it } from "vitest";
import {
  DESAL_KWH_PER_M3,
  REFERENCE_DEFAULTS,
  WATER_L_PER_KG_H2,
} from "../src/constants";
import { simulateLCOH } from "../src/simulate";
import { constantProfile } from "./helpers";

/**
 * Water is modelled at its STOICHIOMETRIC FLOOR (9 L/kg), not plant demand
 * (15-30 L/kg). That is a deliberate choice — the cost consequence is
 * negligible and the value is pinned by hand-computed golden fixtures — but
 * it makes every reported water VOLUME a lower bound. These tests keep the
 * choice explicit so it stays a decision rather than an oversight.
 */

describe("water is a floor, and reported volumes inherit that", () => {
  it("holds the stoichiometric value, not a plant-demand figure", () => {
    expect(WATER_L_PER_KG_H2).toBe(9);
    // Guard the intent: if someone raises this to a plant figure they must
    // also update the golden fixtures and the docs that call it a floor.
    expect(WATER_L_PER_KG_H2).toBeLessThan(15);
  });

  it("scales reported volume linearly with production", () => {
    const inputs = structuredClone(REFERENCE_DEFAULTS);
    const r = simulateLCOH(inputs, {
      pv: constantProfile(0.25),
      wind: constantProfile(0.35),
    });
    for (const row of r.annual) {
      // m³ = kg × L/kg ÷ 1000, exactly — no losses, no purification reject.
      expect(row.waterM3).toBeCloseTo((row.h2Kg * WATER_L_PER_KG_H2) / 1000, 9);
    }
  });

  it("keeps desalination electricity out of cost and inside the ledger", () => {
    // 3.75 kWh/m³ is a correct SWRO figure (industry range 2.5-4.0) and is
    // deliberately emissions-only: the water PRICE already pays for supply,
    // so charging desalination energy again would double-count it.
    expect(DESAL_KWH_PER_M3).toBeGreaterThanOrEqual(2.5);
    expect(DESAL_KWH_PER_M3).toBeLessThanOrEqual(4.0);

    const inputs = structuredClone(REFERENCE_DEFAULTS);
    const cheap = simulateLCOH(inputs, {
      pv: constantProfile(0.25),
      wind: constantProfile(0.3),
    });
    const dearWater = structuredClone(REFERENCE_DEFAULTS);
    dearWater.water = { ...dearWater.water, priceUsdPerM3: 10 };
    const dear = simulateLCOH(dearWater, {
      pv: constantProfile(0.25),
      wind: constantProfile(0.3),
    });

    // Only the water line moves; desalination energy never enters cost.
    expect(dear.decomposition.water).toBeGreaterThan(
      cheap.decomposition.water,
    );
    expect(dear.decomposition.electricityPv).toBeCloseTo(
      cheap.decomposition.electricityPv,
      9,
    );
  });
});
