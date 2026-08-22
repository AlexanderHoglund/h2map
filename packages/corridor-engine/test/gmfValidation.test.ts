/**
 * GMF Newcastlemax — the study that moved the catalogue.
 *
 * The Global Maritime Forum's ammonia-corridor reconstruction publishes an
 * annual burn for a 210,000 dwt bulker on a 6,166 nm leg at 6 round trips:
 * 16,440 t NH₃ per vessel-year, ammonia only, excluding pilot fuel and port
 * days.
 *
 * THIS TEST INVERTED ON 2026-08-17, deliberately. It used to assert that the
 * model did NOT reproduce that figure, and carried the warning "anyone who
 * later makes this test pass has changed the model, and should say why".
 * The model did change: bundle 2026-08-21-cruise-v6 takes this hull's energy
 * from the study itself rather than from the EEDI reference line, because
 * four independent studies all disagreed with the line in the same
 * direction. So reproduction is now BY CONSTRUCTION, and what these tests
 * guard is that it stays reproduced.
 *
 * The finding that survives — and must not be erased by the inversion — is
 * the SIZE of the disagreement: the raw reference line still gives 6.275
 * GJ/nm where the study measures 4.130, +52%. That gap is the evidence that
 * `k` is mis-fitted, and it is pinned below.
 *
 * Re-measured 2026-08-21 on 2026-08-21-cruise-v6: verified-v5 benchmarks +
 * inflation default 0.023 (docs/corridor/research/verification-apply-sheet-v5.md).
 * Verification moved this hull's serviceSpeedKn 13 -> 11.3, so the
 * double-count trap below shrinks from -26% to -2.5%.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gjPerNmFromEedi, parseRefBundle } from "@h2map/corridor-schema";

const bundle = parseRefBundle(
  JSON.parse(
    readFileSync(
      new URL("../../../data/corridor-ref/2026-08-21-cruise-v6.json", import.meta.url),
      "utf8",
    ),
  ),
);

const GMF = {
  targetTonnesPerVesselYear: 16_440,
  oneWayNm: 6_166,
  roundTripsPerYear: 6,
  /** Stated in the study. Its own day count implies slower — see below. */
  statedSpeeds: { laden: 11.5, ballast: 12.5 },
  effectiveSpeeds: { laden: 10.7, ballast: 11.68 },
} as const;

const NH3_LHV_MJ_PER_TONNE = 18_600;

const row = () => {
  const v = bundle.vesselTypes.find((x) => x.id === "bulk-newcastlemax-210k");
  if (!v) throw new Error("bulk-newcastlemax-210k missing from the bundle");
  return v;
};

/** Annual ammonia burn at the given leg speeds, per-nm exponent 2.0. */
function derivedTonnes(ladenKn: number, ballastKn: number): number {
  const v = row();
  const svc = v.serviceSpeedKn!;
  const laden = v.ladenGjPerNm! * (ladenKn / svc) ** 2;
  const ballast = v.ballastGjPerNm! * (ballastKn / svc) ** 2;
  const gj = (laden + ballast) * GMF.oneWayNm * GMF.roundTripsPerYear;
  return (gj * 1000) / NH3_LHV_MJ_PER_TONNE;
}

describe("GMF Newcastlemax reproduction", () => {
  it("reproduces the published burn to within 0.2%", () => {
    // At the row's own service speed — which is the right comparison,
    // because the study figure is an AVERAGE over GMF's actual voyage. The
    // speed it was measured at is baked into the number.
    const v = row();
    const t = derivedTonnes(v.serviceSpeedKn!, v.serviceSpeedKn!);
    expect(Math.abs(t / GMF.targetTonnesPerVesselYear - 1)).toBeLessThan(0.002);
  });

  it("must not ALSO be slow-steam corrected — that double-counts", () => {
    // A trap worth pinning. GMF's ships steam at ~10.7/11.68 kn, and it is
    // tempting to apply that correction on top. But the 4.130 GJ/nm already
    // IS the burn at those speeds, so correcting again drops it below the
    // published figure — measured -2.5% now that the verified design speed
    // (11.3 kn) sits close to GMF's effective speeds, where the old 13 kn
    // row dropped 26%. The speed correction is for sailing a catalogue
    // hull faster or slower than ITS design point, not for re-applying the
    // conditions a study figure was measured under.
    const t = derivedTonnes(
      GMF.effectiveSpeeds.laden,
      GMF.effectiveSpeeds.ballast,
    );
    expect(t / GMF.targetTonnesPerVesselYear - 1).toBeLessThan(-0.02);
  });

  it("keeps the laden/ballast split averaging back to the scalar", () => {
    // The invariant that lets a split-based formula reproduce the scalar
    // formula on an equal-leg voyage. Rescaling onto the study figure had
    // to preserve it, and this is the check that it did.
    const v = row();
    expect((v.ladenGjPerNm! + v.ballastGjPerNm!) / 2).toBeCloseTo(v.gjPerNm, 6);
  });
});

describe("the EEDI line still disagrees — the durable finding", () => {
  it("runs 52% high against the study it was checked against", () => {
    // THE POINT OF KEEPING THIS TEST. The catalogue moved to study values,
    // but the reference line did not change and is still what any unnamed
    // size derives from. That it overstates this hull by half is the
    // evidence `k` is fitted wrong, and deleting this case when the
    // reproduction test above started passing would have erased it.
    const raw = gjPerNmFromEedi(bundle, "bulk", 210_000);
    expect(raw).toBeCloseTo(6.275, 3);
    expect(raw / row().gjPerNm - 1).toBeGreaterThan(0.5);
  });

  it("records the superseded value in the bundle, not just in a comment", () => {
    // So the disagreement is recoverable from the data alone — which is
    // also what the parametric layer reads to stay continuous.
    const p = row().provenance as { supersededEediGjPerNm?: number };
    expect(p.supersededEediGjPerNm).toBeCloseTo(6.275, 3);
  });

  it("still disagrees in the same direction across the family", () => {
    // Three studies, three overstatements. One outlier would be noise; a
    // consistent sign across independent sources is a calibration error.
    for (const id of ["bulk-newcastlemax-210k", "bulk-capesize-180k"]) {
      const v = bundle.vesselTypes.find((x) => x.id === id)!;
      const p = v.provenance as { supersededEediGjPerNm?: number };
      expect(p.supersededEediGjPerNm!).toBeGreaterThan(v.gjPerNm);
    }
  });
});
