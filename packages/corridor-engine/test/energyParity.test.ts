/**
 * Delivered-energy parity on the abatement comparison (v7, Change 3).
 *
 * `CO2 abated = vessels × (fossil t × fossil EF − green t × green EF)` is a
 * mass comparison. It only says something about the same transport work when
 * the two tonnages carry the same delivered energy. The derived chain makes
 * that true by construction; a one-sided burn override breaks it silently.
 * The engine discloses the divergence — it never clamps, rescales or blocks.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  migrateScenarioInput,
  parseRefBundle,
  resolveScenario,
  type ScenarioInput,
} from "@h2map/corridor-schema";
import { evaluateScenario } from "../src/index";

const bundle = parseRefBundle(
  JSON.parse(
    readFileSync(
      new URL("../../../data/corridor-ref/2026-07-30-excel-v1.json", import.meta.url),
      "utf8",
    ),
  ),
);

const scenario = (edit?: (i: ScenarioInput) => void): ScenarioInput => {
  const { input } = migrateScenarioInput(
    JSON.parse(
      readFileSync(
        new URL("../../../fixtures/golden/corridor/excel-baseline.input.json", import.meta.url),
        "utf8",
      ),
    ) as unknown,
  );
  edit?.(input);
  return input;
};

const parity = (edit?: (i: ScenarioInput) => void) =>
  evaluateScenario(resolveScenario(scenario(edit), bundle)).energyParity;

describe("delivered-energy parity", () => {
  it("is exactly 1.000 under the derived chain", () => {
    // Both sides solve the same 2 × distance × roundtrips × GJ/nm against
    // their own LHV, so the delivered energy is identical by construction.
    // This is why the check is free on every un-overridden scenario.
    const p = parity();
    expect(p.ratio).toBeCloseTo(1, 12);
    expect(p.divergence).toBeCloseTo(0, 12);
    expect(p.diverged).toBe(false);
  });

  it("fires when ONE side's burn is overridden", () => {
    // The trap: the model would otherwise report abatement from an
    // energy-mismatched comparison with nothing flagged.
    const p = parity((i) => {
      i.green.overrides.fuelTonnesPerVesselYear = 3000;
    });
    expect(p.diverged).toBe(true);
    expect(Math.abs(p.divergence!)).toBeGreaterThan(0.05);
  });

  it("stays quiet for a deliberately energy-matched override pair", () => {
    // The shipped Chilean pairing: 5,700 t NH3 against 2,638 t LSFO is
    // energy-matched to within a rounding, and must not cry wolf.
    const p = parity((i) => {
      i.green.overrides.fuelTonnesPerVesselYear = 5700;
      i.fossil.overrides.fuelTonnesPerVesselYear = 2638;
    });
    expect(p.diverged).toBe(false);
    expect(Math.abs(p.divergence!)).toBeLessThan(0.05);
  });

  it("does not clamp, rescale or block — the abated figure is unchanged", () => {
    // Disclosure only. A diverged scenario still reports its abatement; the
    // user may have reason to compare unequal work and should simply know.
    const matched = evaluateScenario(resolveScenario(scenario(), bundle));
    const skewed = evaluateScenario(
      resolveScenario(
        scenario((i) => {
          i.green.overrides.fuelTonnesPerVesselYear = 3000;
        }),
        bundle,
      ),
    );
    expect(skewed.energyParity.diverged).toBe(true);
    // The number still computes from the mass comparison as before — the
    // engine reports it and flags it rather than silently correcting it.
    expect(Number.isFinite(skewed.summary.co2AbatedTonnes)).toBe(true);
    expect(skewed.summary.co2AbatedTonnes).not.toBe(
      matched.summary.co2AbatedTonnes,
    );
  });

  it("reports the direction, not just the magnitude", () => {
    // >1 means the GREEN side delivers more energy, which flatters the
    // comparison; <1 means the reverse. A bare magnitude would not say which.
    const greenHeavy = parity((i) => {
      i.green.overrides.fuelTonnesPerVesselYear = 6000;
    });
    const greenLight = parity((i) => {
      i.green.overrides.fuelTonnesPerVesselYear = 500;
    });
    expect(greenHeavy.ratio!).toBeGreaterThan(1);
    expect(greenLight.ratio!).toBeLessThan(1);
    expect(greenHeavy.divergence!).toBeGreaterThan(0);
    expect(greenLight.divergence!).toBeLessThan(0);
  });

  it("carries the delivered energies themselves, not only the ratio", () => {
    const p = parity();
    expect(p.greenMjPerYear).toBeGreaterThan(0);
    expect(p.fossilMjPerYear).toBeGreaterThan(0);
    expect(p.ratio).toBeCloseTo(p.greenMjPerYear / p.fossilMjPerYear, 12);
  });
});
