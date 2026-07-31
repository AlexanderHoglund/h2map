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

/**
 * Reporting layer (Chilean-run fix #1): the gap BEFORE and AFTER the
 * regulation modules, plus the same split for the unit metrics. Published
 * green-corridor studies report the pre-regulation gap with regulatory
 * effects as a separate waterfall line — the headline alone is not
 * comparable to them. Pre-regulation = CAPEX + operating cost only.
 * Lives OUTSIDE `summary` so the frozen golden shape is untouched.
 */
export interface ScenarioReporting {
  readonly gapPvPreRegulationUsdM: number;
  readonly gapPvPostRegulationUsdM: number;
  /** post − pre; negative = regulation narrows the gap. Exact by construction. */
  readonly netRegulatoryEffectUsdM: number;
  readonly greenPreRegulationPvUsdM: number;
  readonly fossilPreRegulationPvUsdM: number;
  readonly costPerUnitPreRegulationUsd: number;
  readonly costPerUnitPostRegulationUsd: number;
  readonly costPerTonneCo2PreRegulationUsd: number;
  readonly costPerTonneCo2PostRegulationUsd: number;
}

export interface ScenarioIntermediates {
  readonly greenFuelTonnesPerVesselYear: number;
  readonly fossilFuelTonnesPerVesselYear: number;
  readonly greenVesselCapexUsdM: number;
}

export interface ScenarioResult {
  readonly summary: ScenarioSummary;
  readonly reporting: ScenarioReporting;
  readonly intermediates: ScenarioIntermediates;
  readonly perYear: {
    readonly green: SidePerYear;
    readonly fossil: SidePerYear;
    readonly co2AbatedTonnes: readonly number[];
  };
  /**
   * Divergence surfacing (D1): present ONLY when a non-default flag produced
   * information the Excel-shaped sections cannot carry — e.g. both emissions
   * bases when they differ. Absent under pure Excel behaviour, so the frozen
   * golden fixture's shape is untouched.
   */
  readonly divergences?: {
    readonly emissionsBasis?: {
      readonly basis: "wellToWake";
      readonly co2AbatedTonnesCombustion: number;
      readonly co2AbatedTonnesWellToWake: number;
    };
  };
}
