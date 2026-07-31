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
import { chileReferenceInput } from "./reference/chile";

describe("reporting: pre/post-regulation split (Chilean reference)", () => {
  const bundle = parseRefBundle(loadRefBundleJson("2026-07-30-excel-v1"));
  const result = evaluateScenario(resolveScenario(chileReferenceInput(), bundle));
  const r = result.reporting;

  it("pre-regulation gap matches the study reconstruction (2012.44 ± 0.01)", () => {
    expect(r.gapPvPreRegulationUsdM).toBeCloseTo(2012.44, 2);
  });

  it("post-regulation gap is the headline (1799.81 ± 0.01)", () => {
    expect(r.gapPvPostRegulationUsdM).toBeCloseTo(1799.81, 2);
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
