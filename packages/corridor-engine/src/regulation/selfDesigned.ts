/**
 * Self-designed regulation, $m (Calculation r31 green / r56 fossil,
 * transcription §7). Sign conventions per the workbook: the CO2-price term is
 * a cost (+), the four support terms are subsidies (−):
 *
 *   + vessels × tonnes × EF(basis) × CO2$/t / 1e6
 *   − vessels × tonnes × 1000 × $/kg / 1e6
 *   − capexSupport × totalCapex_t
 *   − opexSupport × totalOpex_t
 *   − other$m
 *
 * Which terms exist is DATA (SelfDesignedParams' optional fields): the fossil
 * side's resolution provides only the CO2 term — no engine branch.
 */

import type { FuelParams, SelfDesignedParams } from "@h2map/corridor-schema";

export function selfDesignedCostUsdM(
  params: SelfDesignedParams,
  fuel: FuelParams,
  vessels: number,
  totalCapexUsdM: number,
  totalOpexUsdM: number,
  emissionsBasis: "combustion" | "wellToWake" = "combustion",
): number {
  let cost = 0;
  if (params.co2PriceUsdPerTonne !== undefined) {
    // Fix #2 (Chilean run): price the emissions the model REPORTS. The
    // abatement metric follows flags.emissionsBasis; charging combustion
    // tonnes while reporting WTW tonnes priced the wrong series. WTW
    // per-tonne-of-fuel factor = LHV [MJ/t] × WTW [gCO2e/MJ] / 1e6 → tCO2e/t.
    const efTco2PerTonne =
      emissionsBasis === "wellToWake"
        ? (fuel.lhv * fuel.wtw) / 1e6
        : fuel.combustionEf;
    cost +=
      (vessels * fuel.tonnesPerVesselYear * efTco2PerTonne * params.co2PriceUsdPerTonne) /
      1e6;
  }
  if (params.supportUsdPerKg !== undefined) {
    cost -= (vessels * fuel.tonnesPerVesselYear * 1000 * params.supportUsdPerKg) / 1e6;
  }
  if (params.capexSupport !== undefined) {
    cost -= params.capexSupport * totalCapexUsdM;
  }
  if (params.opexSupport !== undefined) {
    cost -= params.opexSupport * totalOpexUsdM;
  }
  if (params.otherUsdM !== undefined) {
    cost -= params.otherUsdM;
  }
  return cost;
}
