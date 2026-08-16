/**
 * The Chilean corridor on IN-MODEL BENCHMARKS ONLY — nothing asserted.
 *
 * The third companion to chileStudy / chileModern. Those two ask "what did
 * the report say?" and "where does the model land when the burns are let
 * go?". This one asks the strictest version: what does the route cost if
 * every single figure comes from the reference bundle or the corridor's own
 * geometry, and no number is typed in at all?
 *
 * The defining property is therefore not a value but a PROVENANCE: zero
 * resolved fields carrying an override. That is what the tests here pin,
 * because it is the claim the scenario's name makes.
 *
 * WHAT THIS TEST MEASURED CHANGED, on 2026-08-18, and deliberately.
 *
 * It used to record a $334m gap against the study's $2,000m and attribute
 * almost all of it to one cause: the benchmark plant was 5% of the study's
 * Atacama facility, because production capex was an unsourced flat $55m that
 * did not scale with the corridor at all.
 *
 * Bundle 2026-08-18-fuel-v4 re-based those rows from researched data and made
 * them scale with demand, so the benchmark plant is now $827m — 75% of the
 * study's figure rather than 5% — and the gap is $1,520m, 76% of the study.
 *
 * The old assertion was written with a comment telling a future reader to
 * revisit it deliberately if the plant was ever re-based, rather than let it
 * be "silently satisfied by a different cause". This is that revision: the
 * claim below is now that the benchmark lands in the same ORDER as the study
 * without reaching it, which is a different and weaker statement than the one
 * it replaces. Landing ON the study would mean something had been tuned.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRefBundle, resolveScenario, parseScenarioInput } from "@h2map/corridor-schema";
import { evaluateScenario } from "../src/index";
import {
  benchmarkChileScenario,
  defaultScenario,
  modernChileScenario,
  studyChileScenario,
} from "../../../apps/web/lib/corridor/scenarioDefaults";

const bundle = parseRefBundle(
  JSON.parse(
    readFileSync(
      new URL("../../../data/corridor-ref/2026-08-18-fuel-v4.json", import.meta.url),
      "utf8",
    ),
  ),
);

type Scenario = ReturnType<typeof benchmarkChileScenario>;

/** Every resolved cost/factor field on both sides, with its provenance. */
function sources(s: Scenario): { key: string; source: string }[] {
  const r = resolveScenario(s, bundle) as unknown as Record<
    string,
    Record<string, { value: unknown; source?: string }>
  >;
  const out: { key: string; source: string }[] = [];
  for (const side of ["green", "fossil"] as const) {
    for (const [k, v] of Object.entries(r[side]!)) {
      if (v && typeof v === "object" && "source" in v && v.source) {
        out.push({ key: `${side}.${k}`, source: v.source });
      }
    }
  }
  return out;
}

describe("benchmarks only — the provenance claim", () => {
  it("carries NO overridden field, which is the whole point", () => {
    const overridden = sources(benchmarkChileScenario()).filter(
      (f) => f.source === "override",
    );
    expect(overridden.map((f) => f.key)).toEqual([]);
  });

  it("every field is a bundle benchmark or derived from the route", () => {
    const all = sources(benchmarkChileScenario());
    expect(all.length).toBeGreaterThan(20); // guards against an empty sweep
    for (const f of all) {
      expect(["benchmark", "derived"], f.key).toContain(f.source);
    }
  });

  it("asserts strictly less than every other Chilean variant", () => {
    // The ordering that makes the four examples a spectrum rather than a
    // pile. If a future edit adds an override here, this fails before the
    // scenario can quietly stop being what its name says.
    const n = (s: Scenario) => sources(s).filter((f) => f.source === "override").length;
    const benchmark = n(benchmarkChileScenario());
    expect(benchmark).toBe(0);
    for (const other of [defaultScenario(), studyChileScenario(), modernChileScenario()]) {
      expect(n(other)).toBeGreaterThan(benchmark);
    }
  });

  it("carries no fitted regulatory price either", () => {
    // A fitted input is an assertion even when it is not an override: the
    // $280/t self-designed price was calibrated to reproduce the study's
    // benefit, so it smuggles study knowledge into a benchmark-only run.
    const s = benchmarkChileScenario();
    expect(s.regulation.selfDesigned.enabled).toBe(false);
    expect(s.regulation.imoNetZero?.enabled).toBe(true);
  });
});

describe("what the divergence actually measures", () => {
  it("lands in the study's order of magnitude, without reaching it", () => {
    // Re-based 2026-08-18 (see the file header). The researched plant is
    // within striking distance of the study's fitted figure but below it,
    // which is the honest outcome: nothing here is tuned to the study, and
    // the residual is scale, FOAK and site quality.
    const bench = resolveScenario(benchmarkChileScenario(), bundle);
    const study = resolveScenario(defaultScenario(), bundle);
    const ratio =
      (bench.green.prodCapexUsdM.value as number) /
      (study.green.prodCapexUsdM.value as number);
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(1); // still below the study's fitted plant

    const gap = evaluateScenario(resolveScenario(benchmarkChileScenario(), bundle))
      .reporting.gapPvPreRegulationUsdM;
    // The study publishes ~$2,000m. Substantial closure, deliberately short:
    // an upper bound below it is what stops a future change from tuning its
    // way onto the published number and calling that agreement.
    expect(gap).toBeGreaterThan(1_000);
    expect(gap).toBeLessThan(1_800);
  });

  it("the benchmark plant SCALES — it is no longer a flat scalar", () => {
    // The defect that made the old 5% attribution possible: production capex
    // ignored prodNameplateTonnesPerYear entirely, so every corridor was
    // charged the same $55m regardless of how much fuel it needed.
    const half = benchmarkChileScenario();
    half.cargo = { ...half.cargo, roundtripsPerYear: half.cargo.roundtripsPerYear / 3 };
    const small = resolveScenario(half, bundle).green.prodCapexUsdM.value as number;
    const full = resolveScenario(benchmarkChileScenario(), bundle).green.prodCapexUsdM
      .value as number;
    expect(full).toBeGreaterThan(small * 1.5);
  });

  it("keeps the corridor's identity — it is the same route", () => {
    // Only the COSTS come from the benchmarks. Route, fleet and cargo are
    // still Mejillones-Japan, or this would be comparing two things.
    const s = benchmarkChileScenario();
    const d = defaultScenario();
    expect(s.cargo.oneWayDistanceNm).toBe(d.cargo.oneWayDistanceNm);
    expect(s.cargo.unitsPerYear).toBe(d.cargo.unitsPerYear);
    expect(s.cargo.vessels).toBe(d.cargo.vessels);
    expect(s.vessel.typeId).toBe(d.vessel.typeId);
    expect(s.green.fuelId).toBe(d.green.fuelId);
    expect(s.refBundleId).toBe(d.refBundleId);
  });

  it("still compares equal delivered energy", () => {
    // With both burns derived, parity is exact by construction — so the
    // CO2 figure is comparing like with like even though the costs are
    // generic.
    const r = evaluateScenario(resolveScenario(benchmarkChileScenario(), bundle));
    expect(r.energyParity?.ratio).toBeCloseTo(1, 9);
    expect(r.energyParity?.diverged).toBe(false);
  });
});

describe("hygiene", () => {
  it("is a valid stored scenario", () => {
    expect(() =>
      parseScenarioInput(JSON.parse(JSON.stringify(benchmarkChileScenario()))),
    ).not.toThrow();
  });

  it("leaves defaultScenario() untouched", () => {
    const before = JSON.stringify(defaultScenario());
    benchmarkChileScenario();
    expect(JSON.stringify(defaultScenario())).toBe(before);
  });
});
