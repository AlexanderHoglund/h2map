/**
 * Fix #1 (Chilean run): the pre/post-regulation reporting split. The
 * headline gap folds regulation in; published studies report the
 * pre-regulation gap with regulation as a separate downstream line. Both
 * must be first-class outputs, with the exact identity
 * `post === pre + netRegulatoryEffect`.
 */

import { describe, expect, it } from "vitest";
import { parseRefBundle, resolveScenario } from "@h2map/corridor-schema";
import { evaluateScenario } from "../src/index";
import { loadRefBundleJson } from "./golden/loader";
import { chileReferenceInput, chileStudyCalibrationInput } from "./reference/chile";

describe("reporting: pre/post-regulation split (Chilean reference)", () => {
  const bundle = parseRefBundle(loadRefBundleJson("2026-07-30-excel-v1"));
  const result = evaluateScenario(resolveScenario(chileReferenceInput(), bundle));
  const r = result.reporting;

  it("pre-regulation gap matches the study reconstruction (2012.44 ± 0.01)", () => {
    expect(r.gapPvPreRegulationUsdM).toBeCloseTo(2012.44, 2);
  });

  it("post-regulation gap is the headline (1819.48 ± 0.01 under WTW, v6 refined)", () => {
    // v6: green ammonia stops being free (certified 15 + slip + pilot =
    // blend 22.14; fossil 91.744) — the refined default headline.
    expect(r.gapPvPostRegulationUsdM).toBeCloseTo(1819.48, 2);
    expect(r.gapPvPostRegulationUsdM).toBe(result.summary.gapPvUsdM);
  });

  it("post === pre + netRegulatoryEffect, exactly", () => {
    expect(r.gapPvPostRegulationUsdM - r.gapPvPreRegulationUsdM).toBe(
      r.netRegulatoryEffectUsdM,
    );
  });

  it("side pre-regulation PVs match the study's published totals", () => {
    // Study: green $2,850m, fossil (ex-regulation) $850m.
    expect(r.greenPreRegulationPvUsdM).toBeCloseTo(2850.66, 2);
    expect(r.fossilPreRegulationPvUsdM).toBeCloseTo(838.22, 2);
  });

  it("unit metrics split: pre ≈ the study's $80/t, post = the headline", () => {
    expect(r.costPerUnitPreRegulationUsd).toBeCloseTo(81.31, 2);
    expect(r.costPerUnitPostRegulationUsd).toBe(result.summary.costPerUnitUsd);
    expect(r.costPerTonneCo2PostRegulationUsd).toBe(
      result.summary.costPerTonneCo2Usd,
    );
  });
});

describe("fix #2: self-designed CO2 price follows flags.emissionsBasis", () => {
  const bundle = parseRefBundle(loadRefBundleJson("2026-07-30-excel-v1"));

  it("wellToWake (v6 refined): both sides pay — fossil 253.71, green 60.75", () => {
    const res = evaluateScenario(
      resolveScenario(chileReferenceInput("wellToWake"), bundle),
    );
    // Derived factors: fossil 91.744 over LHV 40,500; green blend 22.14.
    expect(res.summary.selfDesignedFossilPvUsdM).toBeCloseTo(253.71, 2);
    expect(res.summary.selfDesignedGreenPvUsdM).toBeCloseTo(60.75, 2);
  });

  it("combustion (v6 refined): 216.38 fossil / 20.70 green", () => {
    const res = evaluateScenario(
      resolveScenario(chileReferenceInput("combustion"), bundle),
    );
    expect(res.summary.selfDesignedFossilPvUsdM).toBeCloseTo(216.38, 2);
    expect(res.summary.selfDesignedGreenPvUsdM).toBeCloseTo(20.7, 2);
  });
});

describe("STUDY CALIBRATION (legacy factors) — the permanent reproduction pin", () => {
  const bundle = parseRefBundle(loadRefBundleJson("2026-07-30-excel-v1"));

  it("reproduces the MMMCZCS study exactly: $1,762.21m / 1,450,095 t / $250.23m", () => {
    const res = evaluateScenario(
      resolveScenario(chileStudyCalibrationInput(), bundle),
    );
    expect(res.reporting.gapPvPostRegulationUsdM).toBeCloseTo(1762.21, 2);
    expect(res.summary.co2AbatedTonnes).toBeCloseTo(1_450_095, 0);
    expect(res.summary.selfDesignedFossilPvUsdM).toBeCloseTo(250.23, 2);
    expect(res.summary.selfDesignedGreenPvUsdM).toBe(0);
    expect(res.reporting.gapPvPreRegulationUsdM).toBeCloseTo(2012.44, 2);
  });

  it("combustion basis: the Excel behaviour (212.63)", () => {
    const res = evaluateScenario(
      resolveScenario(chileStudyCalibrationInput("combustion"), bundle),
    );
    expect(res.summary.selfDesignedFossilPvUsdM).toBeCloseTo(212.63, 2);
  });
});
