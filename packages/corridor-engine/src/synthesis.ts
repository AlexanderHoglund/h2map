/**
 * H2 → carrier synthesis at plant gate (build-plan 1.5). Pure:
 * `(lcoh, benchmark, config) → USD/tonne` with an exhaustive breakdown that
 * sums exactly to the total (same decomposition contract as the corridor
 * evaluator).
 *
 *   gate = H2 feedstock  (lcoh $/kg × tH2/t × 1000 kg/t)
 *        + CO2 feedstock (MeOH: 1.374 t × CO2 price)
 *        + electricity   (ASU / synthesis / liquefaction MWh/t × price)
 *        + plant         (CAPEX/tpa annuitized at the PRODUCTION-side WACC
 *                         over plant life  +  fixed O&M as capex fraction)
 *
 * D7 lives here: `config.productionWacc` is the production country's cost of
 * capital — deliberately a separate number from the corridor NPV's discount
 * rate.
 */

import type {
  SynthesisBenchmark,
  SynthesisConfig,
  SynthesisPlantConfig,
} from "@h2map/corridor-schema";

export interface SynthesisBreakdown {
  h2FeedstockUsdPerTonne: number;
  co2FeedstockUsdPerTonne: number;
  electricityUsdPerTonne: number;
  plantUsdPerTonne: number;
}

export interface SynthesisResult {
  gateUsdPerTonne: number;
  breakdown: SynthesisBreakdown;
}

/** Capital recovery factor: w(1+w)^n / ((1+w)^n − 1); 1/n at w = 0. */
export function capitalRecoveryFactor(wacc: number, lifeYears: number): number {
  if (wacc === 0) return 1 / lifeYears;
  const g = (1 + wacc) ** lifeYears;
  return (wacc * g) / (g - 1);
}

/**
 * Specific-capital scale factor (spec §3): green-corridor plants are small,
 * dedicated and often first-of-a-kind — a world-scale benchmark understates
 * exactly the projects this tool evaluates. Six-tenths rule on SYNTHESIS
 * PLANT CAPITAL ONLY (never electrolysers/renewables: stack cost is ~linear
 * in capacity, and the LCOH engine already carries them):
 *
 *   factor = (nameplate / referenceScale)^(exponent − 1) × foak
 *
 * 60 kt/yr against the 500 kt reference at exponent 0.6 → ×2.34.
 */
export function synthesisScaleFactor(
  benchmark: SynthesisBenchmark,
  nameplateTonnesPerYear: number,
  foakMultiplier = 1,
): number {
  return (
    (nameplateTonnesPerYear / benchmark.referenceScaleTonnesPerYear) **
      (benchmark.scaleExponent - 1) *
    foakMultiplier
  );
}

export interface SynthesisPlantResult {
  /** Year-0 plant capital at the given nameplate, USD (scale-corrected). */
  capitalUsd: number;
  /** Fixed O&M + feedstock electricity + CO2 at full nameplate, USD/yr. */
  annualOperatingUsd: number;
  /** CRF-based display figure at the production WACC (NOT a corridor input). */
  perTonne: number;
  scaleFactor: number;
  breakdown: {
    plantCapitalUsd: number;
    fixedOmUsdPerYear: number;
    electricityUsdPerYear: number;
    co2FeedstockUsdPerYear: number;
  };
}

/**
 * Plant-level synthesis costing for build-plant/build-here (spec §3/§5):
 * capital and operating for a DEDICATED plant of the given nameplate, for
 * the corridor to discount on its own timeline. H2 feedstock is NOT here —
 * it is the H2-plant block (LCOH cost structure).
 */
export function synthesizePlant(
  benchmark: SynthesisBenchmark,
  config: SynthesisPlantConfig,
): SynthesisPlantResult {
  const scaleFactor = synthesisScaleFactor(
    benchmark,
    config.nameplateTonnesPerYear,
    config.foakMultiplier ?? 1,
  );
  const capitalUsd =
    benchmark.plantCapexUsdPerTpa * scaleFactor * config.nameplateTonnesPerYear;
  const fixedOmUsdPerYear = benchmark.plantOpexFracPerYear * capitalUsd;
  const electricityUsdPerYear =
    benchmark.electricityMwhPerTonne *
    config.electricityUsdPerMwh *
    config.nameplateTonnesPerYear;
  const co2FeedstockUsdPerYear =
    benchmark.co2TPerTonne * config.co2UsdPerTonne * config.nameplateTonnesPerYear;
  const annualOperatingUsd =
    fixedOmUsdPerYear + electricityUsdPerYear + co2FeedstockUsdPerYear;
  const perTonne =
    (capitalUsd * capitalRecoveryFactor(config.productionWacc, benchmark.plantLifeYears) +
      annualOperatingUsd) /
    config.nameplateTonnesPerYear;
  return {
    capitalUsd,
    annualOperatingUsd,
    perTonne,
    scaleFactor,
    breakdown: {
      plantCapitalUsd: capitalUsd,
      fixedOmUsdPerYear,
      electricityUsdPerYear,
      co2FeedstockUsdPerYear,
    },
  };
}

export function synthesize(
  lcohUsdPerKg: number,
  benchmark: SynthesisBenchmark,
  config: SynthesisConfig,
): SynthesisResult {
  const h2FeedstockUsdPerTonne = lcohUsdPerKg * benchmark.tH2PerTonne * 1000;
  const co2FeedstockUsdPerTonne = benchmark.co2TPerTonne * config.co2UsdPerTonne;
  const electricityUsdPerTonne =
    benchmark.electricityMwhPerTonne * config.electricityUsdPerMwh;
  const plantUsdPerTonne =
    benchmark.plantCapexUsdPerTpa *
    (capitalRecoveryFactor(config.productionWacc, benchmark.plantLifeYears) +
      benchmark.plantOpexFracPerYear);
  return {
    gateUsdPerTonne:
      h2FeedstockUsdPerTonne +
      co2FeedstockUsdPerTonne +
      electricityUsdPerTonne +
      plantUsdPerTonne,
    breakdown: {
      h2FeedstockUsdPerTonne,
      co2FeedstockUsdPerTonne,
      electricityUsdPerTonne,
      plantUsdPerTonne,
    },
  };
}
