/**
 * Capital deployment schedule (sprint 4, task 2). Reference figures at
 * 30/40/30 on the Chilean corridor (PV factor 0.3 + 0.4/1.08 + 0.3/1.08²
 * = 0.92757): green CAPEX PV $1,567.6m, fossil $333.9m, pre-regulation
 * gap $1,916.1m, headline gap $1,665.9m; green-only phasing moves the
 * gap by −$122.4m. Phasing re-times existing lines — no new output
 * fields, so the frozen golden shape is untouched by construction.
 */

import { describe, expect, it } from "vitest";
import {
  parseRefBundle,
  parseScenarioInput,
  resolveScenario,
} from "@h2map/corridor-schema";
import type { CapitalPhasingInput, ScenarioInput } from "@h2map/corridor-schema";
import { evaluateScenario } from "../src/index";
import { financingLineUsdM } from "../src/financing";
import { chileReferenceInput } from "./reference/chile";
import { loadRefBundleJson } from "./golden/loader";

const bundle = parseRefBundle(loadRefBundleJson("2026-07-30-excel-v1"));

function withPhasing(
  green: number[],
  fossil: number[] = green,
  enabled = true,
): ScenarioInput {
  const input = chileReferenceInput();
  input.capitalPhasing = {
    enabled,
    green: { weights: green },
    fossil: { weights: fossil },
  } satisfies CapitalPhasingInput;
  return input;
}

const run = (input: ScenarioInput) => evaluateScenario(resolveScenario(input, bundle));

describe("capital deployment schedule", () => {
  const baseline = run(chileReferenceInput());

  it("absent, disabled, or [1] → byte-identical to the legacy year-1 charge", () => {
    expect(JSON.stringify(run(withPhasing([1])))).toBe(JSON.stringify(baseline));
    // Disabled blocks are inert whatever their weights carry.
    expect(JSON.stringify(run(withPhasing([0.5, 0.5], [0.5, 0.5], false)))).toBe(
      JSON.stringify(baseline),
    );
  });

  it("30/40/30 on both sides reproduces the four reference figures", () => {
    const r = run(withPhasing([0.3, 0.4, 0.3]));
    expect(r.summary.greenCapexPvUsdM).toBeCloseTo(1567.6, 0);
    expect(Math.abs(r.summary.greenCapexPvUsdM - 1567.6)).toBeLessThan(0.1);
    expect(Math.abs(r.summary.fossilCapexPvUsdM - 333.9)).toBeLessThan(0.1);
    expect(Math.abs(r.reporting.gapPvPreRegulationUsdM - 1916.1)).toBeLessThan(0.1);
    expect(Math.abs(r.summary.gapPvUsdM - 1665.9)).toBeLessThan(0.1);
  });

  it("green-only phasing moves the gap by −122.4", () => {
    const r = run(withPhasing([0.3, 0.4, 0.3], [1]));
    expect(Math.abs(r.summary.gapPvUsdM - baseline.summary.gapPvUsdM + 122.4)).toBeLessThan(
      0.1,
    );
    expect(r.summary.fossilCapexPvUsdM).toBeCloseTo(baseline.summary.fossilCapexPvUsdM, 9);
  });

  it("weights that do not sum to 1 are rejected BY NAME, never normalised", () => {
    const bad = withPhasing([0.5, 0.4]);
    expect(() => parseScenarioInput(JSON.parse(JSON.stringify(bad)))).toThrow(
      /capitalPhasing\.green\.weights must sum to 1 \(got 0\.9\)/,
    );
    // A scenario that bypassed zod still fails loudly at resolution.
    expect(() => resolveScenario(bad, bundle)).toThrow(
      /capitalPhasing\.green\.weights must sum to 1/,
    );
    const badFossil = withPhasing([1], [0.7, 0.7]);
    expect(() => resolveScenario(badFossil, bundle)).toThrow(
      /capitalPhasing\.fossil\.weights/,
    );
  });

  it("phasing conserves undiscounted CAPEX and never raises its PV (r ≥ 0)", () => {
    const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
    for (const weights of [[1], [0.5, 0.5], [0.3, 0.4, 0.3], [0.1, 0.2, 0.3, 0.4]]) {
      const r = run(withPhasing(weights));
      for (const side of ["green", "fossil"] as const) {
        expect(sum(r.perYear[side].totalCapexUsdM)).toBeCloseTo(
          sum(baseline.perYear[side].totalCapexUsdM),
          6,
        );
      }
      expect(r.summary.greenCapexPvUsdM).toBeLessThanOrEqual(
        baseline.summary.greenCapexPvUsdM + 1e-9,
      );
    }
  });

  it("the financing drawdown follows the phased capital (min-rule, hand-computed)", () => {
    // 100 drawn 50/50 over two years, full debt, tenor 4, amortizing:
    // cumdraw [50,100,100,100,…], cap 100×[4/4,3/4,2/4,1/4] = [100,75,50,25],
    // outstanding = min → [50,75,50,25,0,0], line = −outstanding × 2pp.
    const cfg = {
      greenRate: 0.06,
      baseRate: 0.08,
      debtShare: 1,
      tenorYears: 4,
      structure: "amortizing" as const,
    };
    const line = financingLineUsdM(cfg as never, [50, 50, 0, 0, 0, 0]);
    const expected = [-1, -1.5, -1, -0.5, 0, 0];
    expect(line.length).toBe(expected.length);
    line.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 12));
  });

  it("financing × phasing on the full scenario stays an exact decomposition", () => {
    const input = withPhasing([0.3, 0.4, 0.3]);
    input.financing = {
      enabled: true,
      greenRate: 0.06,
      baseRate: 0.08,
      debtShare: 1,
      tenorYears: 15,
      structure: "amortizing",
    };
    const r = run(input);
    // Phased drawdown lowers the early outstanding balance, so the saving
    // is strictly smaller than the unphased $195.9m — but still a saving.
    expect(r.summary.financingGreenPvUsdM!).toBeGreaterThan(-195.9);
    expect(r.summary.financingGreenPvUsdM!).toBeLessThan(0);
    // The per-year identity holds with both modules active.
    const g = r.perYear.green;
    g.totalUsdM.forEach((total, i) => {
      const parts =
        g.totalCapexUsdM[i]! +
        g.totalOpexUsdM[i]! +
        g.etsUsdM[i]! +
        g.fuelEuUsdM[i]! +
        g.ira45zUsdM[i]! +
        g.selfDesignedUsdM[i]! +
        (g.imoNetZeroUsdM?.[i] ?? 0) +
        (g.financingUsdM?.[i] ?? 0);
      expect(total).toBeCloseTo(parts, 9);
    });
  });
});
