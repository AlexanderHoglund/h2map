export {
  evaluateFuelEmissions,
  fuelIntensity,
  FUELEU_BASELINE_GCO2E_PER_MJ,
} from "./engine";
export type {
  BasisResult,
  EmissionParts,
  EtsChargeable,
  FuelEmissionsInput,
  FuelEmissionsResult,
  NotParameterised,
  SideResult,
} from "./engine";
export {
  carbonBalanceError,
  getFramework,
  getFuel,
  getGwpSet,
  impliedCombustionIntensity,
  missingParameters,
  parseRefDataset,
  refDatasetSchema,
} from "./ref";
export type { FuelEmissionsRefDataset, RefFuel } from "./ref";
