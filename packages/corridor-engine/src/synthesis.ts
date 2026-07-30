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

import type { SynthesisBenchmark, SynthesisConfig } from "@h2map/corridor-schema";

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
