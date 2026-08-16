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
      new URL("../../../data/corridor-ref/2026-08-17-vessel-v3.json", import.meta.url),
      "utf8",
    ),
  ),
);

describe("EEDI-derived GJ/nm", () => {
  it("reproduces a catalogue row it was used to build", () => {
    // gjPerNmFromEedi returns the RAW line. In v3 the Newcastlemax row no
    // longer sits on it — a study measured that hull at 4.130 against the
    // line's 6.275 — so this pins the gap rather than the agreement. That
    // 52% disagreement is the durable finding about `k`.
    const row = bundle.vesselTypes.find((v) => v.id === "bulk-newcastlemax-210k")!;
    const raw = gjPerNmFromEedi(bundle, "bulk", 210_000);
    expect(raw).toBeCloseTo(6.275, 3);
    expect(raw / row.gjPerNm - 1).toBeGreaterThan(0.4);
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
    expect(r.gjPerNm).toBeCloseTo(4.13, 3); // study-measured in v3
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

describe("study-corrected families stay continuous", () => {
  it("has no cliff where a study row meets a derived size", () => {
    // The defect this exists to prevent: the Newcastlemax reads 4.130
    // because a study measured it, but the untouched EEDI line gives ~6.35
    // at 215,000 dwt — a 55% jump for a 2.4% change in size, which would be
    // worse than the error the study figures fix. The derivation is
    // corrected against the catalogue's own rows so it lands between them.
    const at = (dwt: number) => resolveVesselBySize(bundle, "bulk", dwt).gjPerNm;
    const named = at(210_000);
    const justAbove = at(215_000);
    expect(Math.abs(justAbove / named - 1)).toBeLessThan(0.1);
  });

  it("keeps every step small across the whole family", () => {
    let worst = 0;
    let prev: number | null = null;
    for (let dwt = 40_000; dwt <= 340_000; dwt += 2_500) {
      const g = resolveVesselBySize(bundle, "bulk", dwt).gjPerNm;
      if (prev !== null) worst = Math.max(worst, Math.abs(g / prev - 1));
      prev = g;
    }
    // Steps are the catalogue's own spacing now, not a derivation artifact.
    expect(worst).toBeLessThan(0.1);
  });

  it("reports the correction rather than folding it in silently", () => {
    const r = resolveVesselBySize(bundle, "bulk", 150_000);
    expect(r.source).toBe("derived");
    expect(r.studyCorrection).toBeDefined();
    // The raw line is kept, so the adjustment is auditable.
    expect(r.studyCorrection!.rawEediGjPerNm).toBeGreaterThan(r.gjPerNm);
    expect(r.notes.join(" ")).toMatch(/Corrected/);
  });

  it("leaves an uncorrected family on the raw line", () => {
    // No study touched containers, so the factor must be ~1 there and the
    // correction machinery must not invent one.
    const r = resolveVesselBySize(bundle, "container", 120_000);
    const raw = gjPerNmFromEedi(bundle, "container", 120_000);
    expect(r.gjPerNm / raw).toBeCloseTo(
      r.studyCorrection?.factor ?? 1,
      6,
    );
  });
});
