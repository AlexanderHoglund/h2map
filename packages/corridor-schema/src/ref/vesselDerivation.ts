/**
 * The parametric vessel layer: resolving a ship the catalogue does not name.
 *
 * A lookup table fails on every size that is not in it. The IMO EEDI
 * reference lines fix the SHAPE problem — they are regression fits of
 * carbon intensity against deadweight, per ship type, embedded in MARPOL
 * Annex VI Regulation 24 — so an authoritative size exponent comes for free
 * and any dwt resolves:
 *
 *     reference EEDI [gCO2/t·nm] = a × capacity^(−c)
 *     gCO2/nm                    = a × capacity^(1−c)
 *     GJ/nm                      = gCO2/nm × LHV / (CF × 10⁶) × k
 *
 * `k` is a per-family calibration: the reference lines were regressed on
 * ships built 1999–2009 at DESIGN speed, and a modern ship at OPERATING
 * speed sits below that line. The gap differs by family — bulk carriers
 * steam near design speed (k ≈ 0.83) while container ships slow-steam well
 * below theirs (k ≈ 0.65) — which is why one global calibration would be
 * wrong. It is FITTED, not sourced: it carries the unverified badge and is
 * the first thing to revisit with better data.
 *
 * Everything here is derivation, not new evidence. A named class always
 * wins; this is what happens when there isn't one.
 */

import type { RefBundle, RefVesselType } from "./bundle";

/** HFO lower heating value, MJ/kg — the EEDI reference fuel. */
const LHV_HFO_MJ_PER_KG = 40.2;
/** HFO carbon factor, gCO2 per g fuel. */
const CF_HFO = 3.114;

export type VesselSource = "catalogue" | "derived";

export interface DerivedVessel {
  /** How the figure was obtained — drives the BENCHMARK vs DERIVED badge. */
  source: VesselSource;
  gjPerNm: number;
  capexUsdM: number;
  opexUsdMPerYear: number;
  family: string;
  dwtTonnes: number;
  /** The named rows the cost figures were interpolated between. */
  costAnchors?: { lower: string | null; upper: string | null };
  /**
   * Set when the request sits outside the family's anchor range, so the
   * cost figures are an EXTRAPOLATION rather than an interpolation. Same
   * disclosure pattern as the synthesis scale factor.
   */
  extrapolated?: boolean;
  /**
   * Set for families the catalogue barely covers (one or two anchors), where
   * `k` itself is effectively uncalibrated: gas, general cargo, ro-ro,
   * ro-pax, vehicle carriers.
   */
  uncalibratedFamily?: boolean;
  notes: string[];
}

/** Families with too few anchors for the calibration to mean much. */
const THIN_FAMILIES = new Set(["gas", "gencargo", "roro", "ropax", "pctc"]);

/**
 * GJ/nm from the family's EEDI reference line.
 *
 * The bulk-carrier dwt CAP is load-bearing: MEPC 75 amended that row so the
 * line is evaluated at 279,000 dwt for any larger ship. Above the cap the
 * intensity is held flat while capacity keeps growing, so GJ/nm becomes
 * LINEAR in dwt. Drop the cap and a Valemax comes out badly wrong.
 */
export function gjPerNmFromEedi(
  bundle: RefBundle,
  family: string,
  dwtTonnes: number,
): number {
  const d = bundle.vesselDerivation;
  if (!d) throw new Error(`bundle ${bundle.bundleId} carries no vesselDerivation`);
  const line = d.eediReferenceLines[family];
  if (!line) {
    throw new Error(
      `no EEDI reference line for family "${family}" in ${bundle.bundleId}`,
    );
  }
  const k = d.familyCalibration[family];
  if (k === undefined) {
    throw new Error(`no family calibration for "${family}" in ${bundle.bundleId}`);
  }
  const capacity = line.capfrac * dwtTonnes;
  // The cap applies to the REFERENCE capacity only — capacity itself keeps
  // growing, which is exactly what makes GJ/nm linear past the cap.
  const referenceCapacity =
    line.cap !== null ? Math.min(capacity, line.cap) : capacity;
  const gCo2PerNm = line.a * referenceCapacity ** -line.c * capacity;
  return (gCo2PerNm * LHV_HFO_MJ_PER_KG) / (CF_HFO * 1e6) * k;
}

/** Linear interpolation between two anchors, clamped reporting outside them. */
function interpolate(
  x: number,
  lower: { x: number; y: number } | null,
  upper: { x: number; y: number } | null,
): { value: number; extrapolated: boolean } {
  if (lower && upper) {
    if (upper.x === lower.x) return { value: lower.y, extrapolated: false };
    const t = (x - lower.x) / (upper.x - lower.x);
    return { value: lower.y + t * (upper.y - lower.y), extrapolated: false };
  }
  // Outside the anchor range: hold the nearest anchor's value and SAY SO
  // rather than extrapolating a cost curve nobody fitted. A newbuild price
  // is not a smooth function of dwt beyond the sizes actually quoted.
  const only = lower ?? upper;
  if (!only) throw new Error("no cost anchors for this family");
  return { value: only.y, extrapolated: true };
}

/**
 * Resolve a vessel by family and size.
 *
 * 1. A named class of the same family within `tolerance` of the requested
 *    size wins outright — full provenance, BENCHMARK badge.
 * 2. Otherwise GJ/nm derives from the EEDI line × k, and the cost figures
 *    interpolate between the bracketing named classes — DERIVED badge.
 *
 * Deprecated rows are never matched: they exist so old scenarios keep
 * resolving, not to be offered for new ones.
 */
export function resolveVesselBySize(
  bundle: RefBundle,
  family: string,
  dwtTonnes: number,
  tolerance = 0.05,
): DerivedVessel {
  const notes: string[] = [];
  const candidates = bundle.vesselTypes.filter(
    (v) =>
      v.family === family &&
      v.dwtTonnes !== undefined &&
      v.deprecated !== true,
  );

  // --- 1. a named class close enough to be the answer --------------------
  let best: RefVesselType | null = null;
  let bestGap = Infinity;
  for (const v of candidates) {
    const gap = Math.abs(v.dwtTonnes! - dwtTonnes) / dwtTonnes;
    if (gap < bestGap) {
      best = v;
      bestGap = gap;
    }
  }
  if (best && bestGap <= tolerance) {
    return {
      source: "catalogue",
      gjPerNm: best.gjPerNm,
      capexUsdM: best.capexUsdM,
      opexUsdMPerYear: best.opexUsdMPerYear,
      family,
      dwtTonnes: best.dwtTonnes!,
      notes: [
        `Named class ${best.id} (${best.dwtTonnes!.toLocaleString("en-US")} dwt), within ${(tolerance * 100).toFixed(0)}% of the requested size.`,
      ],
    };
  }

  if (candidates.length === 0) {
    throw new Error(
      `no vessel classes for family "${family}" in ${bundle.bundleId}`,
    );
  }

  // --- 2. derive ---------------------------------------------------------
  const gjPerNm = gjPerNmFromEedi(bundle, family, dwtTonnes);
  const k = bundle.vesselDerivation!.familyCalibration[family]!;
  notes.push(
    `GJ/nm derived from the IMO EEDI reference line for ${family} × k=${k} (fitted calibration, unverified).`,
  );

  const sorted = [...candidates].sort((a, b) => a.dwtTonnes! - b.dwtTonnes!);
  const below = [...sorted].reverse().find((v) => v.dwtTonnes! <= dwtTonnes) ?? null;
  const above = sorted.find((v) => v.dwtTonnes! >= dwtTonnes) ?? null;

  const capex = interpolate(
    dwtTonnes,
    below ? { x: below.dwtTonnes!, y: below.capexUsdM } : null,
    above ? { x: above.dwtTonnes!, y: above.capexUsdM } : null,
  );
  const opex = interpolate(
    dwtTonnes,
    below ? { x: below.dwtTonnes!, y: below.opexUsdMPerYear } : null,
    above ? { x: above.dwtTonnes!, y: above.opexUsdMPerYear } : null,
  );

  const extrapolated = capex.extrapolated || opex.extrapolated;
  if (extrapolated) {
    const anchor = below ?? above!;
    notes.push(
      `Requested size is outside this family's anchor range (${sorted[0]!.dwtTonnes!.toLocaleString("en-US")}–${sorted[sorted.length - 1]!.dwtTonnes!.toLocaleString("en-US")} dwt); cost held at the nearest anchor ${anchor.id} rather than extrapolated.`,
    );
  }
  if (THIN_FAMILIES.has(family)) {
    notes.push(
      `Family "${family}" has only ${candidates.length} anchor(s) — its calibration is effectively unvalidated. Treat as indicative.`,
    );
  }

  return {
    source: "derived",
    gjPerNm,
    capexUsdM: capex.value,
    opexUsdMPerYear: opex.value,
    family,
    dwtTonnes,
    costAnchors: { lower: below?.id ?? null, upper: above?.id ?? null },
    ...(extrapolated ? { extrapolated: true } : {}),
    ...(THIN_FAMILIES.has(family) ? { uncalibratedFamily: true } : {}),
    notes,
  };
}
