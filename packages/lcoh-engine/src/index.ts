export { simulateLCOH, ENGINE_VERSION } from "./simulate.js";
export { dispatchYear } from "./dispatch.js";
export type { DispatchInputs, DispatchResult } from "./dispatch.js";
export { discountFactors, presentValue } from "./dcf.js";
export { stackReplacementYears } from "./stackSchedule.js";
export { lcoeFromCapex, lcoeMix } from "./lcoe.js";
export {
  annualEmissionsTco2e,
  waterElectricityKwhPerM3,
} from "./emissions.js";
export { EngineInputError, validateInputs } from "./validate.js";
export {
  DAYS_PER_MONTH,
  DESAL_KWH_PER_M3,
  HOURS_PER_YEAR,
  LHV_H2_KWH_PER_KG,
  PUMP_KWH_PER_M3_PER_100M,
  REFERENCE_DEFAULTS,
  WATER_L_PER_KG_H2,
} from "./constants.js";
export type {
  AnnualRow,
  GridInputs,
  LCOHDecomposition,
  LCOHInputs,
  LCOHResults,
  PricingMode,
  ReferenceFlags,
  RenewableSourceInputs,
  ResourceProfiles,
  WaterInputs,
} from "./types.js";
