import { presentValue } from "./dcf";

/**
 * LCOE of a renewable plant priced via CAPEX/OPEX, per the source equation
 * LCOE = Σt[(It+Mt)/(1+r)^t] ÷ Σt[Et/(1+r)^t], with investment at t=0 and
 * constant annual generation/O&M in years 1..N. Returns USD/MWh.
 */
export function lcoeFromCapex(
  capexUsdPerKw: number,
  opexFractionPerYear: number,
  capacityKw: number,
  annualGeneratedKwh: number,
  df: Float64Array,
): number {
  if (annualGeneratedKwh <= 0) return Infinity;
  const capexUsd = capexUsdPerKw * capacityKw;
  const opexUsd = opexFractionPerYear * capexUsd;
  // Annuity factor Σ df[1..N] — same shape for the cost and energy series.
  let annuity = 0;
  for (let t = 1; t < df.length; t++) annuity += df[t]!;
  const pvCosts = capexUsd + opexUsd * annuity;
  const pvEnergyMwh = (annualGeneratedKwh / 1000) * annuity;
  return pvCosts / pvEnergyMwh;
}

/**
 * Consumed-energy-weighted mix cost (source doc):
 * LCOE_mix = (E_PV·LCOE_PV + E_wind·LCOE_wind + E_grid·P_grid) / E_total_consumed.
 * Energies in kWh, prices in USD/MWh; returns USD/MWh.
 */
export function lcoeMix(
  pvConsumedKwh: number,
  pvLcoeUsdPerMwh: number | null,
  windConsumedKwh: number,
  windLcoeUsdPerMwh: number | null,
  gridKwh: number,
  gridPriceUsdPerMwh: number,
  consumedKwh: number,
): number {
  if (consumedKwh <= 0) return 0;
  const numerator =
    pvConsumedKwh * (pvLcoeUsdPerMwh ?? 0) +
    windConsumedKwh * (windLcoeUsdPerMwh ?? 0) +
    gridKwh * gridPriceUsdPerMwh;
  return numerator / consumedKwh;
}

export { presentValue };
