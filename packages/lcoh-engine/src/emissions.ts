import {
  DESAL_KWH_PER_M3,
  PUMP_KWH_PER_M3_PER_100M,
} from "./constants.js";
import type { WaterInputs } from "./types.js";

/**
 * Electricity attributable to water supply (desalination + pumping), kWh per
 * m³. Per the source methodology this electricity is counted ONLY in the
 * emissions ledger — its cost is assumed embedded in the delivered water
 * price and must never enter the cost side. That invariant is enforced by a
 * dedicated test.
 */
export function waterElectricityKwhPerM3(water: WaterInputs): number {
  const desal = water.desalinated ? DESAL_KWH_PER_M3 : 0;
  const pumping = PUMP_KWH_PER_M3_PER_100M * (water.pumpingHeadM / 100);
  return desal + pumping;
}

/**
 * Annual CO₂e in tonnes: grid electricity consumed by the electrolyzer plus
 * water-related electricity, both at the grid emission factor (tCO₂/MWh).
 * With no grid source configured the applicable factor is 0 — the plant is
 * renewables-only and water electricity is assumed drawn from that supply.
 */
export function annualEmissionsTco2e(
  gridKwh: number,
  waterM3: number,
  water: WaterInputs,
  gridEmissionFactorTco2PerMwh: number,
): number {
  const waterKwh = waterM3 * waterElectricityKwhPerM3(water);
  return ((gridKwh + waterKwh) / 1000) * gridEmissionFactorTco2PerMwh;
}
