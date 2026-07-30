/**
 * Self-designed regulation, $m (Calculation r31 green / r56 fossil,
 * transcription §7). Sign conventions per the workbook: the CO2-price term is
 * a cost (+), the four support terms are subsidies (−):
 *
 *   + vessels × tonnes × combustionEF × CO2$/t / 1e6
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
): number {
  let cost = 0;
  if (params.co2PriceUsdPerTonne !== undefined) {
    cost +=
      (vessels * fuel.tonnesPerVesselYear * fuel.combustionEf * params.co2PriceUsdPerTonne) /
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
