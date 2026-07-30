/**
 * IRA Section 45Z Clean Fuel Production Credit, $m (Calculation r30,
 * transcription §7). A CREDIT — always ≤ 0:
 *
 *   −vessels × fuelTonnes × (rate$/gal ÷ mjPerGallon × LHV) / 1e6
 *
 * Present only on a side whose resolution attached it (green, enabled AND
 * US-produced). The workbook has no calendar sunset — reproduced as-is;
 * `effectiveUntil` parameterization is Phase-1 divergence D5.
 */

import type { CalendarYear } from "@h2map/units";
import type { FuelParams, Ira45zParams } from "@h2map/corridor-schema";

export function ira45zCreditUsdM(
  params: Ira45zParams,
  fuel: FuelParams,
  vessels: number,
  cal: CalendarYear,
): number {
  // D5 — optional legislated sunset; absent = the workbook's perpetual credit.
  if (params.effectiveUntil !== undefined && cal > params.effectiveUntil) return 0;
  return (
    (-vessels *
      fuel.tonnesPerVesselYear *
      ((params.rateUsdPerGallon / params.mjPerGallon) * fuel.lhv)) /
    1e6
  );
}
