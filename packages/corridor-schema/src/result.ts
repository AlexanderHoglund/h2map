/**
 * Engine result types. Shapes match `fixtures/golden/corridor/*.expected.json`
 * exactly (columnar per-year arrays keyed by unit-suffixed names) so the
 * golden test can diff the engine output against the workbook's cached values
 * with no adaptation layer.
 */

export interface SidePerYear {
  readonly totalCapexUsdM: readonly number[];
  readonly totalOpexUsdM: readonly number[];
  readonly etsUsdM: readonly number[];
  readonly fuelEuUsdM: readonly number[];
  readonly ira45zUsdM: readonly number[];
  readonly selfDesignedUsdM: readonly number[];
  readonly totalUsdM: readonly number[];
  readonly discountFactor: readonly number[];
  readonly pvUsdM: readonly number[];
}

export interface SideResult {
  readonly perYear: SidePerYear;
  readonly totalPvUsdM: number;
  readonly capexPvUsdM: number;
  readonly opexPvUsdM: number;
  readonly etsPvUsdM: number;
  readonly fuelEuPvUsdM: number;
  readonly ira45zPvUsdM: number;
  readonly selfDesignedPvUsdM: number;
}

export interface ScenarioSummary {
  readonly greenTotalPvUsdM: number;
  readonly fossilTotalPvUsdM: number;
  readonly gapPvUsdM: number;
  readonly etsGreenPvUsdM: number;
  readonly fuelEuGreenPvUsdM: number;
  readonly ira45zGreenPvUsdM: number;
  readonly selfDesignedGreenPvUsdM: number;
  readonly etsFossilPvUsdM: number;
  readonly fuelEuFossilPvUsdM: number;
  readonly selfDesignedFossilPvUsdM: number;
  readonly cargoUnitsLifetime: number;
  readonly co2AbatedTonnes: number;
  readonly greenCapexPvUsdM: number;
  readonly greenOpexPvUsdM: number;
  readonly fossilCapexPvUsdM: number;
  readonly fossilOpexPvUsdM: number;
  readonly costPerUnitUsd: number;
  readonly costPerTonneCo2Usd: number;
}

export interface ScenarioIntermediates {
  readonly greenFuelTonnesPerVesselYear: number;
  readonly fossilFuelTonnesPerVesselYear: number;
  readonly greenVesselCapexUsdM: number;
}

export interface ScenarioResult {
  readonly summary: ScenarioSummary;
  readonly intermediates: ScenarioIntermediates;
  readonly perYear: {
    readonly green: SidePerYear;
    readonly fossil: SidePerYear;
    readonly co2AbatedTonnes: readonly number[];
  };
}
