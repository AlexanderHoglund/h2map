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
  baseKpis: { gapPvUsdM: number; costPerTonneCo2Usd: number };
  ranked: {
    id: string;
    range: readonly (string | number)[];
    gapAtLow: number;
    gapAtHigh: number;
    movementByKpi: Record<string, number>;
    signedByKpi: {
      gapPvUsdM: { atLow: number; atHigh: number };
      costPerTonneCo2Usd: { atLow: number; atHigh: number };
    } | null;
    absoluteByKpi: {
      gapPvUsdM: { atLow: number; atHigh: number };
      costPerTonneCo2Usd: { atLow: number; atHigh: number };
    } | null;
    worstOptionByKpi: {
      gapPvUsdM: { option: string; value: number; base: number };
      costPerTonneCo2Usd: { option: string; value: number; base: number };
    } | null;
  }[];
  kpis: { id: string }[];
};

const HEADLINE = ["gapPvUsdM", "costPerTonneCo2Usd"] as const;

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

describe("the absolute dollar display is the signed data's own arithmetic", () => {
  // The endpoint table no longer renders in §29 (the elasticity view leads,
  // and the tornado now draws it), but the ARTIFACT's contract stands: the
  // absolute endpoint dollars and the signed relative movements describe the
  // SAME sweep, so each must be recoverable from the other against the
  // artifact's own baseline. §29's leverage × exposure prose and §38's
  // movement column still quote this data; a regenerated artifact that
  // violates this mixed up its baseline, and the docs would quote dollars
  // the app cannot print.
  it("reproduces base × (1 + signed) at both endpoints of every numeric row", () => {
    for (const r of artifact.ranked) {
      if (!r.signedByKpi) continue;
      expect(r.absoluteByKpi, r.id).not.toBeNull();
      for (const kpi of HEADLINE) {
        const base = artifact.baseKpis[kpi];
        expect(r.absoluteByKpi![kpi].atLow, `${r.id} ${kpi} atLow`).toBeCloseTo(
          base * (1 + r.signedByKpi[kpi].atLow),
          9,
        );
        expect(r.absoluteByKpi![kpi].atHigh, `${r.id} ${kpi} atHigh`).toBeCloseTo(
          base * (1 + r.signedByKpi[kpi].atHigh),
          9,
        );
      }
    }
  });

  it("agrees exactly with the historical gap endpoint columns", () => {
    // gapAtLow/gapAtHigh predate absoluteByKpi and are kept for continuity;
    // both must be the same evaluation, byte for byte.
    for (const r of artifact.ranked) {
      if (!r.absoluteByKpi) continue;
      expect(r.absoluteByKpi.gapPvUsdM.atLow, r.id).toBe(r.gapAtLow);
      expect(r.absoluteByKpi.gapPvUsdM.atHigh, r.id).toBe(r.gapAtHigh);
    }
  });

  it("records a worst option that IS the movement figure, per choice and KPI", () => {
    // §29's choices table reads "lh2: $X". The named option must be one the
    // choice offers, and its distance from that choice's own baseline must be
    // exactly the relative movement the ranking uses — the dollar display and
    // the rank order can never disagree.
    for (const r of artifact.ranked) {
      if (r.signedByKpi) continue;
      expect(r.worstOptionByKpi, r.id).not.toBeNull();
      for (const kpi of HEADLINE) {
        const w = r.worstOptionByKpi![kpi];
        expect(r.range, `${r.id} ${kpi}`).toContain(w.option);
        expect(
          Math.abs(w.value - w.base) / w.base,
          `${r.id} ${kpi}`,
        ).toBeCloseTo(r.movementByKpi[kpi]!, 9);
      }
    }
  });

  it("pins the dollars §29 quotes for corridor length and other support", () => {
    // §29's leverage × exposure bullets walk the reader through reproducing
    // these by hand: distance to 100 nm / 5,000 nm on the reference corridor,
    // and other support to $50m/yr. If a regeneration moves them, the docs'
    // worked examples lie. (The endpoint table that once rendered the full
    // set is gone; only the figures the prose still quotes are pinned.)
    const dist = artifact.ranked.find((r) => r.id === "cargo.oneWayDistanceNm")!;
    expect(dist.absoluteByKpi!.gapPvUsdM.atLow.toFixed(1)).toBe("156.1");
    expect(Math.round(dist.absoluteByKpi!.costPerTonneCo2Usd.atLow)).toBe(11677);
    expect(Math.round(dist.absoluteByKpi!.costPerTonneCo2Usd.atHigh)).toBe(443);
    const support = artifact.ranked.find((r) => r.id === "regulation.selfOtherUsdM")!;
    expect(support.absoluteByKpi!.gapPvUsdM.atHigh.toFixed(1)).toBe("-462.9");
    // The coupled-double-count bullet quotes both consumption rows.
    const greenBurn = artifact.ranked.find((r) => r.id === "green.fuelTonnesPerVesselYear")!;
    expect(greenBurn.absoluteByKpi!.gapPvUsdM.atLow.toFixed(1)).toBe("150.3");
    expect(greenBurn.absoluteByKpi!.gapPvUsdM.atHigh.toFixed(1)).toBe("202.5");
    const fossilBurn = artifact.ranked.find((r) => r.id === "fossil.fuelTonnesPerVesselYear")!;
    expect(fossilBurn.absoluteByKpi!.gapPvUsdM.atLow.toFixed(1)).toBe("170.6");
    expect(fossilBurn.absoluteByKpi!.gapPvUsdM.atHigh.toFixed(1)).toBe("98.6");
  });

  it("brackets each sweep's own baseline: the range fixes hold", () => {
    // The three rows §29's open items named: a sweep whose range excludes
    // its own baseline shows two endpoint dollars the baseline sits outside
    // of, and the reader has no anchor. Fossil consumption now brackets the
    // derived 1,185 t/vessel/yr; fossil CAPEX starts at the already-afloat
    // fleet's $0; sulphur starts at the IMO accounting default 0.5 %S (its
    // own module-on baseline — the framework flip is documented in §29).
    const base = artifact.baseKpis.gapPvUsdM;
    const fossilBurn = artifact.ranked.find((r) => r.id === "fossil.fuelTonnesPerVesselYear")!;
    expect(fossilBurn.gapAtLow).toBeGreaterThan(base);
    expect(fossilBurn.gapAtHigh).toBeLessThan(base);
    const fossilCapex = artifact.ranked.find((r) => r.id === "vessel.fossil.capexUsdM")!;
    expect(fossilCapex.range[0]).toBe(0);
    expect(fossilCapex.gapAtLow).toBeCloseTo(base, 9);
    const sulphur = artifact.ranked.find((r) => r.id === "fossil.sulphurPercent")!;
    expect(sulphur.range[0]).toBe(0.5);
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
