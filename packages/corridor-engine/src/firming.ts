/**
 * Firm-power resolution (realism pass, Task 2) — the physics fix.
 *
 * A solar-shaped site runs its electrolyser at ~30% duty. Ammonia synthesis
 * cannot follow that: conventional Haber-Bosch has a minimum load of 40-60%
 * and is not commercially flexible, so a plant fed by unbuffered daytime
 * solar could not physically produce the carrier. Flexible designs target
 * 10-20% minimum load but are not yet commercial, and relaxing minimum load
 * from 60% to 10% moves LCOA only 4-7% — the real projects instead use
 * hydrogen buffer storage, batteries, or a grid connection providing minimal
 * load through the day (buffer storage is an explicit FEED line item).
 *
 * Sources: Energy Convers. Manag. 280; Int. J. Hydrogen Energy 2025; Ammonia
 * Energy Association.
 *
 * So when the evaluated duty falls short of what the carrier needs, the
 * corridor must NOT silently produce it. It resolves the shortfall through
 * the cheapest available strategy and PRICES it. This module is pure: it
 * takes the evaluated site's duty and returns the strategies with their
 * costs, so the caller can pick, report, and let the user override.
 */

/** How the shortfall between evaluated duty and required duty is closed. */
export type FirmingStrategy = "buffer-oversize" | "firm-ppa" | "grid-hybrid";

export interface FirmingInputs {
  /** Evaluated site duty, 0-1 (fullLoadHoursPerYear / 8760). */
  readonly evaluatedDuty: number;
  /** Duty the carrier's synthesis loop requires, 0-1. */
  readonly requiredDuty: number;
  /** H2 plant capital at the corridor's nameplate, USD (pre-firming). */
  readonly h2CapitalUsd: number;
  /** H2 plant operating at the corridor's nameplate, USD/yr (pre-firming). */
  readonly h2OperatingUsd: number;
  /**
   * Electricity price the evaluated LCOH already pays, USD/MWh (solar-shaped).
   * The firm price is this times `firmPriceMultiplier`.
   */
  readonly shapedElectricityUsdPerMwh: number;
  /** Firm/round-the-clock price step over the shaped price (default 1.9). */
  readonly firmPriceMultiplier: number;
  /**
   * Electricity the H2 plant consumes per year, MWh. Used to price the firm
   * PPA step and the grid top-up.
   */
  readonly annualElectricityMwh: number;
  /** Grid price for the hybrid strategy, USD/MWh. */
  readonly gridUsdPerMwh: number;
  /** Grid emission factor, tCO2/MWh — carried into the corridor's ledger. */
  readonly gridEmissionFactorTco2PerMwh: number;
  /**
   * H2 buffer storage capital, USD per kg of storage capacity. Sized to
   * bridge the diurnal gap.
   */
  readonly bufferCapexUsdPerKgH2: number;
  /** H2 the plant must deliver per year, kg — sizes the buffer. */
  readonly annualH2Kg: number;
}

export interface FirmingOption {
  readonly strategy: FirmingStrategy;
  /** Added capital, USD (0 for purely operating strategies). */
  readonly capitalUsd: number;
  /** Added operating cost, USD/yr (0 for purely capital strategies). */
  readonly operatingUsdPerYear: number;
  /** Added CO2, tCO2/yr — non-zero only where grid power is imported. */
  readonly emissionsTco2PerYear: number;
  /** Annualised comparison basis used to pick the cheapest, USD/yr. */
  readonly annualisedUsd: number;
}

export interface FirmingResult {
  /** True when the evaluated site already meets the carrier's duty. */
  readonly satisfied: boolean;
  readonly evaluatedDuty: number;
  readonly requiredDuty: number;
  /** The multiple of extra energy/capacity firming must supply. */
  readonly dutyShortfallRatio: number;
  /** Every option, cheapest first. Empty when already satisfied. */
  readonly options: readonly FirmingOption[];
  /** The cheapest option, or null when already satisfied. */
  readonly chosen: FirmingOption | null;
}

/**
 * Hours of H2 buffer needed to ride through the non-generating part of a day
 * at the required duty. A solar site at 32% duty needs roughly two thirds of
 * the day covered; we size on the diurnal gap, not seasonal storage (which
 * is what makes this "buffer", not "storage").
 */
function bufferHours(evaluatedDuty: number, requiredDuty: number): number {
  const gap = Math.max(0, requiredDuty - evaluatedDuty);
  return gap * 24;
}

/**
 * Resolve the duty shortfall. Returns every priced strategy plus the cheapest,
 * on an annualised basis so capital- and operating-shaped options compare.
 *
 * `annualiseCapital` is the caller's capital recovery factor — the corridor
 * discounts on ITS timeline, so the comparison must use the corridor's own
 * annualisation rather than a rate invented here.
 */
export function resolveFirming(
  inputs: FirmingInputs,
  annualiseCapital: (capitalUsd: number) => number,
): FirmingResult {
  const { evaluatedDuty, requiredDuty } = inputs;
  if (!(requiredDuty > 0) || evaluatedDuty >= requiredDuty) {
    return {
      satisfied: true,
      evaluatedDuty,
      requiredDuty,
      dutyShortfallRatio: 1,
      options: [],
      chosen: null,
    };
  }

  // The plant must run `ratio`x more of the time than the resource allows.
  const ratio = requiredDuty / Math.max(evaluatedDuty, 1e-9);

  // 1. Buffer + oversize: build enough extra electrolysis and renewables to
  //    make the required energy inside the available hours, plus H2 storage
  //    to release it steadily. Capital-shaped.
  const oversizeCapitalUsd = inputs.h2CapitalUsd * (ratio - 1);
  const bufferKg = (inputs.annualH2Kg / 8760) * bufferHours(evaluatedDuty, requiredDuty);
  const bufferCapitalUsd = bufferKg * inputs.bufferCapexUsdPerKgH2;
  const bufferOversize: FirmingOption = {
    strategy: "buffer-oversize",
    capitalUsd: oversizeCapitalUsd + bufferCapitalUsd,
    // Oversized plant carries proportionally more fixed O&M.
    operatingUsdPerYear: inputs.h2OperatingUsd * (ratio - 1),
    emissionsTco2PerYear: 0,
    annualisedUsd: 0, // filled below
  };

  // 2. Firm PPA: buy round-the-clock power instead of solar-shaped. The step
  //    applies to the energy the plant already consumes. Operating-shaped.
  const firmStepUsdPerMwh =
    inputs.shapedElectricityUsdPerMwh * (inputs.firmPriceMultiplier - 1);
  const firmPpa: FirmingOption = {
    strategy: "firm-ppa",
    capitalUsd: 0,
    operatingUsdPerYear: inputs.annualElectricityMwh * firmStepUsdPerMwh,
    emissionsTco2PerYear: 0,
    annualisedUsd: 0,
  };

  // 3. Grid hybrid: the grid tops the plant up to the required duty. Cheap on
  //    capital, but it imports grid power and therefore grid CO2 — which the
  //    corridor's emissions ledger must carry.
  const topUpMwh = inputs.annualElectricityMwh * (ratio - 1);
  const gridHybrid: FirmingOption = {
    strategy: "grid-hybrid",
    capitalUsd: 0,
    operatingUsdPerYear: topUpMwh * inputs.gridUsdPerMwh,
    emissionsTco2PerYear: topUpMwh * inputs.gridEmissionFactorTco2PerMwh,
    annualisedUsd: 0,
  };

  const priced = [bufferOversize, firmPpa, gridHybrid].map((o) => ({
    ...o,
    annualisedUsd: annualiseCapital(o.capitalUsd) + o.operatingUsdPerYear,
  }));
  priced.sort((a, b) => a.annualisedUsd - b.annualisedUsd);

  return {
    satisfied: false,
    evaluatedDuty,
    requiredDuty,
    dutyShortfallRatio: ratio,
    options: priced,
    chosen: priced[0] ?? null,
  };
}
