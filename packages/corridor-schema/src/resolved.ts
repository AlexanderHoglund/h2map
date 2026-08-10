/**
 * Resolved value types and the fully-resolved inputs the engine consumes.
 *
 * `Resolved<T>` implements the workbook's `E = IF(D="", F, D)` convention plus
 * provenance: `override` (user D cell) > `derived` (computed benchmark — in
 * Excel these ARE the F formula cells, so precedence is identical) >
 * `benchmark` (plain table lookup). Phase 1 extends this with the map-derived
 * tier and the always-present `benchmark`/`provenance` fields; the engine
 * never sees `Resolved<>` at all — `toSideInputs`/`toEvalContext` strip to
 * bare branded scalars.
 */

import type {
  CalendarYear,
  Count,
  EurPerTonne,
  EurUsd,
  Fraction,
  GCo2ePerMj,
  MjPerTonne,
  TCo2PerTonne,
  TonnesPerVesselYear,
  UnitsPerYear,
  UsdM,
  UsdPerGallon,
  UsdPerKg,
  UsdPerTonne,
  YearIndex,
} from "@h2map/units";

export type Source = "override" | "derived" | "benchmark";

export interface Resolved<T> {
  readonly value: T;
  readonly source: Source;
}

// ---------------------------------------------------------------------------
// Engine-facing evaluation context
// ---------------------------------------------------------------------------

export interface TimelineYear {
  readonly idx: YearIndex; // 1-based (Excel column index)
  readonly calendarYear: CalendarYear;
}

export interface Timeline {
  readonly startYear: CalendarYear;
  readonly horizonYears: number;
  /** Length === horizonYears; Excel columns beyond the horizon are not modeled. */
  readonly years: readonly TimelineYear[];
}

export interface Discounting {
  readonly wacc: Fraction;
}

export interface EvalContext {
  readonly timeline: Timeline;
  readonly discounting: Discounting;
  readonly inflation: Fraction;
  /** D6 — "real" deflates the OPEX inflation growth. Default nominal (Excel). */
  readonly rateBasis?: "nominal" | "real";
  /**
   * D1 basis, also consumed by regulation modules that price emissions
   * (fix #2: the self-designed CO2 price follows the model basis).
   * Default combustion (Excel).
   */
  readonly emissionsBasis?: "combustion" | "wellToWake";
}

// ---------------------------------------------------------------------------
// Side inputs — everything that differs between green and fossil, as data.
// evaluateSide never branches on `label`.
// ---------------------------------------------------------------------------

export type ComponentId = "fuelProduction" | "portStorage" | "barge" | "vessel";

/**
 * A capex/opex cost block. All four components behave identically:
 * capex lands in year 1 only, opex inflates ×(1+infl)^(idx−1).
 */
export interface CostComponent {
  readonly id: ComponentId;
  readonly capexUsdM: UsdM;
  readonly opexUsdMPerYear: UsdM;
}

export interface FuelParams {
  readonly priceUsdPerTonne: UsdPerTonne;
  readonly combustionEf: TCo2PerTonne;
  readonly lhv: MjPerTonne;
  readonly wtw: GCo2ePerMj;
  readonly tonnesPerVesselYear: TonnesPerVesselYear;
}

export interface ScheduleStep {
  readonly fromCalendarYear: CalendarYear;
  readonly value: Fraction;
}

export interface EtsParams {
  readonly euaEurPerTonne: EurPerTonne;
  /** Fix #3 — annual price escalation; absent = flat nominal (Excel). */
  readonly euaEscalation?: Fraction;
  readonly eurUsd: EurUsd;
  readonly scope: Fraction;
  readonly phaseIn: readonly ScheduleStep[];
  /** D3 — this SIDE's non-CO2 gases (already side-specific after resolution). */
  readonly gases?: {
    readonly fromCalendarYear: CalendarYear;
    readonly ch4TPerTonne: number;
    readonly n2oTPerTonne: number;
    readonly gwpCh4: number;
    readonly gwpN2o: number;
  };
}

export interface FuelEuParams {
  readonly penaltyEurPerTonne: EurPerTonne;
  readonly eurUsd: EurUsd;
  readonly scope: Fraction;
  readonly baselineGco2PerMj: GCo2ePerMj;
  readonly vlsfoMjPerTonne: MjPerTonne;
  readonly targets: readonly ScheduleStep[];
  /**
   * D2 — over-compliance credit. `multiplier` is the RFNBO factor applied to
   * the surplus while cal ≤ multiplierUntil (1 for non-RFNBO fuels).
   */
  readonly credit?: {
    readonly surplusValueEurPerTonne: EurPerTonne;
    readonly multiplier: number;
    readonly multiplierUntil: CalendarYear;
  };
}

export interface Ira45zParams {
  readonly rateUsdPerGallon: UsdPerGallon;
  /** Gasoline-gallon-equivalent energy content (122.5 MJ/gal, bundle constant). */
  readonly mjPerGallon: number;
  /** D5 — credit is zero after this calendar year. Absent = no sunset (Excel). */
  readonly effectiveUntil?: CalendarYear;
}

/**
 * Self-designed regulation terms. Each optional — the workbook's asymmetry
 * (fossil side gets ONLY the CO2-price term) is expressed by which fields are
 * present, not by a branch in the engine.
 */
export interface SelfDesignedParams {
  readonly co2PriceUsdPerTonne?: UsdPerTonne;
  /** Fix #3 — annual price escalation; absent = flat nominal (Excel). */
  readonly co2PriceEscalation?: Fraction;
  readonly supportUsdPerKg?: UsdPerKg;
  readonly capexSupport?: Fraction;
  readonly opexSupport?: Fraction;
  readonly otherUsdM?: UsdM;
}

/**
 * Fix #6 — IMO Net-Zero params, fully shaped from the reference bundle at
 * resolve time. Reduction ladders are fractions vs the reference intensity;
 * tier prices $/tCO2e; scope mirrors the other modules.
 */
export interface ImoNetZeroParams {
  readonly effectiveFromCalendarYear: CalendarYear;
  readonly referenceIntensityGco2PerMj: GCo2ePerMj;
  readonly baseTargets: readonly ScheduleStep[];
  readonly directTargets: readonly ScheduleStep[];
  readonly tier1UsdPerTonneCo2e: UsdPerTonne;
  readonly tier2UsdPerTonneCo2e: UsdPerTonne;
  readonly scope: Fraction;
  /** ZNZ reward rate; 0 = unpriced (the balance is still reported). */
  readonly rewardUsdPerTonneCo2e: UsdPerTonne;
  readonly priceEscalation?: Fraction;
}

export interface SideRegulations {
  readonly ets?: EtsParams;
  readonly fuelEu?: FuelEuParams;
  /** Present only on the green side, and only when enabled AND US-produced. */
  readonly ira45z?: Ira45zParams;
  readonly selfDesigned?: SelfDesignedParams;
  /** Fix #6 — present when enabled AND the bundle carries the IMO rows. */
  readonly imoNetZero?: ImoNetZeroParams;
}

/**
 * Differentiated financing on THIS side's debt-financed capital (sprint 4).
 * Attached per-side by resolution (the green side, like 45Z) — the
 * evaluator never branches on the label. Absent = no financing line.
 */
export interface FinancingParams {
  readonly greenRate: Fraction;
  readonly baseRate: Fraction;
  readonly debtShare: Fraction;
  readonly tenorYears: number;
  readonly structure: "amortizing" | "bullet";
}

export interface SideInputs {
  /** Reporting key only — the evaluator must never branch on it. */
  readonly label: "green" | "fossil";
  readonly vessels: Count;
  readonly fuel: FuelParams;
  readonly components: readonly CostComponent[];
  readonly regulations: SideRegulations;
  /** Present only where resolution attached it (green side, enabled). */
  readonly financing?: FinancingParams;
  /**
   * Capital deployment weights (sprint 4, task 2), year 1..N shares of
   * this side's CAPEX. Absent = all capital in year 1 (legacy). The
   * financing line's drawdown follows the same weights by construction.
   */
  readonly capexWeights?: readonly number[];
}

// ---------------------------------------------------------------------------
// Resolved scenario — provenance-carrying stage between raw input and engine.
// ---------------------------------------------------------------------------

export interface ResolvedFuelSide {
  readonly priceUsdPerTonne: Resolved<UsdPerTonne>;
  readonly combustionEf: Resolved<TCo2PerTonne>;
  readonly lhv: Resolved<MjPerTonne>;
  readonly wtw: Resolved<GCo2ePerMj>;
  readonly tonnesPerVesselYear: Resolved<TonnesPerVesselYear>;
  readonly prodCapexUsdM: Resolved<UsdM>;
  readonly prodOpexUsdMPerYear: Resolved<UsdM>;
  readonly portStorageCapexUsdM: Resolved<UsdM>;
  readonly portStorageOpexUsdMPerYear: Resolved<UsdM>;
  readonly bargeCapexUsdM: Resolved<UsdM>;
  readonly bargeOpexUsdMPerYear: Resolved<UsdM>;
  readonly vesselCapexUsdM: Resolved<UsdM>;
  readonly vesselOpexUsdMPerYear: Resolved<UsdM>;
}

export interface ResolvedScenario {
  readonly refBundleId: string;
  readonly startYear: CalendarYear;
  readonly horizonYears: number;
  readonly unitsPerYear: UnitsPerYear;
  readonly inflation: Fraction;
  readonly wacc: Resolved<Fraction>;
  readonly vessels: Count;
  readonly green: ResolvedFuelSide;
  readonly fossil: ResolvedFuelSide;
  /** Regulation params per side, already shaped for SideInputs. */
  readonly regulations: {
    readonly green: SideRegulations;
    readonly fossil: SideRegulations;
  };
  /**
   * Fix #6 — set when the scenario ENABLES the IMO module but the pinned
   * bundle lacks its reference rows: the module must report "not
   * parameterised" rather than silently computing zero.
   */
  readonly imoNotParameterised?: true;
  /** Green-financing params, present only when the module is enabled. */
  readonly financing?: FinancingParams;
  /** Capital deployment weights per side, present only when enabled. */
  readonly capitalPhasing?: {
    readonly green: readonly number[];
    readonly fossil: readonly number[];
  };
  /** Divergence flags with defaults applied (absent input → Excel behaviour). */
  readonly flags: {
    readonly emissionsBasis: "combustion" | "wellToWake";
    readonly rateBasis: "nominal" | "real";
  };
}
