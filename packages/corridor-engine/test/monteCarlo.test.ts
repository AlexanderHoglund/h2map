/**
 * The probabilistic corridor — what must hold for the distribution to mean
 * anything.
 *
 * Three of these are guards against traps the bundle actively sets:
 *
 * - `scaleExponent`'s band DESCENDS while fifteen siblings ascend, so a
 *   sampler that assumes low <= high inverts it and still returns
 *   plausible numbers.
 * - `foakMultiplier` is banded but must NOT be sampled: the researched central
 *   is already first-of-a-kind, so applying it charges FOAK twice.
 * - the whole feature is unquotable if a re-run moves the numbers.
 *
 * The fourth is the sanity check that the sampler and the resolver are talking
 * about the same model at all: the deterministic point estimate has to land
 * inside the sampled range.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRefBundle, resolveScenario } from "@h2map/corridor-schema";
import { evaluateScenario } from "../src/index";
import {
  MC_KPIS,
  SAMPLED,
  percentileOf,
  runMonteCarlo,
  triangular,
} from "../src/monteCarlo";
import {
  benchmarkChileScenario,
  defaultScenario,
} from "../../../apps/web/lib/corridor/scenarioDefaults";

const bundle = parseRefBundle(
  JSON.parse(
    readFileSync(
      new URL("../../../data/corridor-ref/2026-08-18-fuel-v4.json", import.meta.url),
      "utf8",
    ),
  ),
);

/** Small run count: these assert properties, not precision. */
const RUNS = 300;
const run = (o = {}) => runMonteCarlo(benchmarkChileScenario(), bundle, { runs: RUNS, ...o });

describe("triangular sampling", () => {
  it("stays inside the band and honours the mode", () => {
    for (let i = 0; i <= 100; i++) {
      const v = triangular(10, 15, 30, i / 100);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(30);
    }
  });

  it("handles a DESCENDING band without inverting it", () => {
    // THE scaleExponent TRAP. low=0.95, high=0.75 in bundle order. Draws must
    // still fall in [0.75, 0.95] rather than collapsing or going negative.
    for (let i = 0; i <= 100; i++) {
      const v = triangular(0.95, 0.85, 0.75, i / 100);
      expect(v).toBeGreaterThanOrEqual(0.75);
      expect(v).toBeLessThanOrEqual(0.95);
    }
    // Ascending and descending statements of the SAME band agree.
    expect(triangular(0.95, 0.85, 0.75, 0.37)).toBeCloseTo(
      triangular(0.75, 0.85, 0.95, 0.37),
      12,
    );
  });

  it("survives a degenerate band", () => {
    expect(triangular(5, 5, 5, 0.42)).toBe(5);
  });
});

describe("percentileOf", () => {
  it("interpolates on an ascending array", () => {
    const a = [0, 10, 20, 30, 40];
    expect(percentileOf(a, 0)).toBe(0);
    expect(percentileOf(a, 50)).toBe(20);
    expect(percentileOf(a, 100)).toBe(40);
  });
});

describe("the run is reproducible", () => {
  it("same seed, identical percentiles", () => {
    // Without this the section cannot be quoted or screenshotted.
    const a = run({ seed: 7 });
    const b = run({ seed: 7 });
    expect(JSON.stringify(a.distributions)).toBe(JSON.stringify(b.distributions));
  });

  it("a different seed actually moves it", () => {
    // Otherwise the test above passes vacuously on a frozen sampler.
    const a = run({ seed: 7 });
    const b = run({ seed: 99 });
    expect(JSON.stringify(a.distributions)).not.toBe(JSON.stringify(b.distributions));
  });
});

describe("the distribution describes the same model as the point estimate", () => {
  const r = run({ seed: 3 });
  const headline = r.distributions.find((d) => d.kpi === "gapPvUsdM")!;

  it("reports every KPI", () => {
    expect(r.distributions.map((d) => d.kpi)).toEqual([...MC_KPIS]);
  });

  it("brackets the deterministic result inside P05-P95", () => {
    // If the point estimate falls outside the sampled range, the sampler and
    // the resolver disagree about something and every number here is suspect.
    expect(headline.deterministic).toBeGreaterThan(headline.percentiles[5]!);
    expect(headline.deterministic).toBeLessThan(headline.percentiles[95]!);
  });

  it("keeps percentiles ordered", () => {
    for (const d of r.distributions) {
      expect(d.percentiles[5]!).toBeLessThanOrEqual(d.percentiles[25]!);
      expect(d.percentiles[25]!).toBeLessThanOrEqual(d.percentiles[50]!);
      expect(d.percentiles[50]!).toBeLessThanOrEqual(d.percentiles[75]!);
      expect(d.percentiles[75]!).toBeLessThanOrEqual(d.percentiles[95]!);
    }
  });

  it("produces a real spread, not a flat line", () => {
    expect(headline.percentiles[95]!).toBeGreaterThan(headline.percentiles[5]! * 1.05);
  });

  it("attributes the spread to a sampled parameter", () => {
    expect(SAMPLED).toContain(r.largestDriver!);
    expect(r.contributions[0]!.swing).toBeGreaterThan(0);
  });
});

describe("a scenario that overrides the sampled inputs", () => {
  it("is flagged degenerate rather than drawn as a spike", () => {
    // THE CASE MOST USERS SEE FIRST. The shipped Chilean default overrides
    // prodCapexUsdM ($1,100m) and prodOpexUsdMPerYear ($72m/yr), so the
    // resolver takes the override branch and never reads the researched
    // benchmarks — sampling them moves nothing. A single-spike histogram
    // rendered without comment reads as a confident result, so the flag
    // exists to make the caller say why instead.
    const r = runMonteCarlo(defaultScenario(), bundle, { runs: 40, seed: 2 });
    expect(r.degenerate).toBe(true);
    const h = r.distributions.find((d) => d.kpi === "gapPvUsdM")!;
    expect(h.percentiles[5]).toBeCloseTo(h.percentiles[95]!, 9);
  });

  it("and the benchmark scenario is NOT flagged", () => {
    // Otherwise the flag could be stuck on and nobody would notice.
    expect(run({ seed: 2 }).degenerate).toBe(false);
  });
});

describe("what is deliberately NOT sampled", () => {
  it("never samples foakMultiplier", () => {
    // THE DOUBLE-COUNT GUARD. The researched central already includes FOAK
    // contingency (NEOM at financial close, AM Green at FID), which is why
    // resolve.ts omits the multiplier. Sampling it here would charge it twice
    // on every draw.
    expect(SAMPLED).not.toContain("foakMultiplier" as never);
  });

  it("moving the foakMultiplier band cannot change the result", () => {
    // A STANDING invariant, not a guard on this module — and the distinction
    // is worth recording, because it was measured rather than assumed.
    //
    // Adding "foakMultiplier" to SAMPLED does NOT make this test fail: no code
    // path reads `research.production.foakMultiplier` at all. `scale.ts` takes
    // FOAK as a parameter defaulting to 1 and `resolve.ts` never passes one,
    // so the researched band is inert wherever it is sampled from.
    //
    // What actually prevents the double-count is therefore the SAMPLED list
    // above plus the resolver's omission — not this assertion. This one exists
    // to catch the day someone wires FOAK into the resolver without revisiting
    // whether the researched central already contains it.
    const withFoak = (band: { low: number; central: number; high: number }) => ({
      ...bundle,
      fuels: bundle.fuels.map((f) =>
        f.research
          ? {
              ...f,
              research: {
                ...f.research,
                production: { ...f.research.production, foakMultiplier: band },
              },
            }
          : f,
      ),
    });
    const opts = { runs: 60, seed: 5 };
    const narrow = runMonteCarlo(
      benchmarkChileScenario(),
      withFoak({ low: 1.25, central: 1.25, high: 1.25 }) as typeof bundle,
      opts,
    );
    const wide = runMonteCarlo(
      benchmarkChileScenario(),
      withFoak({ low: 1, central: 1.25, high: 20 }) as typeof bundle,
      opts,
    );
    expect(JSON.stringify(wide.distributions)).toBe(
      JSON.stringify(narrow.distributions),
    );
  });
});

describe("it is read-only over the deterministic model", () => {
  it("leaves the bundle untouched", () => {
    // The sampler clones per draw; mutating the shared bundle would silently
    // re-cost every later evaluation in the same session.
    const before = JSON.stringify(bundle);
    run({ seed: 11 });
    expect(JSON.stringify(bundle)).toBe(before);
  });

  it("does not move the deterministic result", () => {
    const before = evaluateScenario(
      resolveScenario(benchmarkChileScenario(), bundle),
    ).summary;
    run({ seed: 13 });
    const after = evaluateScenario(
      resolveScenario(benchmarkChileScenario(), bundle),
    ).summary;
    expect(after).toEqual(before);
  });
});
