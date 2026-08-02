/**
 * FuelEU Maritime cost, $m (Calculation r29/r55, transcription §7):
 *
 *   MAX(0, WTW − baseline×(1−target(cal)))
 *     × (vessels × fuelTonnes × LHV) / WTW / vlsfoMjPerTonne
 *     × penalty€ × scope × EURUSD / 1e6
 *
 * The MAX(0,·) clamps the DEFICIT INTENSITY before the energy/penalty
 * multiplication — a compliant fuel (green e-ammonia, WTW 15 vs baseline
 * 91.16) yields exactly 0 (over-compliance is worth nothing in the workbook;
 * credit trading is Phase-1 divergence D2). The division by the fuel's own
 * WTW converts compliance energy into notional fuel mass — preserved exactly
 * per the transcription mandate.
 */

import type { CalendarYear } from "@h2map/units";
import type { FuelEuParams, FuelParams } from "@h2map/corridor-schema";
import { stepValue } from "../schedule";

export function fuelEuCostUsdM(
  params: FuelEuParams,
  fuel: FuelParams,
  vessels: number,
  cal: CalendarYear,
): number {
  const target = stepValue(params.targets, cal);
  const rawDeficit = fuel.wtw - params.baselineGco2PerMj * (1 - target);

  if (rawDeficit > 0 || !params.credit) {
    // Deficit (or Excel behaviour): MAX(0, ·) penalty — the workbook's clamp.
    const deficit = Math.max(0, rawDeficit);
    // A compliant fuel owes nothing. Return before the ÷WTW conversion below,
    // which is 0/0-degenerate for a zero-emission fuel (wtw = 0): computing it
    // would give 0 × Infinity = NaN and poison the whole side's total.
    if (deficit === 0) return 0;
    // Here deficit > 0 ⇒ fuel.wtw > baseline×(1−target) ≥ 0, so the division is safe.
    const massPerIntensity =
      (vessels * fuel.tonnesPerVesselYear * fuel.lhv) /
      fuel.wtw /
      params.vlsfoMjPerTonne;
    return (
      ((deficit * massPerIntensity * params.penaltyEurPerTonne) *
        params.scope *
        params.eurUsd) /
      1e6
    );
  }

  // D2 — over-compliance credit: the surplus (|rawDeficit|) is poolable and
  // priced at the surplus value, with the RFNBO ×multiplier until its cutoff.
  // Negative return = revenue reducing the side's cost. The ÷WTW mass
  // conversion is undefined for a zero-emission fuel — no priced surplus.
  if (fuel.wtw === 0) return 0;
  const multiplier = cal <= params.credit.multiplierUntil ? params.credit.multiplier : 1;
  const massPerIntensity =
    (vessels * fuel.tonnesPerVesselYear * fuel.lhv) /
    fuel.wtw /
    params.vlsfoMjPerTonne;
  return (
    ((rawDeficit * multiplier * massPerIntensity * params.credit.surplusValueEurPerTonne) *
      params.scope *
      params.eurUsd) /
    1e6
  );
}
