export {
  evaluateFuelEmissions,
  fuelIntensity,
  FUELEU_BASELINE_GCO2E_PER_MJ,
} from "./engine";
export type {
  BasisResult,
  EmissionParts,
  FuelEmissionsInput,
  FuelEmissionsResult,
  NotParameterised,
  SideResult,
} from "./engine";
export {
  getFramework,
  getFuel,
  getGwpSet,
  missingParameters,
  parseRefDataset,
  refDatasetSchema,
} from "./ref";
export type { FuelEmissionsRefDataset, RefFuel } from "./ref";
