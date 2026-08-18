import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROOT } from "./serviceDeps";
import { KPIS, PARAMS } from "../corridor/lib/params";

/**
 * The sweep's parameter table, after it was extracted out of
 * `sensitivity.ts` so more than one harness could use it.
 *
 * THE REFACTOR IS INVISIBLE TO EVERY EXISTING GATE. `sensitivity.ts --check`
 * compares only the top-level id SET, and the docs byte-gate regenerates FROM
 * the stored artifact — so moving the table could have silently changed a
 * number and nothing in CI would have said so. The committed artifact is
 * therefore the assertion: the ids, their order, and their ranges must still
 * be exactly what produced `sensitivity.json`.
 *
 * That also makes this the guard for the extraction's real risk — a param
 * dropped or reordered during the move.
 */

const artifact = JSON.parse(
  readFileSync(`${ROOT}data/corridor-sensitivity/sensitivity.json`, "utf8"),
) as {
  ranked: { id: string; range: readonly (string | number)[] }[];
  kpis: { id: string }[];
};

describe("the extracted parameter table still describes the committed artifact", () => {
  it("sweeps a non-trivial number of parameters", () => {
    // Anti-vacuity: an empty import would make every comparison below pass.
    expect(PARAMS.length).toBeGreaterThan(50);
    expect(artifact.ranked.length).toBeGreaterThan(50);
  });

  it("covers exactly the ids the artifact ranks", () => {
    expect([...PARAMS.map((p) => p.id)].sort()).toEqual(
      [...artifact.ranked.map((r) => r.id)].sort(),
    );
  });

  it("keeps every range identical", () => {
    // The ranges ARE the sweep's result — a moved endpoint changes every
    // movement figure downstream while leaving the id set untouched, which
    // is precisely what --check cannot see.
    const ranges = new Map(artifact.ranked.map((r) => [r.id, r.range]));
    for (const p of PARAMS) {
      const expected = ranges.get(p.id)!;
      const actual = p.options ? [...p.options] : [p.low, p.high];
      expect(actual, p.id).toEqual([...expected]);
    }
  });

  it("declares each parameter exactly once", () => {
    const ids = PARAMS.map((p) => p.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it("gives every parameter a setter matching its kind", () => {
    // A numeric param with no `set`, or an enum with no `setOption`, is
    // skipped in silence by the sweep rather than failing.
    for (const p of PARAMS) {
      if (p.options) {
        expect(typeof p.setOption, p.id).toBe("function");
      } else {
        expect(typeof p.set, p.id).toBe("function");
        expect(typeof p.low, p.id).toBe("number");
        expect(typeof p.high, p.id).toBe("number");
      }
    }
  });

  it("keeps the six KPIs in the artifact's order", () => {
    expect(KPIS.map((k) => k.id)).toEqual(artifact.kpis.map((k) => k.id));
  });
});
