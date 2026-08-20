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
  baseKpis: { gapPvUsdM: number };
  ranked: {
    id: string;
    range: readonly (string | number)[];
    gapAtLow: number;
    gapAtHigh: number;
    signedByKpi: {
      gapPvUsdM: { atLow: number; atHigh: number };
      costPerTonneCo2Usd: { atLow: number; atHigh: number };
    } | null;
  }[];
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

  it("records opposite-signed abatement endpoints for corridor length", () => {
    // The honesty fix behind the signed display: the abatement cost RISES
    // toward the short end of the distance range (+366% at 100 nm) and FALLS
    // toward the far end (−82% at 5,000 nm). A max-abs figure collapsed that
    // into "366%" — if these endpoints ever stop disagreeing in sign, the
    // docs' whole ratio-amplification explanation is stale.
    const row = artifact.ranked.find((r) => r.id === "cargo.oneWayDistanceNm")!;
    const s = row.signedByKpi!.costPerTonneCo2Usd;
    expect(s.atLow).toBeGreaterThan(0);
    expect(s.atHigh).toBeLessThan(0);
  });
});

describe("the corridor-length row's signed figures obey their own arithmetic", () => {
  // The gap is near-affine in distance: gap(d) ≈ fixed + slope·d. That
  // decomposition, derived from the row's OWN endpoints, puts hard floors
  // under both signed columns — the abatement cost cannot fall further than
  // the fixed share of the baseline gap allows (at infinite distance the
  // ratio tends to the variable part alone), and the gap cannot fall further
  // than the variable share (at zero distance only the fixed part remains).
  // A regenerated artifact that violates either floor mixed up its baseline
  // or its sign convention, which is exactly the bug class the signed
  // display exists to prevent.
  const row = artifact.ranked.find((r) => r.id === "cargo.oneWayDistanceNm")!;
  const [lo, hi] = row.range as readonly [number, number];
  const base = artifact.baseKpis.gapPvUsdM;
  const slope = (row.gapAtHigh - row.gapAtLow) / (hi - lo);
  const fixed = row.gapAtLow - slope * lo;
  const fixedShare = fixed / base;

  it("splits the baseline gap into meaningful fixed and variable parts", () => {
    // Anti-vacuity: shares outside (0, 1) would make the floors trivial.
    expect(fixedShare).toBeGreaterThan(0);
    expect(fixedShare).toBeLessThan(1);
  });

  it("bounds the abatement fall by the fixed share of the gap", () => {
    const s = row.signedByKpi!.costPerTonneCo2Usd;
    expect(s.atHigh).toBeGreaterThanOrEqual(-fixedShare - 0.01);
  });

  it("bounds the gap fall by the variable share", () => {
    const s = row.signedByKpi!.gapPvUsdM;
    expect(s.atLow).toBeGreaterThanOrEqual(-(1 - fixedShare) - 0.01);
  });

  it("back-solves both signed gap endpoints from one swept range", () => {
    // Both columns of a row must describe the SAME sweep: the signed gap
    // endpoints must be exactly the relative movements the row's absolute
    // gap endpoints imply against the artifact's own baseline.
    const s = row.signedByKpi!.gapPvUsdM;
    expect(s.atLow).toBeCloseTo((row.gapAtLow - base) / base, 9);
    expect(s.atHigh).toBeCloseTo((row.gapAtHigh - base) / base, 9);
  });
});

describe("choice option lists match the bundle catalogue", () => {
  // The option lists are literals in params.ts; the catalogue is data. An
  // option added to the bundle but absent from the sweep would silently
  // vanish from the impact ranking — these fail loudly instead.
  const bundle = JSON.parse(
    readFileSync(`${ROOT}data/corridor-ref/2026-08-18-fuel-v4.json`, "utf8"),
  ) as {
    fuels: { id: string; family: string }[];
    vesselTypes: { id: string; deprecated?: boolean }[];
    countries: { id: string }[];
  };
  const options = (id: string) =>
    [...(PARAMS.find((p) => p.id === id)?.options ?? [])].sort();

  it("green fuels", () => {
    expect(options("green.fuelId")).toEqual(
      bundle.fuels.filter((f) => f.family === "green").map((f) => f.id).sort(),
    );
  });

  it("fossil fuels", () => {
    expect(options("fossil.fuelId")).toEqual(
      bundle.fuels.filter((f) => f.family === "fossil").map((f) => f.id).sort(),
    );
  });

  it("non-retired vessel classes", () => {
    expect(options("vessel.typeId")).toEqual(
      bundle.vesselTypes.filter((v) => !v.deprecated).map((v) => v.id).sort(),
    );
  });

  it("countries", () => {
    expect(options("cargo.countryId")).toEqual(
      bundle.countries.map((c) => c.id).sort(),
    );
  });

  it("engine types match the fuel-emissions dataset", () => {
    const fe = JSON.parse(
      readFileSync(
        `${ROOT}data/fuel-emissions-ref/2026-08-17-ets-carbon-4.json`,
        "utf8",
      ),
    ) as { methaneSlip: { byEngine: { engine: string }[] } };
    expect(options("green.emissions.engineType")).toEqual(
      fe.methaneSlip.byEngine.map((e) => e.engine).sort(),
    );
  });
});
