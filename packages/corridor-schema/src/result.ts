/**
 * Engine result types. Shapes match `fixtures/golden/corridor/*.expected.json`
 * exactly (columnar per-year arrays keyed by unit-suffixed names) so the
 * golden test can diff the engine output against the workbook's cached values
 * with no adaptation layer.
 */

export interface SidePerYear {
  readonly totalCapexUsdM: readonly number[];
  /**
   * Fix #6 — present ONLY when the IMO Net-Zero module is active on the
   * side, so the frozen golden per-year key set is untouched.
   */
  readonly imoNetZeroUsdM?: readonly number[];
  /** Sprint 4 — present ONLY when the financing module is attached to the
   *  side (green, enabled); negative = interest saving. */
  readonly financingUsdM?: readonly number[];
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
  /** Sprint 4 — present only when financing is attached to the side. */
  readonly financingPvUsdM?: number;
  /** Fix #6 — present only when the IMO module is active on the side. */
  readonly imoNetZero?: SideImoNetZero;
}

/** IMO Net-Zero per-side aggregates (all discounted where $-valued). */
export interface SideImoNetZero {
  readonly pvUsdM: number;
  readonly tier1PvUsdM: number;
  readonly tier2PvUsdM: number;
  readonly rewardPvUsdM: number;
  /** Reward-eligible surplus balance over the horizon, tCO2e (undiscounted). */
  readonly surplusTonnesCo2e: number;
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
  /** Sprint 4 — present only when the financing module is enabled. */
  readonly financingGreenPvUsdM?: number;
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
  /**
   * Fix #6 — IMO Net-Zero reporting: per-side tier breakdown + surplus, or
   * `notParameterised` when the scenario enables the module but the pinned
   * bundle lacks its reference rows. Absent when the module is off.
   */
  readonly imoNetZero?:
    | { readonly notParameterised: true }
    | {
        readonly notParameterised?: false;
        readonly green: SideImoNetZero;
        readonly fossil: SideImoNetZero;
      };
}

export interface ScenarioIntermediates {
  readonly greenFuelTonnesPerVesselYear: number;
  readonly fossilFuelTonnesPerVesselYear: number;
  readonly greenVesselCapexUsdM: number;
}

/**
 * Delivered-energy parity for the abatement comparison (v7).
 *
 * `CO2 abated = vessels × (fossil t × fossil EF − green t × green EF)` is a
 * MASS comparison, valid as a statement about the same transport work only
 * when the two tonnages carry the same delivered energy. The derived chain
 * guarantees that (both sides solve one geometry against their own LHV), so
 * the ratio is 1.000 unless a burn override breaks it on one side.
 */
export interface ScenarioEnergyParity {
  readonly greenMjPerYear: number;
  readonly fossilMjPerYear: number;
  /** green ÷ fossil. Null when the fossil side delivers no energy. */
  readonly ratio: number | null;
  /** Signed fractional divergence from parity; 0 = matched. */
  readonly divergence: number | null;
  /** True past ±5% — the UI raises an amber note, and nothing is clamped. */
  readonly diverged: boolean;
}

export interface ScenarioResult {
  readonly summary: ScenarioSummary;
  readonly energyParity: ScenarioEnergyParity;
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
