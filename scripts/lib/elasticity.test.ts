import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROOT } from "./serviceDeps";
import { COUPLING_GROUPS, PARAMS, perturbationType } from "../corridor/lib/params";

/**
 * The elasticity artifact — LEVERAGE, the computed half of impact.
 *
 * These assert PROPERTIES rather than values. The numbers are functions of the
 * reference data and will move with it; what must not move is that elasticity
 * is range-independent, that coupled inputs are reported as one honest figure
 * beside their explanatory parts, and that a coupled energy move leaves the
 * corridor physically consistent.
 */

interface PerKpi {
  up: number;
  down: number;
  mean: number;
  asymmetric?: boolean;
}
interface ScenarioCell {
  measurable: boolean;
  reason?: string;
  perKpi?: Record<string, PerKpi>;
  parityHeld?: boolean;
}
const art = JSON.parse(
  readFileSync(`${ROOT}data/corridor-sensitivity/elasticity.json`, "utf8"),
) as {
  relativeStep: number;
  absolutePpStep: number;
  archetypeBase: Record<string, Record<string, number>>;
  rows: {
    id: string;
    perturbationType: string;
    coupled: boolean;
    couplingGroups: string[];
    scenarios: Record<string, ScenarioCell>;
  }[];
  groups: { id: string; members: string[]; scenarios: Record<string, ScenarioCell> }[];
  unperturbable: { id: string; reason: string }[];
};

const row = (id: string) => art.rows.find((r) => r.id === id);
const gapMean = (cell: ScenarioCell | undefined): number | null =>
  cell?.measurable && cell.perKpi ? cell.perKpi.gapPvUsdM!.mean : null;

describe("the artifact is complete and self-consistent", () => {
  it("measures a non-trivial number of fields", () => {
    // Anti-vacuity: an empty artifact would satisfy every assertion below.
    expect(art.rows.length).toBeGreaterThan(20);
    expect(art.groups.length).toBe(COUPLING_GROUPS.length);
  });

  it("accounts for every sweep parameter exactly once", () => {
    // A param that is neither measured nor explained has been dropped in
    // silence, which is the failure mode this file exists to prevent.
    const seen = [...art.rows.map((r) => r.id), ...art.unperturbable.map((u) => u.id)];
    expect([...seen].sort()).toEqual([...PARAMS.map((p) => p.id)].sort());
  });

  it("gives every unperturbable field a stated reason", () => {
    for (const u of art.unperturbable) {
      expect(u.reason.length, u.id).toBeGreaterThan(20);
    }
  });

  it("publishes the base KPIs the elasticities are normalised by", () => {
    // Without these the columns are unreadable: B's gap is a small difference
    // between two large sides, so its elasticities run ~10x A's.
    for (const key of ["A", "B", "C"]) {
      expect(art.archetypeBase[key]?.gapPvUsdM, key).toBeGreaterThan(0);
    }
  });

  it("classifies perturbation type by meaning, not by range", () => {
    for (const r of art.rows) {
      expect(r.perturbationType, r.id).toBe(perturbationType(r.id));
    }
    // Rates move in points...
    expect(perturbationType("cargo.wacc")).toBe("absolutePp");
    expect(perturbationType("regulation.etsScope")).toBe("absolutePp");
    // ...while these merely LOOK like fractions and are ordinary quantities.
    expect(perturbationType("regulation.eurUsd")).toBe("relative");
    expect(perturbationType("green.efficiencyRatio")).toBe("relative");
    expect(perturbationType("green.combustionEf")).toBe("relative");
  });
});

describe("elasticity is a model property, not a range choice", () => {
  it("is linear where the model is linear", () => {
    // A lump-sum capital field enters the PV linearly, so nudging it up and
    // down must give the same magnitude. Any asymmetry here would mean the
    // harness itself is introducing curvature.
    const k = row("vessel.green.capexUsdM")!.scenarios.A!.perKpi!.gapPvUsdM!;
    expect(Math.abs(k.up)).toBeCloseTo(Math.abs(k.down), 9);
    expect(k.asymmetric).toBe(false);
  });

  it("does not inherit the sweep's range arbitrariness", () => {
    // The sweep ranks `selfOtherUsdM` #1 at 376.4% purely because its range is
    // $0-50m. Here it is measured by a proportional nudge, so it cannot
    // dominate on range width alone — it is either measurable on its own
    // merits or explicitly unperturbable.
    const r = row("regulation.selfOtherUsdM");
    const explained = art.unperturbable.some((u) => u.id === "regulation.selfOtherUsdM");
    expect(Boolean(r) || explained).toBe(true);
    if (r) {
      const a = gapMean(r.scenarios.A);
      if (a !== null) expect(a).toBeLessThan(3.8); // the sweep's 376.4%
    }
  });
});

describe("coupling: the group figure is the honest one", () => {
  const group = (id: string) => art.groups.find((g) => g.id === id)!;

  it("reports energy demand as ONE number, well below the sum of its parts", () => {
    // THE HEADLINE FAULT. The sweep scores green and fossil consumption
    // independently (21.0% and 41.1%) though they are energy-matched. Moved
    // together on scenario A the group measures ~0.27 against a naive
    // sum-of-parts ~0.62 — the one-at-a-time view overstates by ~2.3x.
    const g = group("energy-demand");
    const together = gapMean(g.scenarios.A)!;
    const sumOfParts = g.members
      .map((id) => gapMean(row(id)?.scenarios.A) ?? 0)
      .reduce((a, b) => a + b, 0);
    expect(together).toBeGreaterThan(0);
    expect(together).toBeLessThan(sumOfParts * 0.75);
  });

  it("keeps both sides energy-matched inside the perturbed scenario", () => {
    // Asserted on the PERTURBED SCENARIO, not on its result — that is exactly
    // what distinguishes a coupled move from the sweep it replaces. Moving one
    // side's burn alone drives energyParity to 1.30 with diverged: true.
    const g = group("energy-demand");
    for (const key of ["A", "B", "C"]) {
      const cell = g.scenarios[key]!;
      if (!cell.measurable) continue;
      expect(cell.parityHeld, `${key} parity`).toBe(true);
    }
  });

  it("shows fleet capital largely cancelling on the gap", () => {
    // Green capex +0.2545 and fossil -0.2024 on scenario A: a yard-price shock
    // raises BOTH sides, so the gap barely moves. Swept apart they score 0.457
    // between them; moved together, 0.052. The sign is the whole point.
    const green = row("vessel.green.capexUsdM")!.scenarios.A!.perKpi!.gapPvUsdM!;
    const fossil = row("vessel.fossil.capexUsdM")!.scenarios.A!.perKpi!.gapPvUsdM!;
    expect(Math.sign(green.up)).toBe(-Math.sign(fossil.up));
    expect(gapMean(group("fleet-capital").scenarios.A)!).toBeLessThan(
      Math.abs(green.up) + Math.abs(fossil.up),
    );
  });

  it("flags every coupled member as coupled", () => {
    const members = new Set(COUPLING_GROUPS.flatMap((g) => g.members));
    for (const r of art.rows) {
      expect(r.coupled, r.id).toBe(members.has(r.id));
    }
  });
});

describe("elasticity is scenario-dependent, which is why there are three", () => {
  it("puts corridor length near zero on C and well above it on A", () => {
    // C types its burn, so distance reaches consumption through nothing. The
    // CONTRAST is asserted; the values belong to the reference data.
    const r = row("cargo.oneWayDistanceNm")!;
    const a = gapMean(r.scenarios.A)!;
    const c = gapMean(r.scenarios.C)!;
    expect(c).toBeLessThan(1e-9);
    expect(a).toBeGreaterThan(c + 0.05);
  });

  it("spreads at least one field across archetypes by more than 10x", () => {
    // If every field measured the same everywhere, running three scenarios
    // would be waste — this asserts the spread is real.
    const spreads = art.rows
      .map((r) => {
        const vs = ["A", "B", "C"]
          .map((k) => gapMean(r.scenarios[k]))
          .filter((v): v is number => v !== null && v > 0);
        return vs.length < 2 ? 0 : Math.max(...vs) / Math.min(...vs);
      })
      .filter((v) => Number.isFinite(v));
    expect(Math.max(...spreads)).toBeGreaterThan(10);
  });
});
