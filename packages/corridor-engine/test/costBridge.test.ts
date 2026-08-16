/**
 * The cost bridge closes — the guard this refactor exists for.
 *
 * The waterfall used to be assembled in the React component, where the
 * renderer hand-subtracted the financing line out of `netRegulatoryEffectUsdM`
 * so its two floats would not double-count. Nothing verified that subtraction.
 * With one float that was survivable; decomposing regulation per instrument
 * makes it six, and a silent arithmetic slip would show up as a waterfall
 * that looks plausible and misattributes the gap.
 *
 * The CHART groups those instruments back into one bar per stop — six
 * slivers answer a question nobody asked. The per-instrument blocks stay
 * available for the tooltip and the decomposition table, and the tests below
 * pin that the grouping is a pure re-presentation of them.
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
  it("KEEPS inactive instruments rather than hiding them", () => {
    // Reversed deliberately. An instrument worth zero is a result: "this
    // corridor touches no EEA port, so ETS does not bite" is something a
    // reader needs to see. Dropping the bar makes an inapplicable scheme
    // indistinguishable from one nobody modelled.
    const b = buildCostBridge(run(defaultScenario()));
    const keys = b.blocks.map((x) => x.key);
    for (const k of ["ets", "fuelEu", "ira45z", "imoNetZero", "selfDesigned", "financing"]) {
      expect(keys, `${k} missing`).toContain(k);
    }
    // ...and this scenario really does have inactive ones, or the assertion
    // above would pass without testing anything.
    expect(b.blocks.some((x) => x.deltaUsdM === 0)).toBe(true);
  });

  it("groups the instruments into one bar per stop", () => {
    // The chart draws groups, not instruments: six near-invisible slivers
    // answer a question nobody asked. The parts stay attached for the
    // tooltip and the decomposition table.
    for (const [name, make] of SCENARIOS) {
      const b = buildCostBridge(run(make()));
      expect(b.groups.map((g) => g.key), name).toEqual([
        "grossIncremental",
        "netIncremental",
      ]);
      for (const g of b.groups) {
        const sum = g.parts.reduce((acc, p) => acc + p.deltaUsdM, 0);
        expect(g.deltaUsdM, `${name}/${g.key}`).toBeCloseTo(sum, 9);
      }
      // Every block belongs to exactly one group — none orphaned, none double-counted.
      expect(b.groups.flatMap((g) => g.parts).length, name).toBe(b.blocks.length);
    }
  });

  it("groups reach the same stops as the blocks", () => {
    // The grouping must be a pure re-presentation: if it drifted from the
    // per-instrument sum, the chart and the table would disagree on screen.
    for (const [name, make] of SCENARIOS) {
      const b = buildCostBridge(run(make()));
      const [inForce, tested] = b.groups;
      expect(b.grossUsdM + inForce!.deltaUsdM, name).toBeCloseTo(
        b.stops.grossIncrementalUsdM,
        9,
      );
      expect(
        b.stops.grossIncrementalUsdM + tested!.deltaUsdM,
        name,
      ).toBeCloseTo(b.stops.netIncrementalUsdM, 9);
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
