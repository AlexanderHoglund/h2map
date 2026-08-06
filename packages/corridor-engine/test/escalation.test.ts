/**
 * Fix #3 (Chilean run): optional carbon-price escalation on the EU ETS EUA
 * price and the self-designed CO2 price. Default 0 reproduces the current
 * (flat-nominal, Excel) behaviour exactly; escalation equal to inflation
 * holds the REAL price constant.
 */

import { describe, expect, it } from "vitest";
import { fraction, yearIndex } from "@h2map/units";
import { parseRefBundle, resolveScenario } from "@h2map/corridor-schema";
import { evaluateScenario, inflationFactor } from "../src/index";
import { loadRefBundleJson } from "./golden/loader";
import { chileReferenceInput } from "./reference/chile";

const bundle = parseRefBundle(loadRefBundleJson("2026-07-30-excel-v1"));

describe("fix #3: carbon-price escalation", () => {
  it("escalation 0 (and absent) reproduce the current output exactly", () => {
    const absent = evaluateScenario(resolveScenario(chileReferenceInput(), bundle));

    const zero = chileReferenceInput();
    zero.regulation.selfDesigned.co2PriceEscalation = 0;
    zero.regulation.ets.euaEscalation = 0;
    const withZero = evaluateScenario(resolveScenario(zero, bundle));

    expect(withZero.summary).toEqual(absent.summary);
    expect(withZero.perYear).toEqual(absent.perYear);
  });

  it("escalation == inflation holds the real price constant (year 15 == year 1)", () => {
    const input = chileReferenceInput();
    const inflation = input.cargo.inflation; // 0.02
    input.regulation.selfDesigned.co2PriceEscalation = inflation;
    const result = evaluateScenario(resolveScenario(input, bundle));

    // The self-designed line is a pure CO2-price term here (all support
    // terms 0), so per-year cost ∝ effective price. Deflating year 15 by
    // the inflation factor must recover year 1 exactly:
    // cost_15 / (1+i)^14 === cost_1.
    const fossil = result.perYear.fossil.selfDesignedUsdM;
    const year1 = fossil[0]!;
    const year15 = fossil[14]!;
    expect(year15 / inflationFactor(fraction(inflation), yearIndex(15))).toBeCloseTo(year1, 12);
    // And it is genuinely escalating in nominal terms.
    expect(year15).toBeGreaterThan(year1);
  });

  it("ETS escalation escalates the EUA price only (phase-in and scope intact)", () => {
    const flat = chileReferenceInput();
    flat.regulation.ets.enabled = true;
    const esc = chileReferenceInput();
    esc.regulation.ets.enabled = true;
    esc.regulation.ets.euaEscalation = 0.05;

    const flatR = evaluateScenario(resolveScenario(flat, bundle));
    const escR = evaluateScenario(resolveScenario(esc, bundle));

    const flatEts = flatR.perYear.fossil.etsUsdM;
    const escEts = escR.perYear.fossil.etsUsdM;
    // Year 1: factor (1.05)^0 = 1 — identical.
    expect(escEts[0]).toBe(flatEts[0]);
    // Year t: exactly flat × 1.05^(t−1).
    for (let i = 1; i < flatEts.length; i++) {
      expect(escEts[i]! / flatEts[i]!).toBeCloseTo(Math.pow(1.05, i), 12);
    }
  });
});
