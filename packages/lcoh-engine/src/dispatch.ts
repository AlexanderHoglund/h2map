import { HOURS_PER_YEAR } from "./constants";

export interface DispatchInputs {
  electrolyzerKw: number;
  pvKw: number;
  windKw: number;
  /** 0 disables grid top-up. */
  gridMaxKw: number;
  pvProfile: readonly number[] | null;
  windProfile: readonly number[] | null;
}

export interface DispatchResult {
  pvGeneratedKwh: number;
  windGeneratedKwh: number;
  pvConsumedKwh: number;
  windConsumedKwh: number;
  gridKwh: number;
  consumedKwh: number;
  curtailedPvKwh: number;
  curtailedWindKwh: number;
  /** Hours with electrolyzer load > 0. */
  operatingHours: number;
  /** Electrolyzer load per hour, kW. */
  hourlyLoadKw: Float64Array;
}

/**
 * Hourly dispatch over one representative year (source doc §2.2/§5.2):
 * renewables are consumed first, split pro-rata between PV and wind when
 * their combined availability exceeds electrolyzer capacity; any shortfall
 * is topped up from the grid/PPA up to its hourly cap.
 *
 * Because the same meteorological year repeats over the project life and the
 * engine models no part-load or ramp constraints, this dispatch is identical
 * in every project year and only needs to run once per simulation.
 */
export function dispatchYear(inputs: DispatchInputs): DispatchResult {
  const { electrolyzerKw, pvKw, windKw, gridMaxKw, pvProfile, windProfile } =
    inputs;

  const hourlyLoadKw = new Float64Array(HOURS_PER_YEAR);
  let pvGeneratedKwh = 0;
  let windGeneratedKwh = 0;
  let pvConsumedKwh = 0;
  let windConsumedKwh = 0;
  let gridKwh = 0;
  let operatingHours = 0;

  for (let h = 0; h < HOURS_PER_YEAR; h++) {
    const availPv = pvProfile ? pvProfile[h]! * pvKw : 0;
    const availWind = windProfile ? windProfile[h]! * windKw : 0;
    const avail = availPv + availWind;

    let usedPv: number;
    let usedWind: number;
    let fromGrid = 0;

    if (avail <= electrolyzerKw) {
      usedPv = availPv;
      usedWind = availWind;
      const shortfall = electrolyzerKw - avail;
      if (shortfall > 0 && gridMaxKw > 0) {
        fromGrid = shortfall < gridMaxKw ? shortfall : gridMaxKw;
      }
    } else {
      const s = electrolyzerKw / avail;
      usedPv = s * availPv;
      usedWind = s * availWind;
    }

    const load = usedPv + usedWind + fromGrid;
    hourlyLoadKw[h] = load;
    if (load > 0) operatingHours++;

    pvGeneratedKwh += availPv;
    windGeneratedKwh += availWind;
    pvConsumedKwh += usedPv;
    windConsumedKwh += usedWind;
    gridKwh += fromGrid;
  }

  return {
    pvGeneratedKwh,
    windGeneratedKwh,
    pvConsumedKwh,
    windConsumedKwh,
    gridKwh,
    consumedKwh: pvConsumedKwh + windConsumedKwh + gridKwh,
    curtailedPvKwh: pvGeneratedKwh - pvConsumedKwh,
    curtailedWindKwh: windGeneratedKwh - windConsumedKwh,
    operatingHours,
    hourlyLoadKw,
  };
}
