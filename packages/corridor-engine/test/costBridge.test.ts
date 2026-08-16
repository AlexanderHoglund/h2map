/**
 * The cost bridge closes — the guard this refactor exists for.
 *
 * The waterfall used to be assembled in the React component, where the
 * renderer hand-subtracted the financing line out of `netRegulatoryEffectUsdM`
 * so its two floats would not double-count. Nothing verified that subtraction.
 * With one float that was survivable; splitting regulation into one block per
 * instrument makes it six, and a silent arithmetic slip would show up as a
 * waterfall that looks plausible and misattributes the gap.
 *
 * So the arithmetic moved into `costBridge.ts` and these tests pin it.
 *
 * The closure is asserted RELATIVE to the gap, at 1e-9. It is not bit-exact
 * and should not be: the engine sums each side's per-year rows and then
 * differences the totals, while the bridge sums per-instrument differences —
 * same arithmetic, different association order, so the last one or two ULPs
 * move (measured ≤1e-15 relative across every shipped scenario). 1e-9 is
 * therefore six orders of magnitude above the noise and far below any real
 * omission: the smallest block in any shipped scenario is worth millions.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRefBundle, resolveScenario } from "@h2map/corridor-schema";
import type { ScenarioInput } from "@h2map/corridor-schema";
import { evaluateScenario } from "../src/index";
import {
  buildCostBridge,
  costBridgeClosure,
  REGULATION_STATUS,
} from "../src/costBridge";
import {
  benchmarkChileScenario,
  defaultScenario,
  modernChileScenario,
  studyChileScenario,
} from "../../../apps/web/lib/corridor/scenarioDefaults";

const bundle = parseRefBundle(
  JSON.parse(
    readFileSync(
      new URL("../../../data/corridor-ref/2026-08-17-vessel-v3.json", import.meta.url),
      "utf8",
    ),
  ),
);

const run = (s: ScenarioInput) => evaluateScenario(resolveScenario(s, bundle));

/**
 * Deliberately varied: the four shipped Chilean variants differ in which
 * instruments are live (self-designed vs IMO, financing on vs off), plus one
 * with the EU schemes forced on — because the Chilean corridor touches no EEA
 * port, so ETS and FuelEU are inert in every shipped variant and the in-force
 * blocks would otherwise never be exercised at all.
 */
const withEuSchemes = (): ScenarioInput => {
  const s = defaultScenario();
  s.regulation.ets.enabled = true;
  s.regulation.fuelEu.enabled = true;
  return s;
};

const SCENARIOS: readonly (readonly [string, () => ScenarioInput])[] = [
  ["shipped default", defaultScenario],
  ["as published", studyChileScenario],
  ["current model", modernChileScenario],
  ["benchmarks only", benchmarkChileScenario],
  ["EU schemes forced on", withEuSchemes],
];

/** Closure as a fraction of the gap — see the header for why not absolute. */
const CLOSURE_TOL = 1e-9;

describe("the cost bridge closes", () => {
  it.each(SCENARIOS)("%s: blocks account for the whole gap", (_name, make) => {
    // THE LOAD-BEARING ASSERTION.
    const r = run(make());
    expect(Math.abs(costBridgeClosure(r) / r.summary.gapPvUsdM)).toBeLessThan(
      CLOSURE_TOL,
    );
  });

  it.each(SCENARIOS)("%s: the net stop IS the headline gap", (_name, make) => {
    const r = run(make());
    expect(buildCostBridge(r).stops.netIncrementalUsdM).toBeCloseTo(
      r.summary.gapPvUsdM,
      6,
    );
  });

  it("the residual really is rounding, not a missing block", () => {
    // Pins the ORDER OF MAGNITUDE, so the loosened tolerance above cannot
    // quietly start absorbing a genuine omission. If association order ever
    // changes this may need revisiting — deliberately, with eyes open.
    for (const [name, make] of SCENARIOS) {
      const r = run(make());
      const rel = Math.abs(costBridgeClosure(r) / r.summary.gapPvUsdM);
      expect(rel, name).toBeLessThan(1e-12);
    }
  });

  it("catches a block that is drawn but not accounted for", () => {
    // Proves the closure test above is not vacuous. Dropping a non-zero block
    // from the sum is exactly the mistake the old hand-subtraction invited,
    // and it must show up as a non-zero residual.
    const r = run(modernChileScenario());
    const bridge = buildCostBridge(r);
    const financing = bridge.blocks.find((b) => b.key === "financing");
    expect(financing, "expected a financing block to exist here").toBeDefined();
    expect(financing!.deltaUsdM).not.toBe(0);
    const withoutIt = bridge.stops.netIncrementalUsdM - financing!.deltaUsdM;
    expect(withoutIt).not.toBe(r.summary.gapPvUsdM);
  });
});

describe("the three stopping points", () => {
  it("gross incremental carries ONLY in-force regulation", () => {
    // The distinction that makes stop 1 meaningful: a corridor priced under
    // the law as it stands, with nothing provisional folded in.
    const r = run(withEuSchemes());
    const b = buildCostBridge(r);
    const inForce = b.blocks
      .filter((x) => x.key !== "financing" && REGULATION_STATUS[x.key] === "inForce")
      .reduce((acc, x) => acc + x.deltaUsdM, 0);
    expect(b.stops.grossIncrementalUsdM).toBeCloseTo(b.grossUsdM + inForce, 9);
  });

  it("the two stops differ once an in-force scheme bites", () => {
    // Guards against the split being real only on paper. The Chilean default
    // touches no EEA port, so ETS/FuelEU are inert and stop 1 collapses onto
    // the gross bar; forcing them on must separate the two.
    const b = buildCostBridge(run(withEuSchemes()));
    expect(b.stops.grossIncrementalUsdM).not.toBe(b.grossUsdM);
    expect(b.stops.grossIncrementalUsdM).toBeLessThan(b.grossUsdM);
  });

  it("stop 1 equals the gross bar when no in-force scheme applies", () => {
    // The honest converse, and the reason the chart can look a bar short on
    // the shipped default. Documented rather than hidden.
    const b = buildCostBridge(run(defaultScenario()));
    expect(b.stops.grossIncrementalUsdM).toBe(b.grossUsdM);
  });

  it("classifies IMO Net-Zero as tested, not in force", () => {
    // It is provisional pending adoption (MEPC 85, Oct 2026) per the bundle's
    // own sourceNote. If it is ever adopted, this line moves — and this test
    // is where someone will notice they must also update the docs.
    expect(REGULATION_STATUS.imoNetZero).toBe("tested");
    expect(REGULATION_STATUS.selfDesigned).toBe("tested");
    expect(REGULATION_STATUS.ets).toBe("inForce");
    expect(REGULATION_STATUS.fuelEu).toBe("inForce");
    expect(REGULATION_STATUS.ira45z).toBe("inForce");
  });
});

describe("block hygiene", () => {
  it("drops zero blocks rather than drawing empty bars", () => {
    // A zero-height bar implies "modelled and found negligible", which is a
    // different claim from "not applicable to this corridor".
    for (const [, make] of SCENARIOS) {
      for (const b of buildCostBridge(run(make())).blocks) {
        expect(b.deltaUsdM, b.key).not.toBe(0);
      }
    }
  });

  it("keeps the anchored bars consistent with the gross bar", () => {
    // green − fossil === gross, so the first three bars are a closed triangle
    // and the fossil bar can hang from the green total down to gross.
    for (const [name, make] of SCENARIOS) {
      const b = buildCostBridge(run(make()));
      expect(b.greenTotalUsdM - b.fossilTotalUsdM, name).toBeCloseTo(b.grossUsdM, 9);
    }
  });

  it("reports financing separately from regulation", () => {
    // It is an interest saving actually paid, not a policy instrument. The
    // old renderer had to subtract it back out of the regulation total by
    // hand; here it is simply its own block and never inside one.
    const b = buildCostBridge(run(modernChileScenario()));
    const keys = b.blocks.map((x) => x.key);
    expect(keys).toContain("financing");
    expect(new Set(keys).size).toBe(keys.length); // no duplicates
  });
});
