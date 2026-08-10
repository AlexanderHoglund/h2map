/**
 * Differentiated green financing (sprint 4, task 1). Calibration against
 * the MMMCZCS Chilean study is BOUNDS, not a target: the study's ≈$250m
 * financing benefit sits between the amortizing ($196.0m) and bullet
 * ($312.5m) structures at Δr = 2pp on green CAPEX $1,690m — nothing here
 * is tuned to hit 250 exactly.
 */

import { describe, expect, it } from "vitest";
import { parseRefBundle, resolveScenario } from "@h2map/corridor-schema";
import type { FinancingInput, ScenarioInput } from "@h2map/corridor-schema";
import { evaluateScenario } from "../src/index";
import { financingLineUsdM } from "../src/financing";
import { chileReferenceInput } from "./reference/chile";
import { loadRefBundleJson } from "./golden/loader";

const bundle = parseRefBundle(loadRefBundleJson("2026-07-30-excel-v1"));

function withFinancing(overrides: Partial<FinancingInput> = {}): ScenarioInput {
  const input = chileReferenceInput();
  input.financing = {
    enabled: true,
    greenRate: 0.06,
    baseRate: 0.08,
    debtShare: 1,
    tenorYears: 15,
    structure: "amortizing",
    ...overrides,
  };
  return input;
}

const run = (input: ScenarioInput) => evaluateScenario(resolveScenario(input, bundle));

describe("green financing effect line", () => {
  const baseline = run(chileReferenceInput());

  it("disabled → no line, byte-identical totals", () => {
    const off = run(withFinancing({ enabled: false }));
    expect(off.perYear.green.financingUsdM).toBeUndefined();
    expect(off.summary.financingGreenPvUsdM).toBeUndefined();
    expect(JSON.stringify(off)).toBe(JSON.stringify(baseline));
  });

  it("Δr = 0 or debtShare = 0 → zero benefit even when enabled", () => {
    const zeroDelta = run(withFinancing({ greenRate: 0.08 }));
    expect(zeroDelta.summary.financingGreenPvUsdM).toBe(0);
    expect(zeroDelta.summary.gapPvUsdM).toBeCloseTo(baseline.summary.gapPvUsdM, 9);
    const zeroDebt = run(withFinancing({ debtShare: 0 }));
    expect(zeroDebt.summary.financingGreenPvUsdM).toBe(0);
  });

  it("amortizing reproduces the $196.0m bound on the reference scenario", () => {
    const r = run(withFinancing({ structure: "amortizing" }));
    expect(r.summary.financingGreenPvUsdM).toBeDefined();
    // Benefit = −line PV. Green CAPEX 1,690 × Δr 2pp × PV factor 5.797.
    expect(-r.summary.financingGreenPvUsdM!).toBeCloseTo(196.0, 0);
    expect(Math.abs(-r.summary.financingGreenPvUsdM! - 196.0)).toBeLessThan(0.5);
    // The gap improves by exactly the line.
    expect(r.summary.gapPvUsdM).toBeCloseTo(
      baseline.summary.gapPvUsdM + r.summary.financingGreenPvUsdM!,
      9,
    );
  });

  it("bullet reproduces the $312.5m bound on the reference scenario", () => {
    const r = run(withFinancing({ structure: "bullet" }));
    expect(Math.abs(-r.summary.financingGreenPvUsdM! - 312.5)).toBeLessThan(0.5);
  });

  it("negative Δr (green premium) produces a positive cost", () => {
    const r = run(withFinancing({ greenRate: 0.1 }));
    expect(r.summary.financingGreenPvUsdM!).toBeGreaterThan(0);
    expect(r.summary.gapPvUsdM).toBeGreaterThan(baseline.summary.gapPvUsdM);
    // Every per-year value is a cost (≥ 0) under a premium.
    for (const v of r.perYear.green.financingUsdM!) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it("the line never appears on the fossil side", () => {
    const r = run(withFinancing());
    expect(r.perYear.fossil.financingUsdM).toBeUndefined();
  });

  it("pre-regulation reporting excludes the line; the net effect carries it", () => {
    const r = run(withFinancing());
    expect(r.reporting.gapPvPreRegulationUsdM).toBeCloseTo(
      baseline.reporting.gapPvPreRegulationUsdM,
      9,
    );
    expect(r.reporting.netRegulatoryEffectUsdM).toBeCloseTo(
      baseline.reporting.netRegulatoryEffectUsdM + r.summary.financingGreenPvUsdM!,
      6,
    );
  });

  it("tenor caps the line and unphased structures match the closed forms", () => {
    // Unphased: capital all in year 1 → cumdraw = P from t=1.
    const cfg = {
      greenRate: 0.06,
      baseRate: 0.08,
      debtShare: 1,
      tenorYears: 4,
      structure: "amortizing" as const,
    };
    const capex = [100, 0, 0, 0, 0, 0];
    const line = financingLineUsdM(cfg as never, capex);
    // outstanding: 100×4/4, 100×3/4, 100×2/4, 100×1/4, then matured.
    // (toBeCloseTo per element: 0.08 − 0.06 is not exactly 0.02 in IEEE.)
    const expectLine = (actual: number[], expected: number[]) => {
      expect(actual.length).toBe(expected.length);
      actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 12));
    };
    expectLine(line, [-2, -1.5, -1, -0.5, 0, 0]);
    const bullet = financingLineUsdM({ ...cfg, structure: "bullet" } as never, capex);
    expectLine(bullet, [-2, -2, -2, -2, 0, 0]);
  });
});
