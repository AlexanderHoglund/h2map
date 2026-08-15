import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRefBundle } from "../src/ref/bundle";
import {
  gjPerNmFromEedi,
  resolveVesselBySize,
} from "../src/ref/vesselDerivation";

/**
 * The parametric layer. A lookup table fails on every size not in it; the
 * EEDI reference lines make any dwt resolvable. These tests pin the
 * behaviour that actually matters — the MEPC 75 dwt cap, the named-class
 * precedence, and the disclosure attached to a derived answer.
 */

const bundle = parseRefBundle(
  JSON.parse(
    readFileSync(
      new URL("../../../data/corridor-ref/2026-08-16-vessel-v2.json", import.meta.url),
      "utf8",
    ),
  ),
);

describe("EEDI-derived GJ/nm", () => {
  it("reproduces a catalogue row it was used to build", () => {
    // The Newcastlemax row is itself EEDI-derived, so the function must
    // return what the bundle stores — otherwise the two have drifted.
    const row = bundle.vesselTypes.find((v) => v.id === "bulk-newcastlemax-210k")!;
    expect(gjPerNmFromEedi(bundle, "bulk", 210_000)).toBeCloseTo(row.gjPerNm, 3);
  });

  it("applies the MEPC 75 bulk dwt cap — GJ/nm goes LINEAR past 279,000", () => {
    // The cap holds the reference INTENSITY flat while capacity keeps
    // growing. Below it the curve bends; above it, equal dwt steps must
    // give equal GJ/nm steps. Without the cap a Valemax comes out wrong.
    const at = (d: number) => gjPerNmFromEedi(bundle, "bulk", d);
    const stepAbove1 = at(320_000) - at(300_000);
    const stepAbove2 = at(340_000) - at(320_000);
    expect(stepAbove2).toBeCloseTo(stepAbove1, 6); // linear

    const stepBelow1 = at(120_000) - at(100_000);
    const stepBelow2 = at(140_000) - at(120_000);
    expect(stepBelow2).not.toBeCloseTo(stepBelow1, 6); // still bending
  });

  it("keeps the cap family-specific", () => {
    // Tankers have no cap, so their curve must keep bending at sizes where
    // the bulk line has already gone linear.
    const at = (d: number) => gjPerNmFromEedi(bundle, "tanker", d);
    const s1 = at(320_000) - at(300_000);
    const s2 = at(340_000) - at(320_000);
    expect(s2).not.toBeCloseTo(s1, 6);
  });

  it("refuses an unknown family rather than guessing", () => {
    expect(() => gjPerNmFromEedi(bundle, "submarine", 50_000)).toThrowError(
      /no EEDI reference line/,
    );
  });
});

describe("resolveVesselBySize", () => {
  it("prefers a named class within tolerance", () => {
    const r = resolveVesselBySize(bundle, "bulk", 209_000);
    expect(r.source).toBe("catalogue");
    expect(r.gjPerNm).toBeCloseTo(6.275, 3);
    expect(r.notes[0]).toMatch(/bulk-newcastlemax-210k/);
  });

  it("derives when no named class is close, and says so", () => {
    // 145,000 dwt sits between Capesize (180k) and Post-Panamax (93k).
    const r = resolveVesselBySize(bundle, "bulk", 145_000);
    expect(r.source).toBe("derived");
    expect(r.costAnchors).toEqual({
      lower: "bulk-postpanamax-93k",
      upper: "bulk-capesize-180k",
    });
    // Cost interpolates strictly between its anchors.
    expect(r.capexUsdM).toBeGreaterThan(42);
    expect(r.capexUsdM).toBeLessThan(75.5);
    expect(r.notes.join(" ")).toMatch(/EEDI reference line/);
  });

  it("never silently extrapolates a cost curve past the anchors", () => {
    // A newbuild price is not a smooth function of dwt beyond the sizes
    // actually quoted, so the nearest anchor is HELD and the extrapolation
    // is disclosed — the synthesis scale-factor pattern.
    const r = resolveVesselBySize(bundle, "bulk", 500_000);
    expect(r.extrapolated).toBe(true);
    expect(r.capexUsdM).toBe(118); // the VLOC anchor, held
    expect(r.notes.join(" ")).toMatch(/outside this family's anchor range/);
    // ...but the ENERGY figure still derives, because the EEDI line is
    // defined there (linear past the cap).
    expect(r.gjPerNm).toBeGreaterThan(0);
  });

  it("flags families the catalogue barely covers", () => {
    const r = resolveVesselBySize(bundle, "ropax", 20_000);
    expect(r.uncalibratedFamily).toBe(true);
    expect(r.notes.join(" ")).toMatch(/effectively unvalidated/);
  });

  it("never matches a retired row", () => {
    // The v1 rows exist so old scenarios keep resolving. Offering one as
    // the answer to a NEW size request would resurrect a superseded figure.
    const r = resolveVesselBySize(bundle, "bulk", 58_000);
    expect(r.source).toBe("catalogue");
    expect(r.notes[0]).toMatch(/bulk-handymax-58k/);
    expect(r.notes[0]).not.toMatch(/^Named class handymax-bulk-58k/);
  });

  it("is monotonic in size within a family", () => {
    // Bigger ship, more energy per mile — if this ever inverts the
    // reference line or the cap has been misapplied.
    let prev = 0;
    for (const dwt of [40_000, 80_000, 120_000, 200_000, 300_000, 400_000]) {
      const g = gjPerNmFromEedi(bundle, "bulk", dwt);
      expect(g).toBeGreaterThan(prev);
      prev = g;
    }
  });
});
