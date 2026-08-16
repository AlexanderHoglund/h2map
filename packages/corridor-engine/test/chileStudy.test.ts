/**
 * The Chilean corridor on the REPORT's own accounting — how close can the
 * model get to the published figures?
 *
 * The companion to chileModern.test.ts. That one releases the study's
 * assertions and scores where the model lands on its own; this one adopts
 * the report's emission accounting so every published figure comes back.
 * Neither is "the right answer" — they answer different questions, and the
 * pair is the honest presentation.
 *
 * The strongest check here is not the six tolerances but the identity: this
 * scenario lands BIT-IDENTICAL to `chileStudyCalibrationInput` — the frozen
 * pin in reporting.test.ts — while resolving against the CURRENT vessel
 * bundle rather than the 2026-07-30 one the pin uses. Same answers out of
 * two different catalogues means the reproduction is real and not a
 * coincidence of one frozen dataset.
 *
 * Imports the SHIPPED builder rather than restating the scenario, so this
 * cannot pass while the seeded project drifts away from it.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRefBundle, resolveScenario, parseScenarioInput } from "@h2map/corridor-schema";
import { evaluateScenario } from "../src/index";
import { loadRefBundleJson } from "./golden/loader";
import { chileStudyCalibrationInput } from "./reference/chile";
import {
  defaultScenario,
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

const run = (s = studyChileScenario()) => evaluateScenario(resolveScenario(s, bundle));

/** The MMMCZCS published totals. */
const REPORT = {
  greenPvUsdM: 2850,
  fossilPvUsdM: 850,
  gapPvUsdM: 2000,
  costPerCargoTonneUsd: 80,
  co2AbatedTonnes: 1_450_000,
  regulatoryBenefitUsdM: 250,
} as const;

describe("Chilean corridor as published — reproduces the report", () => {
  const r = run();

  it("green corridor NPV within 0.5%", () => {
    expect(
      Math.abs(r.reporting.greenPreRegulationPvUsdM / REPORT.greenPvUsdM - 1),
    ).toBeLessThan(0.005);
  });

  it("fossil corridor NPV within 2%", () => {
    expect(
      Math.abs(r.reporting.fossilPreRegulationPvUsdM / REPORT.fossilPvUsdM - 1),
    ).toBeLessThan(0.02);
  });

  it("pre-regulation gap within 1%", () => {
    expect(
      Math.abs(r.reporting.gapPvPreRegulationUsdM / REPORT.gapPvUsdM - 1),
    ).toBeLessThan(0.01);
  });

  it("incremental cost per cargo tonne within 2%", () => {
    expect(
      Math.abs(
        r.reporting.costPerUnitPreRegulationUsd / REPORT.costPerCargoTonneUsd - 1,
      ),
    ).toBeLessThan(0.02);
  });

  it("CO2 abated within 0.1% — the figure the shipped default cannot hit", () => {
    // The default lands 23% low because the refined method derives 22.14
    // gCO2e/MJ for green ammonia where the report assumes zero. Adopting the
    // report's factor is the whole reason this variant exists.
    expect(
      Math.abs(r.summary.co2AbatedTonnes / REPORT.co2AbatedTonnes - 1),
    ).toBeLessThan(0.001);
  });

  it("regulatory benefit within 1%", () => {
    // Same root cause: the $280/t proxy prices the CO2 series, so a green
    // side that emits nothing changes what the proxy collects.
    const benefit = -r.reporting.netRegulatoryEffectUsdM;
    expect(
      Math.abs(benefit / REPORT.regulatoryBenefitUsdM - 1),
    ).toBeLessThan(0.01);
  });
});

describe("it is the frozen calibration, on the current catalogue", () => {
  it("matches the pinned totals bit-for-bit", () => {
    // THE LOAD-BEARING TEST. reporting.test.ts pins $1,762.21m / 1,450,095 t
    // / $250.23m against the 2026-07-30 bundle. Reaching the same numbers
    // through the 2026-08-17 catalogue shows the reproduction survives a
    // change of reference data — which a tuned scenario would not.
    const pinned = evaluateScenario(
      resolveScenario(
        chileStudyCalibrationInput(),
        parseRefBundle(loadRefBundleJson("2026-07-30-excel-v1")),
      ),
    );
    const mine = run();
    for (const k of [
      "gapPvUsdM",
      "co2AbatedTonnes",
      "costPerUnitUsd",
      "costPerTonneCo2Usd",
      "selfDesignedFossilPvUsdM",
      "selfDesignedGreenPvUsdM",
    ] as const) {
      expect(mine.summary[k], k).toBe(pinned.summary[k]);
    }
  });

  it("resolves against the CURRENT bundle, not the frozen one", () => {
    // Without this the test above would be trivially true.
    expect(studyChileScenario().refBundleId).toBe(bundle.bundleId);
    expect(bundle.bundleId).not.toBe("2026-07-30-excel-v1");
  });
});

describe("what makes it differ from the shipped default", () => {
  it("is the green well-to-wake factor, and only that", () => {
    // Both scenarios share every cost input; the shipped default already
    // reproduces the report on green PV, fossil PV, the gap and $/t. The
    // divergence is entirely in the emission accounting, and pinning that
    // keeps the docs' explanation honest.
    const study = studyChileScenario();
    const shipped = defaultScenario();
    expect(study.green.overrides.wtwGco2PerMj).toBe(0);
    expect(shipped.green.overrides.wtwGco2PerMj).toBeNull();

    const a = run(study).reporting;
    const b = evaluateScenario(resolveScenario(shipped, bundle)).reporting;
    expect(a.greenPreRegulationPvUsdM).toBe(b.greenPreRegulationPvUsdM);
    expect(a.fossilPreRegulationPvUsdM).toBe(b.fossilPreRegulationPvUsdM);
    expect(a.gapPvPreRegulationUsdM).toBe(b.gapPvPreRegulationUsdM);
  });

  it("takes the legacy scalar path deliberately", () => {
    // `regulation.emissions` absent = workbook scalars. If a future
    // migration re-injects it, the explicit factors below would stop
    // driving the answer and this variant would silently become the
    // shipped default again.
    expect(studyChileScenario().regulation.emissions).toBeUndefined();
  });

  it("is a valid stored scenario", () => {
    expect(() =>
      parseScenarioInput(JSON.parse(JSON.stringify(studyChileScenario()))),
    ).not.toThrow();
  });

  it("leaves defaultScenario() untouched", () => {
    const before = JSON.stringify(defaultScenario());
    studyChileScenario();
    expect(JSON.stringify(defaultScenario())).toBe(before);
  });
});
