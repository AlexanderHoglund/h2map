/**
 * GMF Newcastlemax — a VALIDATION case, not a calibration target.
 *
 * The Global Maritime Forum's ammonia-corridor reconstruction publishes an
 * annual burn for a 210,000 dwt bulker on a 6,166 nm leg at 6 round trips:
 * 16,440 t NH₃ per vessel-year, ammonia only, excluding pilot fuel and
 * excluding port days. It is an independent figure to test the model
 * AGAINST — the model is not tuned to reproduce it, and these tests are
 * written so that tuning would be visible rather than rewarded.
 *
 * WHAT THE MODEL SAYS. Deriving from corridor geometry with the v2
 * catalogue (laden 6.784 / ballast 5.766 GJ/nm at a 13.0 kn service speed,
 * corrected per nautical mile at exponent 2.0):
 *
 *   GMF's stated speeds      11.50 / 12.50 kn  ->  21,163 t  (+28.7%)
 *   GMF's effective speeds   10.70 / 11.68 kn  ->  18,399 t  (+11.9%)
 *
 * "Effective" because GMF's own numbers disagree: 24 days at 11.5 kn is
 * 6,624 nm against the 6,166 nm it states, ~7% of slack, so the speeds
 * implied by its day count are lower than the speeds it prints.
 *
 * So the model runs 12–29% HIGH against GMF, depending on which of its two
 * speeds you believe. The research handoff reported +0.3% at the effective
 * speeds; that does not reproduce from the inputs it gives — not at
 * exponent 2.0, not at 3.0, and not with or without the laden/ballast
 * split. The nearest reconstruction (+2.9%) applies the whole-voyage figure
 * at 10.70 kn on BOTH legs, which is a different derivation from the one
 * the handoff describes. Reaching 16,440 t exactly needs a single 10.55 kn
 * on both legs.
 *
 * These tests therefore pin the BAND and its direction. A tolerance test
 * against 16,440 would be asserting a number nobody can derive; the useful
 * regression is "the model still lands where it lands, and still runs high".
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseRefBundle } from "@h2map/corridor-schema";

const bundle = parseRefBundle(
  JSON.parse(
    readFileSync(
      new URL("../../../data/corridor-ref/2026-08-16-vessel-v2.json", import.meta.url),
      "utf8",
    ),
  ),
);

/** GMF's published reconstruction. */
const GMF = {
  targetTonnesPerVesselYear: 16_440,
  oneWayNm: 6_166,
  roundTripsPerYear: 6,
  statedSpeeds: { laden: 11.5, ballast: 12.5 },
  /** Implied by GMF's own day count — its stated speeds overshoot the distance. */
  effectiveSpeeds: { laden: 10.7, ballast: 11.68 },
} as const;

const NH3_LHV_MJ_PER_TONNE = 18_600;

const row = () => {
  const v = bundle.vesselTypes.find((x) => x.id === "bulk-newcastlemax-210k");
  if (!v) throw new Error("bulk-newcastlemax-210k missing from the bundle");
  return v;
};

/** Annual ammonia burn, deriving from geometry at the given leg speeds. */
function derivedTonnes(ladenKn: number, ballastKn: number): number {
  const v = row();
  const svc = v.serviceSpeedKn!;
  // Per-NM correction, exponent 2.0: power ~ v³ gives GJ/day ~ v³, but
  // nm/day ~ v, so GJ/nm ~ v². Applying 3.0 here would understate.
  const laden = v.ladenGjPerNm! * (ladenKn / svc) ** 2;
  const ballast = v.ballastGjPerNm! * (ballastKn / svc) ** 2;
  const gj = (laden + ballast) * GMF.oneWayNm * GMF.roundTripsPerYear;
  return (gj * 1000) / NH3_LHV_MJ_PER_TONNE;
}

describe("GMF Newcastlemax validation", () => {
  it("carries the laden/ballast split and its service speed", () => {
    const v = row();
    expect(v.serviceSpeedKn).toBe(13);
    expect(v.ladenGjPerNm).toBeCloseTo(6.784, 3);
    expect(v.ballastGjPerNm).toBeCloseTo(5.766, 3);
    // The split must average back to the whole-voyage figure, or an
    // equal-leg voyage would stop reproducing the v1 scalar.
    expect((v.ladenGjPerNm! + v.ballastGjPerNm!) / 2).toBeCloseTo(v.gjPerNm, 6);
  });

  it("runs HIGH against GMF, by 12% at its effective speeds", () => {
    const t = derivedTonnes(
      GMF.effectiveSpeeds.laden,
      GMF.effectiveSpeeds.ballast,
    );
    expect(t).toBeGreaterThan(GMF.targetTonnesPerVesselYear);
    const rel = t / GMF.targetTonnesPerVesselYear - 1;
    // Pin the band, not a point: this is a validation gap being recorded,
    // not a tolerance the model is expected to meet.
    expect(rel).toBeGreaterThan(0.09);
    expect(rel).toBeLessThan(0.15);
  });

  it("runs higher still at GMF's stated speeds", () => {
    const t = derivedTonnes(GMF.statedSpeeds.laden, GMF.statedSpeeds.ballast);
    const rel = t / GMF.targetTonnesPerVesselYear - 1;
    expect(rel).toBeGreaterThan(0.25);
    expect(rel).toBeLessThan(0.32);
    // Stated speeds are FASTER than effective, so they must burn more —
    // if this ever inverts, the speed correction has the wrong sign.
    expect(t).toBeGreaterThan(
      derivedTonnes(GMF.effectiveSpeeds.laden, GMF.effectiveSpeeds.ballast),
    );
  });

  it("does not reproduce the handoff's +0.3% from the stated inputs", () => {
    // Recorded deliberately. The claim was 16,497 t at the effective
    // speeds; the derivation gives 18,399 t. Anyone who later makes this
    // test pass at +0.3% has changed the model, and should say why.
    const t = derivedTonnes(
      GMF.effectiveSpeeds.laden,
      GMF.effectiveSpeeds.ballast,
    );
    expect(Math.abs(t / 16_497 - 1)).toBeGreaterThan(0.05);
  });

  it("would need ~10.55 kn on BOTH legs to hit the target exactly", () => {
    // The single-speed solution, for whoever picks this up: it is not a
    // laden/ballast pair at all, which is the clue that the handoff's
    // reconstruction used the whole-voyage figure rather than the split.
    const t = derivedTonnes(10.55, 10.55);
    expect(t).toBeCloseTo(GMF.targetTonnesPerVesselYear, -2);
  });
});
