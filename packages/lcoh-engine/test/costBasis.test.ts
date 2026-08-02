/**
 * Realism pass, Task 1 — the electrolyser cost basis is a SOURCED number.
 *
 * These tests pin the IEA GHR 2025 (2024 vintage) basis and, just as
 * importantly, the *coupling* that made re-basing dangerous: OPEX and stack
 * replacement are fractions OF capex, so raising capex 2.3× silently raises
 * both unless the fractions are retuned. The absolute-value assertions below
 * are what stop that regression coming back.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUPPLY_ROUTE,
  ELECTROLYZER_SUPPLY_ROUTES,
  REFERENCE_DEFAULTS,
} from "../src/constants";
import { simulateLCOH } from "../src/simulate";
import { constantProfile } from "./helpers";

const E = REFERENCE_DEFAULTS.electrolyzer;

describe("electrolyser cost basis (IEA GHR 2025, 2024 vintage)", () => {
  it("uses the ex-China installed midpoint, 2,000–2,600 USD/kW", () => {
    expect(E.capexUsdPerKw).toBe(2300);
    expect(E.capexUsdPerKw).toBe(ELECTROLYZER_SUPPLY_ROUTES[DEFAULT_SUPPLY_ROUTE]);
    expect(E.capexUsdPerKw).toBeGreaterThanOrEqual(2000);
    expect(E.capexUsdPerKw).toBeLessThanOrEqual(2600);
  });

  it("prices the reference case's 213 MW island at $490m ± $1m", () => {
    // The corridor's build-here reference (María Elena, 59,850 t/yr NH3
    // nameplate) sizes ~213 MW of electrolysis.
    const capitalUsdM = (213 * 1000 * E.capexUsdPerKw) / 1e6;
    expect(capitalUsdM).toBeGreaterThan(489);
    expect(capitalUsdM).toBeLessThan(491);
  });

  it("holds ABSOLUTE fixed O&M at ~$30/kW/yr after the re-base", () => {
    // The citation is about CAPEX; it says nothing about O&M. Retuning the
    // fraction (0.03 -> 0.0130) is what keeps the O&M claim unchanged.
    const usdPerKwPerYear = E.opexFractionPerYear * E.capexUsdPerKw;
    expect(usdPerKwPerYear).toBeCloseTo(29.9, 1);
  });

  it("holds the stack replacement event at ~$300/kW", () => {
    // Corroborated independently: a stack is ~40-50% of installed system cost
    // and a replacement ~30% of the stack -> 12-15% of system cost.
    const usdPerKw = E.stackReplacementCostFraction * E.capexUsdPerKw;
    expect(usdPerKw).toBeCloseTo(299, 0);
    expect(E.stackReplacementCostFraction).toBeGreaterThanOrEqual(0.12);
    expect(E.stackReplacementCostFraction).toBeLessThanOrEqual(0.15);
  });

  it("uses the IEA economic-optimum stack life of 50,000 h", () => {
    expect(E.stackLifetimeHours).toBe(50_000);
  });

  it("flows the new basis through to the engine's capital total", () => {
    // REFERENCE_DEFAULTS configures both pv and wind, so both profiles are required.
    const results = simulateLCOH(REFERENCE_DEFAULTS, {
      pv: constantProfile(0.25),
      wind: constantProfile(0.35),
    });
    // 100 MW at 2300 USD/kW = $230m of electrolyser capital, exactly.
    expect(results.totals.electrolyzerCapexUsd).toBeCloseTo(230e6, 6);
    expect(results.costStructure.components.electrolyzerCapex.capitalUsd).toBeCloseTo(
      230e6,
      6,
    );
  });
});
