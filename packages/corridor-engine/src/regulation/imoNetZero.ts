/**
 * IMO Net-Zero Framework (fix #6) — draft MEPC 83 structure, parameterised
 * entirely from the reference bundle (no thresholds, prices or trajectory
 * values hardcoded here; provisional pending adoption, see the bundle's
 * sourceNote).
 *
 * Per year (calendar `cal`, from `effectiveFromCalendarYear`):
 *   attained GFI  = the side's WTW intensity [gCO2e/MJ]
 *   base target   = reference × (1 − stepValue(baseTargets, cal))
 *   direct target = reference × (1 − stepValue(directTargets, cal))
 *   energy        = vessels × tonnes/vessel/yr × LHV  [MJ]
 *
 *   tier-1 deficit = the intensity between the DIRECT and BASE targets that
 *                    the ship fails to reach: max(0, min(attained, base) − direct)
 *   tier-2 deficit = the intensity above the BASE target: max(0, attained − base)
 *   cost [$m] = (t1·tCO2e × tier1$ + t2·tCO2e × tier2$) × scope / 1e6
 *
 *   surplus (attained below the DIRECT target) accrues a reward-eligible
 *   balance in tCO2e — always reported; priced only via the scenario's
 *   reward rate (default 0: the rate is undetermined at source).
 *
 * Optional `priceEscalation` compounds both tier prices (and the reward
 * rate) as (1+esc)^(idx−1) — tier prices are only established 2028–2030.
 */

import type { CalendarYear } from "@h2map/units";
import type { FuelParams, ImoNetZeroParams } from "@h2map/corridor-schema";
import { stepValue } from "../schedule";

export interface ImoNetZeroYear {
  /** Net cost, $m (tier1 + tier2 − reward). The 7th per-year cost term. */
  readonly costUsdM: number;
  readonly tier1UsdM: number;
  readonly tier2UsdM: number;
  /** Reward-eligible surplus below the direct target, tCO2e (≥ 0). */
  readonly surplusTonnesCo2e: number;
  /** Reward income, $m (≥ 0; 0 unless a reward rate is set). */
  readonly rewardUsdM: number;
}

export function imoNetZeroYear(
  params: ImoNetZeroParams,
  fuel: FuelParams,
  vessels: number,
  cal: CalendarYear,
  idx = 1,
): ImoNetZeroYear {
  if (cal < params.effectiveFromCalendarYear) {
    return { costUsdM: 0, tier1UsdM: 0, tier2UsdM: 0, surplusTonnesCo2e: 0, rewardUsdM: 0 };
  }

  const ref = params.referenceIntensityGco2PerMj;
  const baseTarget = ref * (1 - stepValue(params.baseTargets, cal));
  const directTarget = ref * (1 - stepValue(params.directTargets, cal));
  const attained = fuel.wtw;
  const energyMj = vessels * fuel.tonnesPerVesselYear * fuel.lhv;

  // Intensity gaps [gCO2e/MJ] → tonnes CO2e via energy (g → t is /1e6).
  const tier1IntensityGap = Math.max(0, Math.min(attained, baseTarget) - directTarget);
  const tier2IntensityGap = Math.max(0, attained - baseTarget);
  const surplusIntensity = Math.max(0, directTarget - attained);

  const toTonnes = (gPerMj: number) => (gPerMj * energyMj) / 1e6;
  const esc = Math.pow(1 + (params.priceEscalation ?? 0), idx - 1);

  const tier1UsdM =
    (toTonnes(tier1IntensityGap) * params.tier1UsdPerTonneCo2e * esc * params.scope) / 1e6;
  const tier2UsdM =
    (toTonnes(tier2IntensityGap) * params.tier2UsdPerTonneCo2e * esc * params.scope) / 1e6;
  const surplusTonnesCo2e = toTonnes(surplusIntensity) * params.scope;
  const rewardUsdM = (surplusTonnesCo2e * params.rewardUsdPerTonneCo2e * esc) / 1e6;

  return {
    costUsdM: tier1UsdM + tier2UsdM - rewardUsdM,
    tier1UsdM,
    tier2UsdM,
    surplusTonnesCo2e,
    rewardUsdM,
  };
}
