/**
 * Public types of the LCOH engine.
 *
 * Boundary conditions follow the source methodology ("Motor de Cálculo LCOH",
 * Ministerio de Energía de Chile, April 2024): system boundary at the
 * electrolyzer outlet, one representative meteorological year repeated over
 * the project life, water as a cost input whose associated electricity is
 * counted only in the emissions ledger.
 *
 * Units at this boundary: MW / MWh / USD / kg / m³. Internally the engine
 * works in kW / kWh / USD / kg.
 */

export type PricingMode =
  | { mode: "lcoe"; usdPerMwh: number }
  | { mode: "capex"; capexUsdPerKw: number; opexFractionPerYear: number };

export interface RenewableSourceInputs {
  capacityMw: number;
  pricing: PricingMode;
}

export interface GridInputs {
  /** Maximum power drawn from the grid/PPA in any hour. */
  maxImportMw: number;
  priceUsdPerMwh: number;
  emissionFactorTco2PerMwh: number;
}

export interface WaterInputs {
  /** Delivered water price at the point of use. */
  priceUsdPerM3: number;
  transportUsdPerM3Per100Km: number;
  transportDistanceKm: number;
  /** Whether desalination electricity applies (emissions ledger only). */
  desalinated: boolean;
  /** Pumping lift in metres (emissions ledger only). */
  pumpingHeadM: number;
}

/**
 * Deviations from strict reference behavior. Every flag defaults to false;
 * with all flags false the engine reproduces the source methodology
 * literally. See docs/ENGINE_NOTES.md for the rationale of each default.
 */
export interface ReferenceFlags {
  /** η_t = η₀(1−d)^(t−1) instead of the doc-literal η₀(1−d)^t. */
  nameplateEfficiencyInFirstYear?: boolean;
  /** Reset degradation when a stack is replaced (doc formula has no reset). */
  resetEfficiencyOnStackReplacement?: boolean;
  /** Charge LCOE-priced renewables for generated (incl. curtailed) energy instead of consumed only. */
  lcoePaysForCurtailedEnergy?: boolean;
  /**
   * Accumulate stack life on equivalent full-load hours (Σ P_consumed/P_rated
   * = consumed energy ÷ rated power) instead of calendar operating hours.
   * Reference mode counts any hour with load > 0 as a full hour of stack
   * life, which over-consumes life on peaky (solar-heavy) profiles and biases
   * against high-capacity-factor sites; EFLH removes that bias.
   */
  stackLifeOnEquivalentFullLoadHours?: boolean;
}

export interface LCOHInputs {
  finance: {
    lifetimeYears: number;
    /**
     * Fraction per year, e.g. 0.08. **REAL, not nominal.**
     *
     * The engine discounts constant-USD cashflows — there is no inflation or
     * escalation term anywhere in it — so this is a real framework and the
     * rate must be a real one. Handing it a nominal rate (the basis most
     * published cost-of-capital surveys report, including the IEA Cost of
     * Capital Observatory) systematically overstates LCOH: measured at the
     * West Timor cell, a nominal 9.4% consumed as if real inflates LCOH by
     * 7.7% against the Fisher-converted 6.4%.
     *
     * Convert at the boundary, never here — see `toRealRate` in
     * scripts/defaults/discountBasis.ts, which carries the inflation
     * assumption and its citation alongside the rate.
     */
    discountRate: number;
  };
  electrolyzer: {
    capacityMw: number;
    capexUsdPerKw: number;
    opexFractionPerYear: number;
    /** Average system efficiency on LHV basis incl. balance of plant, e.g. 0.6. */
    efficiencyLhv: number;
    degradationPerYear: number;
    stackLifetimeHours: number;
    /** Stack replacement cost as a fraction of electrolyzer CAPEX. */
    stackReplacementCostFraction: number;
  };
  pv?: RenewableSourceInputs;
  wind?: RenewableSourceInputs;
  grid?: GridInputs;
  water: WaterInputs;
  referenceFlags?: ReferenceFlags;
  /** Reserved for v1.1 refinements (part-load curve, min-load cutoff, battery, oversizing). */
  extensions?: Record<string, never>;
}

/** Normalized hourly capacity-factor profiles (kWh per kW installed), each exactly 8760 values in [0, 1]. */
export interface ResourceProfiles {
  pv?: readonly number[];
  wind?: readonly number[];
}

/** Per-component USD/kg shares. The fields sum exactly to lcohUsdPerKg. */
export interface LCOHDecomposition {
  electricityPv: number;
  electricityWind: number;
  electricityGrid: number;
  electrolyzerCapex: number;
  stackReplacements: number;
  electrolyzerOpex: number;
  water: number;
}

/**
 * Cost-structure block (corridor build-here spec §2): the SAME costs the
 * levelized decomposition carries, re-expressed as capital vs operating so a
 * downstream model (the green-corridor engine) can discount them on its own
 * timeline at its own rate. Purely additive — no levelized figure changes.
 */
export type CostNature = "capital" | "operating" | "mixed";

export interface CostStructureComponent {
  costNature: CostNature;
  /** Present value of the capital part (year-0 capex; stack events discounted). */
  capitalUsd: number;
  /** Present value of the operating part. capital + operating = the component's PV share. */
  operatingPvUsd: number;
  /** Operating cost per year at the reference year (year 1 — see degradation note). */
  operatingUsdPerYear: number;
}

export interface CostStructure {
  /** Σ component capital PVs: year-0 capex (electrolyzer + CAPEX-mode renewables) + discounted stack events. */
  capitalUsd: number;
  /** Σ component operating PVs. capitalUsd + operatingPvUsd = lcoh × PV(H2) exactly. */
  operatingPvUsd: number;
  /**
   * Operating cost per year at YEAR 1. Under degradation, water (and H2)
   * decline with output in later years — a consumer charging this flat
   * accepts that documented approximation; the PV fields are exact.
   */
  annualOperatingUsd: number;
  /** H2 output in YEAR 1, kg (declines with degradation in later years). */
  annualH2Kg: number;
  plantLifeYears: number;
  /** The rate used INSIDE this LCOH run (finance.discountRate). */
  discountRate: number;
  /** Per-decomposition-component split; keys mirror LCOHDecomposition. */
  components: Record<keyof LCOHDecomposition, CostStructureComponent>;
}

export interface AnnualRow {
  /** Operating year, 1-based. */
  year: number;
  h2Kg: number;
  waterM3: number;
  eConsumedKwh: number;
  ePvKwh: number;
  eWindKwh: number;
  eGridKwh: number;
  curtailedPvKwh: number;
  curtailedWindKwh: number;
  /** Effective average efficiency applied in this year (LHV). */
  efficiencyLhv: number;
  operatingHours: number;
  stackReplacement: boolean;
}

export interface LCOHResults {
  lcohUsdPerKg: number;
  decomposition: LCOHDecomposition;
  costStructure: CostStructure;
  lcoe: {
    /** USD/MWh; user-supplied in LCOE mode, computed from CAPEX/OPEX otherwise. Null when the source is absent. */
    pv: number | null;
    wind: number | null;
    /** Consumed-energy-weighted mix over GENERATED energy (source doc equation), USD/MWh. */
    mix: number;
    /**
     * Effective electricity cost per CONSUMED MWh: discounted electricity cost
     * (all sources) ÷ discounted consumed MWh. In CAPEX mode plant CAPEX is
     * charged regardless of curtailment, so `mix` (per generated MWh) times
     * consumed energy under-recovers by the utilization ratio; this is the
     * figure that reconciles to the electricity cost components exactly.
     */
    effectivePerConsumedMwh: number;
  };
  annual: AnnualRow[];
  totals: {
    h2Kg: number;
    waterM3: number;
    eConsumedKwh: number;
    curtailedPvKwh: number;
    curtailedWindKwh: number;
    emissionsTco2e: number;
    emissionsKgCo2ePerKgH2: number;
    electrolyzerCapexUsd: number;
    stackReplacementsUsd: number;
    electrolyzerOpexUsd: number;
  };
  performance: {
    /** Energy capacity factor of the electrolyzer (identical every year — dispatch repeats). */
    electrolyzerCapacityFactor: number;
    fullLoadHoursPerYear: number;
    /** 12×24 month-by-hour average-day electrolyzer load, MW. */
    averageDayProfileMw: number[][];
    /** Per-source utilization E_consumed/E_generated (null when source absent). */
    utilization: { pv: number | null; wind: number | null };
    /**
     * Fraction of electrolyzer consumption served hour-by-hour by the
     * project's OWN renewables (= 1 − grid share). Because dispatch is hourly
     * and renewables are consumed first, this is a genuine hourly-matched
     * figure. It is an operational indicator, NOT an RFNBO/RED II assessment
     * (which additionally requires additionality and geographic/temporal
     * correlation against defined comparators).
     */
    renewableMatchedFraction: number;
  };
  meta: {
    engineVersion: string;
    referenceMode: boolean;
  };
}
