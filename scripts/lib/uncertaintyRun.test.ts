import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  migrateScenarioInput,
  parseRefBundle,
  parseUncertaintyDataset,
  resolveScenario,
  uncertaintyFor,
  type ScenarioInput,
} from "@h2map/corridor-schema";
import {
  evaluateScenario,
  runUncertainty,
  spearman,
  type SampledInput,
} from "@h2map/corridor-engine";
import { ROOT } from "./serviceDeps";
import { APPLIERS, toApplied } from "../../apps/web/lib/corridor/tornado";
import { ARCHETYPES } from "../corridor/lib/archetypes";

/**
 * The Monte Carlo — the joint band, and the interaction-aware ranking.
 *
 * DETERMINISM IS THE LOAD-BEARING PROPERTY. The artifact is CI-gated by
 * regenerate-and-diff, so a sampler that wanders between runs would fail every
 * build for no reason and, worse, would make every published band unquotable.
 */

const bundle = parseRefBundle(
  JSON.parse(readFileSync(`${ROOT}data/corridor-ref/2026-08-21-cruise-v6.json`, "utf8")),
);
const uncertainty = parseUncertaintyDataset(
  JSON.parse(
    readFileSync(
      `${ROOT}data/input-uncertainty-ref/2026-08-19-uncertainty-v1.json`,
      "utf8",
    ),
  ),
);
const KPI_IDS = ["gapPvUsdM", "costPerUnitUsd"];

const scenarioOf = (key: "A" | "B" | "C"): ScenarioInput =>
  migrateScenarioInput(
    JSON.parse(JSON.stringify(ARCHETYPES.find((a) => a.key === key)!.build())),
  ).input;

const evaluate = (s: ScenarioInput): Record<string, number> => {
  const sum = evaluateScenario(resolveScenario(s, bundle)).summary as unknown as Record<
    string,
    number
  >;
  return Object.fromEntries(KPI_IDS.map((k) => [k, sum[k] ?? Number.NaN]));
};

/** The same inputs the artifact script builds, for one archetype. */
function inputsFor(key: "A" | "B" | "C", widthFactor = 1): SampledInput[] {
  const out: SampledInput[] = [];
  for (const row of uncertaintyFor(uncertainty, key)) {
    const a = APPLIERS[row.id];
    if (!a) continue;
    const lo = toApplied(a.kind, row.low, row);
    const hi = toApplied(a.kind, row.high, row);
    const mid = (lo + hi) / 2;
    out.push({
      id: row.id,
      low: mid + (lo - mid) * widthFactor,
      high: mid + (hi - mid) * widthFactor,
      ...(row.mode === undefined
        ? {}
        : { mode: mid + (toApplied(a.kind, row.mode, row) - mid) * widthFactor }),
      apply: (s, drawn) => a.apply(s, drawn),
    });
  }
  return out;
}

const run = (key: "A" | "B" | "C", o: { draws?: number; seed?: number; width?: number } = {}) =>
  runUncertainty(
    scenarioOf(key),
    inputsFor(key, o.width ?? 1),
    evaluate,
    KPI_IDS,
    "gapPvUsdM",
    { draws: o.draws ?? 400, seed: o.seed ?? 7 },
  );

describe("the run is reproducible", () => {
  it("same seed, byte-identical summary", () => {
    // Without this the artifact cannot be CI-gated and no published band can
    // be quoted or screenshotted.
    expect(JSON.stringify(run("A"))).toBe(JSON.stringify(run("A")));
  });

  it("a different seed actually moves it", () => {
    // Otherwise the test above passes vacuously on a frozen sampler.
    expect(JSON.stringify(run("A", { seed: 7 }))).not.toBe(
      JSON.stringify(run("A", { seed: 99 })),
    );
  });
});

describe("the band describes the same model as the point estimate", () => {
  it("orders the percentiles", () => {
    for (const key of ["A", "B", "C"] as const) {
      const b = run(key).bands.gapPvUsdM!;
      expect(b.p10, key).toBeLessThanOrEqual(b.p50);
      expect(b.p50, key).toBeLessThanOrEqual(b.p90);
    }
  });

  it("collapses to a SINGLE POINT when every range has zero width", () => {
    // With no uncertainty every draw must give the same answer to the last
    // bit — if it does not, the sampler is introducing variance of its own.
    //
    // NOTE WHAT IS *NOT* ASSERTED, because the first version of this test got
    // it wrong and the failure was informative: the collapsed point is NOT
    // the scenario's baseline. A researched range's midpoint is a market
    // central value, not the user's setting — archetype A discounts at 8%
    // against a WACC range centred on 10.25%, so pinning every input to its
    // researched centre legitimately moves the answer ($1,687.6m against
    // $1,729.2m). Requiring equality would have forced the appliers to become
    // no-ops at midpoint, which would silently break the real runs.
    const r = runUncertainty(
      scenarioOf("A"),
      inputsFor("A", 0),
      evaluate,
      KPI_IDS,
      "gapPvUsdM",
      { draws: 50, seed: 3 },
    );
    const b = r.bands.gapPvUsdM!;
    expect(b.p10).toBeCloseTo(b.p50, 9);
    expect(b.p90).toBeCloseTo(b.p50, 9);
    expect(b.mean).toBeCloseTo(b.p50, 9);
    expect(r.degenerate).toBe(true);
    // Every correlation is 0: nothing varied, so nothing can be said to drive.
    for (const i of r.importance) expect(i.rankCorrelation, i.id).toBe(0);
  });

  it("is NOT degenerate at full width", () => {
    // Guards the collapse test above from passing because the sampler never
    // moves anything at all.
    expect(run("A").degenerate).toBe(false);
  });

  it("brackets the deterministic result on at least one archetype", () => {
    // Deliberately weak, and the reason is a real finding: on archetype A the
    // scenario discounts at 8% against a researched WACC mode of 10%, so
    // nearly every draw discounts harder and — since a higher WACC yields a
    // SMALLER gap — the band lands almost entirely below the point estimate.
    // That is the model surfacing an optimistic assumption, not a sampler
    // fault, so this asserts the property holds SOMEWHERE rather than
    // everywhere.
    const bracketed = (["A", "B", "C"] as const).filter((k) => {
      const b = run(k).bands.gapPvUsdM!;
      return b.deterministic >= b.p10 && b.deterministic <= b.p90;
    });
    expect(bracketed.length).toBeGreaterThan(0);
  });
});

describe("rank correlation ranks by interaction-aware importance", () => {
  it("computes a signed correlation for every sampled input", () => {
    const r = run("A");
    expect(r.importance.length).toBe(inputsFor("A").length);
    for (const i of r.importance) {
      expect(Math.abs(i.rankCorrelation), i.id).toBeLessThanOrEqual(1);
    }
  });

  it("sorts by absolute strength", () => {
    const abs = run("A").importance.map((i) => Math.abs(i.rankCorrelation));
    expect([...abs].sort((a, b) => b - a)).toEqual(abs);
  });

  it("gives WACC a NEGATIVE correlation with the gap", () => {
    // The counterintuitive sign, and it must survive: the model discounts
    // COST flows, so a higher discount rate produces a smaller gap. A
    // positive value here would mean the applier or the sign convention had
    // been inverted.
    const wacc = run("A").importance.find((i) => i.id === "cargo.wacc")!;
    expect(wacc.rankCorrelation).toBeLessThan(0);
  });

  it("returns 0 rather than NaN when an input never varies", () => {
    // A zero-variance input gives 0/0. NaN would poison the sort and render
    // as a blank rather than "no measured relationship".
    expect(spearman([1, 1, 1, 1], [3, 1, 4, 1])).toBe(0);
    expect(Number.isNaN(spearman([1, 1, 1], [1, 2, 3]))).toBe(false);
  });

  it("recovers a known monotone relationship at full strength", () => {
    // Spearman is rank-based, so a monotone NON-linear relationship must read
    // as 1 — that is exactly why it is used here instead of Pearson.
    const xs = [1, 2, 3, 4, 5, 6];
    expect(spearman(xs, xs.map((x) => x ** 3))).toBeCloseTo(1, 9);
    expect(spearman(xs, xs.map((x) => -Math.exp(x)))).toBeCloseTo(-1, 9);
  });
});

describe("the committed artifact", () => {
  const art = JSON.parse(
    readFileSync(`${ROOT}data/corridor-sensitivity/uncertainty.json`, "utf8"),
  ) as {
    seed: number;
    draws: number;
    uncertaintyDatasetVersion: string;
    results: {
      archetype: { key: string };
      sampledInputs: string[];
      bands: Record<string, Record<string, number>>;
      importance: { id: string; rankCorrelation: number }[];
    }[];
  };

  it("commits its seed and draw count", () => {
    // The artifact is only reproducible if it says what produced it.
    expect(art.seed).toBeGreaterThan(0);
    expect(art.draws).toBeGreaterThan(100);
  });

  it("reproduces its own committed band from the committed seed", () => {
    // THE REAL DETERMINISM GUARD, and stronger than "two in-process runs
    // agree" — that weaker form survives a sampler that reseeds per draw,
    // which was verified by breaking it deliberately. This re-runs the
    // committed configuration and requires the SAME NUMBERS the file holds,
    // which is exactly what CI's regenerate-and-diff enforces.
    const a = art.results.find((r) => r.archetype.key === "A")!;
    const fresh = runUncertainty(
      scenarioOf("A"),
      inputsFor("A"),
      evaluate,
      KPI_IDS,
      "gapPvUsdM",
      { draws: art.draws, seed: art.seed },
    );
    const band = a.bands.gapPvUsdM!;
    expect(fresh.bands.gapPvUsdM!.p10).toBeCloseTo(band.p10!, 9);
    expect(fresh.bands.gapPvUsdM!.p50).toBeCloseTo(band.p50!, 9);
    expect(fresh.bands.gapPvUsdM!.p90).toBeCloseTo(band.p90!, 9);
    expect(fresh.importance[0]!.id).toBe(a.importance[0]!.id);
  });

  it("pins the uncertainty dataset it sampled", () => {
    expect(art.uncertaintyDatasetVersion).toBe(uncertainty.datasetVersion);
  });

  it("covers all three archetypes and samples several inputs each", () => {
    expect(art.results.map((r) => r.archetype.key).sort()).toEqual(["A", "B", "C"]);
    for (const r of art.results) {
      expect(r.sampledInputs.length, r.archetype.key).toBeGreaterThan(3);
      expect(r.importance.length, r.archetype.key).toBe(r.sampledInputs.length);
    }
  });

  it("carries no raw draws", () => {
    // Summary only: the draws are large, reproducible from the seed, and
    // would rot the moment the engine moved.
    expect(JSON.stringify(art)).not.toMatch(/"draws"\s*:\s*\[/);
  });
});
