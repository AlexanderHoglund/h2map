/**
 * Specific-capital scale correction — the one implementation.
 *
 * A plant's capital per tonne of annual capacity is not constant: a small
 * dedicated plant costs more per tpa than a world-scale one. The correction
 * is the classic power law,
 *
 *   factor = (nameplate / reference)^(exponent − 1) × foak
 *   capex  = capexUsdPerTpa × factor × nameplate
 *
 * with `exponent < 1` meaning larger is cheaper per tonne.
 *
 * WHY IT LIVES HERE. `corridor-engine` already had this, in
 * `synthesis.ts::synthesisScaleFactor`, for the build-here path. But
 * `resolve.ts` — which needs it for build-plant — is in `corridor-schema`,
 * and the engine depends on the schema, not the other way round. So the
 * function moves down to the schema package and the engine re-exports it;
 * writing a second copy in the resolver is what this file exists to avoid.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It takes a reference scale, an exponent
 * and a nameplate — nothing else. It knows nothing about sites, LCOH,
 * firming or carriers, which is what lets one function serve both paths.
 * The BENCHMARKS the two paths feed it are different quantities and must
 * stay that way: build-here passes a synthesis-island cost (the LCOH engine
 * carries generation separately), build-plant passes a complete-complex
 * cost that already includes renewables. Mixing them double-counts ~73% of
 * a green ammonia plant.
 */

/** Beyond this ratio from the reference, the power law is being stretched. */
export const SCALE_EXTRAPOLATION_LIMIT = 5;

export interface ScaleCorrection {
  /** The multiplier on specific capital ($/tpa) at this nameplate. */
  readonly factor: number;
  /** How far the nameplate sits from the reference; always >= 1. */
  readonly extrapolationFactor: number;
  /** True past SCALE_EXTRAPOLATION_LIMIT — the lineage must say so. */
  readonly extrapolated: boolean;
}

/**
 * The scale factor alone.
 *
 * `foakMultiplier` defaults to 1 and should STAY 1 for a benchmark that is
 * already first-of-a-kind. The researched fuel figures are anchored on
 * projects at financial close and at FID, both carrying FOAK contingency
 * inside their published numbers — multiplying again charges it twice.
 */
export function specificCapitalScaleFactor(
  referenceScaleTonnesPerYear: number,
  scaleExponent: number,
  nameplateTonnesPerYear: number,
  foakMultiplier = 1,
): number {
  if (referenceScaleTonnesPerYear <= 0 || nameplateTonnesPerYear <= 0) return foakMultiplier;
  return (
    (nameplateTonnesPerYear / referenceScaleTonnesPerYear) ** (scaleExponent - 1) *
    foakMultiplier
  );
}

/** The factor plus how far it has been extrapolated, for provenance. */
export function scaleCorrection(
  referenceScaleTonnesPerYear: number,
  scaleExponent: number,
  nameplateTonnesPerYear: number,
  foakMultiplier = 1,
): ScaleCorrection {
  const factor = specificCapitalScaleFactor(
    referenceScaleTonnesPerYear,
    scaleExponent,
    nameplateTonnesPerYear,
    foakMultiplier,
  );
  const ratio =
    referenceScaleTonnesPerYear > 0 && nameplateTonnesPerYear > 0
      ? nameplateTonnesPerYear / referenceScaleTonnesPerYear
      : 0;
  const extrapolationFactor = ratio > 0 ? Math.max(ratio, 1 / ratio) : Infinity;
  return {
    factor,
    extrapolationFactor,
    extrapolated: extrapolationFactor > SCALE_EXTRAPOLATION_LIMIT,
  };
}

/**
 * Total capital at a nameplate, from a $/tpa benchmark stated at a reference
 * scale. This is the whole fix for the flat-scalar bug: the old resolver
 * charged one absolute number regardless of how much fuel the corridor
 * needed, so a 15 kt/yr corridor and a 600 kt/yr one paid the same.
 */
export function scaledCapitalUsd(
  capexUsdPerTpa: number,
  referenceScaleTonnesPerYear: number,
  scaleExponent: number,
  nameplateTonnesPerYear: number,
  foakMultiplier = 1,
): number {
  return (
    capexUsdPerTpa *
    specificCapitalScaleFactor(
      referenceScaleTonnesPerYear,
      scaleExponent,
      nameplateTonnesPerYear,
      foakMultiplier,
    ) *
    nameplateTonnesPerYear
  );
}
