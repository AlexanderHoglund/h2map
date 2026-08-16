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
 * The answer diverges hard — a $334m gap against the study's $2,000m — and
 * that divergence is the deliverable, not a defect. It measures how far the
 * workbook's generic benchmarks sit from a real corridor-scale project: the
 * benchmark plant is 5% of the study's Atacama facility. A test below pins
 * that attribution so the explanation cannot quietly stop being true.
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
      new URL("../../../data/corridor-ref/2026-08-17-vessel-v3.json", import.meta.url),
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
  it("lands far below the study, and the plant is why", () => {
    // The finding, pinned as an attribution rather than a bare number. If
    // the benchmark plant is ever re-based, this test should be revisited
    // deliberately — not silently satisfied by a different cause.
    const bench = resolveScenario(benchmarkChileScenario(), bundle);
    const study = resolveScenario(defaultScenario(), bundle);
    const ratio =
      (bench.green.prodCapexUsdM.value as number) /
      (study.green.prodCapexUsdM.value as number);
    expect(ratio).toBeLessThan(0.1); // benchmark is <10% of the study plant

    const gap = evaluateScenario(resolveScenario(benchmarkChileScenario(), bundle))
      .reporting.gapPvPreRegulationUsdM;
    expect(gap).toBeLessThan(600);
    expect(gap).toBeGreaterThan(0); // still a real corridor, not a null run
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
