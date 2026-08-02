/**
 * Firm power (realism pass, Task 2) — the corridor must not silently source a
 * carrier from a plant that could not physically produce it.
 */

import { describe, expect, it } from "vitest";
import { getSynthesisBenchmark } from "@h2map/corridor-schema";
import { capitalRecoveryFactor } from "../src/synthesis";
import { resolveFirming, type FirmingInputs } from "../src/firming";

/**
 * The reference build-here case: María Elena at 2,786 full-load hours
 * (31.8% duty) against e-ammonia's 85% requirement, sized to the corridor's
 * 59,850 t/yr nameplate.
 */
function referenceInputs(overrides: Partial<FirmingInputs> = {}): FirmingInputs {
  return {
    evaluatedDuty: 2786 / 8760,
    requiredDuty: getSynthesisBenchmark("e-ammonia").firmnessRequirement,
    h2CapitalUsd: 490e6, // 213 MW at the PR-1 basis
    h2OperatingUsd: 25e6,
    shapedElectricityUsdPerMwh: 32, // Chilean daytime solar
    firmPriceMultiplier: 1.9, // -> ~$60/MWh firm
    annualElectricityMwh: 1_000_000,
    gridUsdPerMwh: 70,
    gridEmissionFactorTco2PerMwh: 0.35,
    bufferCapexUsdPerKgH2: 500,
    annualH2Kg: 11_180_000, // 59,850 t NH3 x 0.178 t H2/t x 1000
    ...overrides,
  };
}

// The corridor discounts on its own timeline at its own WACC.
const annualise = (capitalUsd: number) => capitalUsd * capitalRecoveryFactor(0.08, 25);

describe("resolveFirming", () => {
  it("is inert when the site already meets the carrier's duty", () => {
    const r = resolveFirming(
      referenceInputs({ evaluatedDuty: 0.9, requiredDuty: 0.85 }),
      annualise,
    );
    expect(r.satisfied).toBe(true);
    expect(r.chosen).toBeNull();
    expect(r.options).toHaveLength(0);
    expect(r.dutyShortfallRatio).toBe(1);
  });

  it("gaseous H2 requires no firming (no downstream process)", () => {
    // The benchmark set has no plain-H2 carrier, but requiredDuty 0 must be
    // inert by construction — that is what makes the concept per-carrier.
    const r = resolveFirming(referenceInputs({ requiredDuty: 0 }), annualise);
    expect(r.satisfied).toBe(true);
  });

  it("fires on the reference case: 31.8% duty vs e-ammonia's 85%", () => {
    const r = resolveFirming(referenceInputs(), annualise);
    expect(r.satisfied).toBe(false);
    expect(r.evaluatedDuty).toBeCloseTo(0.318, 3);
    expect(r.requiredDuty).toBe(0.85);
    // The plant must run ~2.7x more of the time than the resource allows.
    expect(r.dutyShortfallRatio).toBeCloseTo(2.673, 2);
    expect(r.chosen).not.toBeNull();
    expect(r.options).toHaveLength(3);
  });

  it("returns every strategy, cheapest first, on one annualised basis", () => {
    const r = resolveFirming(referenceInputs(), annualise);
    const costs = r.options.map((o) => o.annualisedUsd);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
    expect(r.chosen).toBe(r.options[0]);
    expect(new Set(r.options.map((o) => o.strategy)).size).toBe(3);
  });

  it("shapes each strategy correctly: capital vs operating vs emissions", () => {
    const r = resolveFirming(referenceInputs(), annualise);
    const by = (s: string) => r.options.find((o) => o.strategy === s)!;
    // Buffer + oversize is capital-shaped.
    expect(by("buffer-oversize").capitalUsd).toBeGreaterThan(0);
    // Firm PPA and grid hybrid are purely operating.
    expect(by("firm-ppa").capitalUsd).toBe(0);
    expect(by("firm-ppa").operatingUsdPerYear).toBeGreaterThan(0);
    expect(by("grid-hybrid").capitalUsd).toBe(0);
    // ONLY the grid strategy imports emissions — it must never be free CO2.
    expect(by("buffer-oversize").emissionsTco2PerYear).toBe(0);
    expect(by("firm-ppa").emissionsTco2PerYear).toBe(0);
    expect(by("grid-hybrid").emissionsTco2PerYear).toBeGreaterThan(0);
  });

  it("prices the firm PPA as the step from shaped to firm, not the full price", () => {
    const inputs = referenceInputs();
    const firm = resolveFirming(inputs, annualise).options.find(
      (o) => o.strategy === "firm-ppa",
    )!;
    // 1,000,000 MWh x $32 x (1.9 - 1) = $28.8m/yr
    expect(firm.operatingUsdPerYear).toBeCloseTo(28.8e6, 0);
  });

  it("scales with the size of the shortfall", () => {
    const mild = resolveFirming(referenceInputs({ evaluatedDuty: 0.7 }), annualise);
    const severe = resolveFirming(referenceInputs({ evaluatedDuty: 0.2 }), annualise);
    expect(severe.chosen!.annualisedUsd).toBeGreaterThan(mild.chosen!.annualisedUsd);
  });

  it("brings the reference case into the NEOM-scaled band on a capital-equivalent basis", () => {
    // The acceptance target is a corridor-scale green ammonia complex worth
    // $1,030-1,390m (NEOM $7,000/tpa scaled to 59,850 t/yr at exponent 0.7
    // and 0.6). Firming does NOT have to arrive as capital: the cheapest
    // resolution here is a firm PPA, which is operating-shaped. Compare
    // like-for-like by capitalising the chosen option at the same CRF.
    const r = resolveFirming(referenceInputs(), annualise);
    const crf = capitalRecoveryFactor(0.08, 25);
    const firmingCapitalEquivalentUsd =
      r.chosen!.capitalUsd + r.chosen!.operatingUsdPerYear / crf;
    const synthesisCapitalUsd = 278e6; // PR 2, NEOM-anchored at this nameplate
    const total =
      referenceInputs().h2CapitalUsd + synthesisCapitalUsd + firmingCapitalEquivalentUsd;
    expect(total).toBeGreaterThan(1_030e6);
    expect(total).toBeLessThan(1_390e6);
  });

  it("prefers the firm PPA over buffer+oversize at reference prices", () => {
    // Worth pinning because it is the substantive economic finding: closing a
    // 2.7x duty gap by building storage and oversizing the plant costs ~$828m
    // of capital (~$119m/yr annualised), four times the ~$29m/yr price step
    // of simply buying round-the-clock power. Real projects reach for the
    // buffer when firm power is unavailable, not when it is merely dearer.
    const r = resolveFirming(referenceInputs(), annualise);
    expect(r.chosen!.strategy).toBe("firm-ppa");
    const buffer = r.options.find((o) => o.strategy === "buffer-oversize")!;
    expect(buffer.annualisedUsd).toBeGreaterThan(3 * r.chosen!.annualisedUsd);
  });
});
